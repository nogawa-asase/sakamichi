// 共有の型定義(JSDoc)。ランタイムのコードは持たない。
export {};

/**
 * ユーザーが地図クリック(またはGPX)で入力した経由地点。
 * @typedef {Object} Waypoint
 * @property {number} lat
 * @property {number} lng
 */

/**
 * 断面図を構成する1地点。経由地点と、その間を補間した地点の両方を含む。
 * @typedef {Object} RoutePoint
 * @property {number} lat
 * @property {number} lng
 * @property {number | null} elevation 標高(m)。取得前、またはDEM欠損時はnull
 * @property {number} distanceFromStart 起点からの累積距離(m)
 * @property {boolean} isWaypoint 経由地点そのものであればtrue、補間点であればfalse
 */

/**
 * ルート全体。
 * @typedef {Object} Route
 * @property {Waypoint[]} waypoints
 * @property {RoutePoint[]} points
 * @property {number} totalDistance
 * @property {number} totalAscent
 * @property {number} totalDescent
 * @property {"map" | "gpx"} source
 */
