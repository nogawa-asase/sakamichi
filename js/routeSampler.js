// RouteSampler: 経由地点間を直線で結び、サンプリング間隔ごとに補間点を生成する。

/** @typedef {import('./types.js').Waypoint} Waypoint */
/** @typedef {import('./types.js').RoutePoint} RoutePoint */

export const DEFAULT_SAMPLING_INTERVAL_M = 50;

const EARTH_RADIUS_M = 6371000;

// 補間点が終点(経由地点)とこの距離(m)未満まで近づいていたら、
// ほぼ同じ位置の点が重複しないよう補間点側を間引く。
const END_POINT_MERGE_THRESHOLD_M = 1;

/**
 * 2点間の水平距離をHaversine公式で算出する(m)。
 * @param {Waypoint} a
 * @param {Waypoint} b
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
 * fromとtoを結ぶ直線上で、fromからの割合(0〜1)の地点を求める(線形補間)。
 * @param {Waypoint} from
 * @param {Waypoint} to
 * @param {number} ratio
 * @returns {Waypoint}
 */
function interpolate(from, to, ratio) {
  return {
    lat: from.lat + (to.lat - from.lat) * ratio,
    lng: from.lng + (to.lng - from.lng) * ratio,
  };
}

/**
 * @param {Waypoint} waypoint
 * @param {boolean} isWaypoint
 * @returns {RoutePoint}
 */
function toRoutePoint(waypoint, isWaypoint) {
  // distanceFromStart はこの時点では確定できないため0を仮置きし、
  // DistanceCalculatorがroute.points全体を再計算する際に上書きする。
  return {
    lat: waypoint.lat,
    lng: waypoint.lng,
    elevation: null,
    distanceFromStart: 0,
    isWaypoint,
  };
}

/**
 * fromからtoまでの区間を、指定間隔(初期値50m)ごとに補間したRoutePoint配列を生成する。
 * from自体は含めない(呼び出し側のroute.pointsに既に存在する前提)。toは必ず含める。
 * @param {Waypoint} from
 * @param {Waypoint} to
 * @param {number} [intervalM]
 * @returns {RoutePoint[]}
 */
export function sampleSegment(from, to, intervalM = DEFAULT_SAMPLING_INTERVAL_M) {
  const segmentDistance = haversineDistance(from, to);

  if (segmentDistance === 0) {
    return [toRoutePoint(to, true)];
  }

  /** @type {RoutePoint[]} */
  const points = [];
  const stepCount = Math.floor(segmentDistance / intervalM);
  for (let i = 1; i <= stepCount; i += 1) {
    const ratio = (i * intervalM) / segmentDistance;
    points.push(toRoutePoint(interpolate(from, to, ratio), false));
  }

  const lastPoint = points[points.length - 1];
  if (lastPoint && haversineDistance(lastPoint, to) < END_POINT_MERGE_THRESHOLD_M) {
    points.pop();
  }
  points.push(toRoutePoint(to, true));

  return points;
}
