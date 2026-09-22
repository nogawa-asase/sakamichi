// ElevationService: 国土地理院DEMタイルから標高を取得する。
// タイルはPNG画像として配信され、ピクセルのRGB値から標高値を算出する。
// 5mメッシュ(5A→5B)を優先し、データがなければ10mメッシュにフォールバックする。

/** @typedef {import('./types.js').RoutePoint} RoutePoint */

const TILE_SIZE = 256;
const TILE_URL_TEMPLATE = "https://cyberjapandata.gsi.go.jp/xyz/{type}/{z}/{x}/{y}.png";

// 優先順(5A: 航空レーザー測量 → 5B: 写真測量 → 10B: 全国整備)。
const DEM_SOURCES = [
  { type: "dem5a_png", zoom: 15 },
  { type: "dem5b_png", zoom: 15 },
  { type: "dem_png", zoom: 14 },
];

// ピクセル値(x = R*2^16 + G*2^8 + B)がこの値なら「データなし」を表す。
const INVALID_PIXEL_VALUE = 2 ** 23;
const PIXEL_VALUE_OVERFLOW = 2 ** 24;
const ELEVATION_UNIT_M = 0.01;

const MAX_CONCURRENT_TILE_REQUESTS = 6;

/** @type {Map<string, Promise<Uint8ClampedArray | null>>} タイルキャッシュ(キー: "種別/z/x/y") */
const tileCache = new Map();

let activeTileRequests = 0;
/** @type {(() => void)[]} */
const tileRequestQueue = [];

/**
 * 同時タイル取得数を制限するための枠を確保する。
 * @returns {Promise<void>}
 */
function acquireTileRequestSlot() {
  if (activeTileRequests < MAX_CONCURRENT_TILE_REQUESTS) {
    activeTileRequests += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    tileRequestQueue.push(resolve);
  });
}

/**
 * 確保した枠を解放し、待機中のリクエストがあれば引き継ぐ。
 */
function releaseTileRequestSlot() {
  const next = tileRequestQueue.shift();
  if (next) {
    next();
  } else {
    activeTileRequests -= 1;
  }
}

/**
 * 緯度経度から、指定ズームレベルのタイル番号とタイル内のピクセル位置(連続値)を求める。
 * @param {number} lat
 * @param {number} lng
 * @param {number} zoom
 */
function latLngToTileCoordinate(lat, lng, zoom) {
  const latRad = (lat * Math.PI) / 180;
  const tileCountPerAxis = 2 ** zoom;
  const xTile = ((lng + 180) / 360) * tileCountPerAxis;
  const yTile =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * tileCountPerAxis;

  const tileX = Math.floor(xTile);
  const tileY = Math.floor(yTile);

  return {
    tileX,
    tileY,
    pixelX: (xTile - tileX) * TILE_SIZE,
    pixelY: (yTile - tileY) * TILE_SIZE,
  };
}

/**
 * ピクセルのRGB値から標高値(m)を算出する。データなしの場合はnull。
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {number | null}
 */
function pixelToElevation(r, g, b) {
  const x = r * 65536 + g * 256 + b;
  if (x === INVALID_PIXEL_VALUE) {
    return null;
  }
  if (x < INVALID_PIXEL_VALUE) {
    return x * ELEVATION_UNIT_M;
  }
  return (x - PIXEL_VALUE_OVERFLOW) * ELEVATION_UNIT_M;
}

/**
 * @param {string} url
 * @returns {Promise<HTMLImageElement | null>} 読み込めなければnull(404等)
 */
function loadImage(url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

/**
 * 画像をcanvasに描画し、RGBAのピクセル配列を取り出す。
 * @param {HTMLImageElement} image
 * @returns {Uint8ClampedArray | null}
 */
function decodeImageToPixels(image) {
  const canvas = document.createElement("canvas");
  canvas.width = TILE_SIZE;
  canvas.height = TILE_SIZE;
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }
  context.drawImage(image, 0, 0, TILE_SIZE, TILE_SIZE);
  return context.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data;
}

/**
 * @param {string} type
 * @param {number} z
 * @param {number} x
 * @param {number} y
 * @returns {Promise<Uint8ClampedArray | null>}
 */
async function fetchAndDecodeTile(type, z, x, y) {
  await acquireTileRequestSlot();
  try {
    const url = TILE_URL_TEMPLATE.replace("{type}", type)
      .replace("{z}", String(z))
      .replace("{x}", String(x))
      .replace("{y}", String(y));
    const image = await loadImage(url);
    if (!image) {
      return null;
    }
    return decodeImageToPixels(image);
  } finally {
    releaseTileRequestSlot();
  }
}

/**
 * タイルをキャッシュ経由で取得する(取得中のPromiseも共有し、二重取得を防ぐ)。
 * @param {string} type
 * @param {number} z
 * @param {number} x
 * @param {number} y
 * @returns {Promise<Uint8ClampedArray | null>}
 */
function getTilePixels(type, z, x, y) {
  const key = `${type}/${z}/${x}/${y}`;
  const cached = tileCache.get(key);
  if (cached) {
    return cached;
  }
  const promise = fetchAndDecodeTile(type, z, x, y);
  tileCache.set(key, promise);
  return promise;
}

/**
 * タイル内の指定ピクセル(整数座標)の標高値を求める。
 * @param {Uint8ClampedArray} pixels
 * @param {number} x
 * @param {number} y
 * @returns {number | null}
 */
function elevationAtPixel(pixels, x, y) {
  const index = (y * TILE_SIZE + x) * 4;
  return pixelToElevation(pixels[index], pixels[index + 1], pixels[index + 2]);
}

/**
 * 周囲4ピクセルから双線形補間で標高値を求める。
 * 無効な(データなしの)ピクセルは除外し、有効なピクセルのみで按分する。
 * 対象地点がタイルの端にある場合、隣接ピクセルはタイル内に収まるようクランプする
 * (タイルをまたいだ取得は行わない簡略化)。
 * @param {Uint8ClampedArray} pixels
 * @param {number} pixelXFloat
 * @param {number} pixelYFloat
 * @returns {number | null}
 */
function bilinearElevation(pixels, pixelXFloat, pixelYFloat) {
  const x0 = Math.min(Math.max(Math.floor(pixelXFloat), 0), TILE_SIZE - 1);
  const y0 = Math.min(Math.max(Math.floor(pixelYFloat), 0), TILE_SIZE - 1);
  const x1 = Math.min(x0 + 1, TILE_SIZE - 1);
  const y1 = Math.min(y0 + 1, TILE_SIZE - 1);
  const fx = pixelXFloat - x0;
  const fy = pixelYFloat - y0;

  const corners = [
    { elevation: elevationAtPixel(pixels, x0, y0), weight: (1 - fx) * (1 - fy) },
    { elevation: elevationAtPixel(pixels, x1, y0), weight: fx * (1 - fy) },
    { elevation: elevationAtPixel(pixels, x0, y1), weight: (1 - fx) * fy },
    { elevation: elevationAtPixel(pixels, x1, y1), weight: fx * fy },
  ];

  let weightedSum = 0;
  let weightTotal = 0;
  for (const corner of corners) {
    if (corner.elevation !== null) {
      weightedSum += corner.elevation * corner.weight;
      weightTotal += corner.weight;
    }
  }

  return weightTotal > 0 ? weightedSum / weightTotal : null;
}

/**
 * 1地点の標高を取得する。5A→5B→10Bの順にフォールバックし、
 * いずれのタイルにもデータがなければnullを返す。
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<number | null>}
 */
export async function fetchElevation(lat, lng) {
  for (const source of DEM_SOURCES) {
    const { tileX, tileY, pixelX, pixelY } = latLngToTileCoordinate(lat, lng, source.zoom);
    const pixels = await getTilePixels(source.type, source.zoom, tileX, tileY);
    if (!pixels) {
      continue;
    }
    const elevation = bilinearElevation(pixels, pixelX, pixelY);
    if (elevation !== null) {
      return elevation;
    }
  }
  return null;
}

/**
 * RoutePoint配列の各地点について標高を取得し、それぞれのオブジェクトの
 * elevationフィールドを直接書き換える(配列を作り直さない)。
 * @param {RoutePoint[]} points
 * @returns {Promise<void>}
 */
export async function fillElevations(points) {
  await Promise.all(
    points.map(async (point) => {
      point.elevation = await fetchElevation(point.lat, point.lng);
    })
  );
}
