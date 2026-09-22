// DistanceCalculator: 距離(Haversine公式)、標高の平滑化、獲得標高・累積下降量を計算する。

/** @typedef {import('./types.js').RoutePoint} RoutePoint */
/** @typedef {"up" | "down" | null} SegmentDirection */

const EARTH_RADIUS_M = 6371000;

// 標高の平滑化(移動平均)の窓の半径。前後100m、計200mの窓で平均する。
export const SMOOTHING_WINDOW_RADIUS_M = 100;

// 上り/下りとして計上する最小の標高変化量。これ未満の変化はノイズとみなし無視する。
export const ASCENT_THRESHOLD_M = 3;

/**
 * 2点間の水平距離をHaversine公式で算出する(m)。
 * @param {{ lat: number, lng: number }} a
 * @param {{ lat: number, lng: number }} b
 */
function haversineDistance(a, b) {
  const toRadians = (/** @type {number} */ deg) => (deg * Math.PI) / 180;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * 各地点のdistanceFromStartを、先頭からの累積距離として再計算する(直接書き換える)。
 * @param {RoutePoint[]} points
 * @returns {number} 総距離(m)
 */
function computeCumulativeDistances(points) {
  let cumulative = 0;
  for (let i = 0; i < points.length; i += 1) {
    if (i > 0) {
      cumulative += haversineDistance(points[i - 1], points[i]);
    }
    points[i].distanceFromStart = cumulative;
  }
  return cumulative;
}

/**
 * 各地点の標高を、前後100m(窓幅200m)の移動平均で平滑化する。
 * 標高がnullの地点は平均の計算から除く。窓内に有効な標高が1つもなければnull。
 * pointsはdistanceFromStart昇順であることを前提に、2ポインタで計算する。
 * @param {RoutePoint[]} points
 * @returns {(number | null)[]}
 */
function computeSmoothedElevations(points) {
  const n = points.length;
  /** @type {(number | null)[]} */
  const smoothed = new Array(n).fill(null);

  let left = 0;
  let right = 0;
  let sum = 0;
  let count = 0;

  for (let i = 0; i < n; i += 1) {
    const center = points[i].distanceFromStart;

    while (right < n && points[right].distanceFromStart <= center + SMOOTHING_WINDOW_RADIUS_M) {
      const rightElevation = points[right].elevation;
      if (rightElevation !== null) {
        sum += rightElevation;
        count += 1;
      }
      right += 1;
    }
    while (left < right && points[left].distanceFromStart < center - SMOOTHING_WINDOW_RADIUS_M) {
      const leftElevation = points[left].elevation;
      if (leftElevation !== null) {
        sum -= leftElevation;
        count -= 1;
      }
      left += 1;
    }

    smoothed[i] = count > 0 ? sum / count : null;
  }

  return smoothed;
}

/**
 * 平滑化後の標高から、獲得標高・累積下降量と、区間ごとの上り/下り種別を求める。
 * 標高がnull(対象外エリア)を挟む区間はnullとする(断面図側で線を途切れさせる)。
 * @param {(number | null)[]} smoothedElevations
 * @param {number} thresholdM
 * @returns {{ totalAscent: number, totalDescent: number, segmentDirections: SegmentDirection[] }}
 */
function computeAscentDescent(smoothedElevations, thresholdM) {
  let totalAscent = 0;
  let totalDescent = 0;
  /** @type {SegmentDirection[]} */
  const segmentDirections = new Array(smoothedElevations.length).fill(null);

  /** @type {number | null} 上り/下り判定の基準標高 */
  let baseline = null;

  for (let i = 0; i < smoothedElevations.length; i += 1) {
    const current = smoothedElevations[i];

    if (i > 0) {
      const previous = smoothedElevations[i - 1];
      if (previous !== null && current !== null) {
        segmentDirections[i] = current - previous > 0 ? "up" : "down";
      }
    }

    if (current === null) {
      continue;
    }
    if (baseline === null) {
      baseline = current;
      continue;
    }

    const diff = current - baseline;
    if (Math.abs(diff) >= thresholdM) {
      if (diff > 0) {
        totalAscent += diff;
      } else {
        totalDescent += -diff;
      }
      baseline = current;
    }
  }

  return { totalAscent, totalDescent, segmentDirections };
}

/**
 * route.points配列を対象に、distanceFromStartを再計算し(直接書き換える)、
 * 総距離・獲得標高・累積下降量・平滑化後標高・区間ごとの上り/下り種別を算出する。
 * @param {RoutePoint[]} points
 * @returns {{
 *   totalDistance: number,
 *   totalAscent: number,
 *   totalDescent: number,
 *   smoothedElevations: (number | null)[],
 *   segmentDirections: SegmentDirection[],
 * }}
 */
export function computeRouteMetrics(points) {
  const totalDistance = computeCumulativeDistances(points);
  const smoothedElevations = computeSmoothedElevations(points);
  const { totalAscent, totalDescent, segmentDirections } = computeAscentDescent(
    smoothedElevations,
    ASCENT_THRESHOLD_M
  );

  return { totalDistance, totalAscent, totalDescent, smoothedElevations, segmentDirections };
}
