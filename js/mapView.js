// MapView: 国土地理院地図タイルの表示と、クリックによる経由地点の入力を担当する。
// 「1つ戻す」「リセット」の操作自体(ボタン)はAppController(main.js)が受け持ち、
// このモジュールはAppControllerからの指示で地図上のマーカー・線を更新する。

/** @typedef {import('./types.js').Waypoint} Waypoint */

const TILE_URL = "https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener noreferrer">国土地理院</a>';
const TILE_MAX_ZOOM = 18;

// 初期表示位置(東京駅付近)。ユーザーが最初にクリックする場所に依存しないよう、
// ある程度日本全体を見渡せるズームレベルにしておく。
const INITIAL_CENTER = /** @type {[number, number]} */ ([35.681236, 139.767125]);
const INITIAL_ZOOM = 10;

const ROUTE_LINE_COLOR = "#2f6f4f";
const ROUTE_LINE_WEIGHT = 3;

/**
 * @param {string} containerId
 * @param {{ onMapClick: (waypoint: Waypoint) => void }} callbacks
 */
export function createMapView(containerId, { onMapClick }) {
  const map = L.map(containerId).setView(INITIAL_CENTER, INITIAL_ZOOM);

  L.tileLayer(TILE_URL, {
    attribution: TILE_ATTRIBUTION,
    maxZoom: TILE_MAX_ZOOM,
  }).addTo(map);

  /** @type {any[]} Leafletのマーカー */
  const markers = [];
  /** @type {any[]} Leafletの線 */
  const lines = [];

  map.on("click", (/** @type {any} */ event) => {
    onMapClick({ lat: event.latlng.lat, lng: event.latlng.lng });
  });

  /**
   * 経由地点のマーカーを追加し、直前の経由地点があれば線で結ぶ。
   * @param {Waypoint} waypoint
   */
  function addWaypoint(waypoint) {
    const previousMarker = markers[markers.length - 1];
    const marker = L.marker([waypoint.lat, waypoint.lng]).addTo(map);
    markers.push(marker);

    if (previousMarker) {
      const line = L.polyline([previousMarker.getLatLng(), marker.getLatLng()], {
        color: ROUTE_LINE_COLOR,
        weight: ROUTE_LINE_WEIGHT,
      }).addTo(map);
      lines.push(line);
    }
  }

  /**
   * 直前に追加した経由地点のマーカーと、それに繋がる線を削除する。
   */
  function removeLastWaypoint() {
    const marker = markers.pop();
    if (marker) {
      map.removeLayer(marker);
    }

    const line = lines.pop();
    if (line) {
      map.removeLayer(line);
    }
  }

  /**
   * すべてのマーカー・線を削除する。
   */
  function reset() {
    for (const marker of markers.splice(0)) {
      map.removeLayer(marker);
    }
    for (const line of lines.splice(0)) {
      map.removeLayer(line);
    }
  }

  return { addWaypoint, removeLastWaypoint, reset };
}
