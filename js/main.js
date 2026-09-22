// AppController: 各モジュールの初期化・連携を行うエントリーポイント。

import { createMapView } from "./mapView.js";
import { sampleSegment } from "./routeSampler.js";
import { fillElevations } from "./elevationService.js";
import { computeRouteMetrics } from "./distanceCalculator.js";
import { createElevationChart } from "./elevationChart.js";
import { createSummaryPanel } from "./summaryPanel.js";

/** @typedef {import('./types.js').Waypoint} Waypoint */
/** @typedef {import('./types.js').Route} Route */
/** @typedef {import('./types.js').RoutePoint} RoutePoint */

/** @type {Route} */
const route = {
  waypoints: [],
  points: [],
  totalDistance: 0,
  totalAscent: 0,
  totalDescent: 0,
  source: "map",
};

// 進行中の標高取得リクエスト数。取得結果はRoutePointオブジェクトを直接書き換えるため、
// 「1つ戻す」「リセット」でroute.pointsから参照が外れた区間の結果は、
// 後から返ってきても画面に反映されない(詳細はdesign.md「非同期処理と操作の競合」を参照)。
let pendingElevationRequests = 0;

// DistanceCalculatorが算出する、平滑化後の標高と区間ごとの上り/下り種別。
// routeの型(docs/functional-design.md)には含めず、断面図描画用の付随データとして保持する。
/** @type {(number | null)[]} */
let smoothedElevations = [];
/** @type {("up" | "down" | null)[]} */
let segmentDirections = [];

const undoButton = /** @type {HTMLButtonElement} */ (document.getElementById("undo-button"));
const resetButton = /** @type {HTMLButtonElement} */ (document.getElementById("reset-button"));
const outOfRangeNotice = document.getElementById("out-of-range-notice");

const mapView = createMapView("map", { onMapClick: handleAddWaypoint });
const elevationChart = createElevationChart("elevation-chart");
const summaryPanel = createSummaryPanel();

updateButtonState();
summaryPanel.update(route);

/**
 * @param {Waypoint} waypoint
 */
function handleAddWaypoint(waypoint) {
  const previousWaypoint = route.waypoints[route.waypoints.length - 1];
  route.waypoints.push(waypoint);
  mapView.addWaypoint(waypoint);

  /** @type {RoutePoint[]} */
  const newPoints = previousWaypoint
    ? sampleSegment(previousWaypoint, waypoint)
    : [
        {
          lat: waypoint.lat,
          lng: waypoint.lng,
          elevation: null,
          distanceFromStart: 0,
          isWaypoint: true,
        },
      ];
  route.points.push(...newPoints);

  updateButtonState();
  fetchElevationsFor(newPoints);

  // 距離/獲得標高の計算・断面図描画は後続タスクで実装する。
  console.log(
    "waypoint追加:",
    waypoint,
    "経由地点数:",
    route.waypoints.length,
    "補間後の地点数:",
    route.points.length
  );
}

/**
 * 新しく追加された区間の標高を非同期で取得する。
 * @param {RoutePoint[]} newPoints
 */
function fetchElevationsFor(newPoints) {
  setPendingElevationRequests(pendingElevationRequests + 1);
  fillElevations(newPoints)
    .then(() => {
      const nullCount = newPoints.filter((p) => p.elevation === null).length;
      console.log(`標高取得完了(${newPoints.length}点、うちデータなし${nullCount}点)`);
      recomputeRoute();
    })
    .catch((error) => {
      console.error("標高取得中にエラーが発生しました:", error);
    })
    .finally(() => {
      setPendingElevationRequests(pendingElevationRequests - 1);
    });
}

/**
 * 進行中の標高取得リクエスト数を更新し、取得中インジケータの表示に反映する。
 * @param {number} count
 */
function setPendingElevationRequests(count) {
  pendingElevationRequests = count;
  elevationChart.setLoading(pendingElevationRequests > 0);
}

/**
 * 現時点のroute.pointsをもとに、距離・獲得標高・累積下降量・平滑化後標高・
 * 区間ごとの上り/下り種別を再計算し、断面図を再描画する。
 */
function recomputeRoute() {
  const metrics = computeRouteMetrics(route.points);
  route.totalDistance = metrics.totalDistance;
  route.totalAscent = metrics.totalAscent;
  route.totalDescent = metrics.totalDescent;
  smoothedElevations = metrics.smoothedElevations;
  segmentDirections = metrics.segmentDirections;

  elevationChart.update(route.points, smoothedElevations, segmentDirections);
  summaryPanel.update(route);
  updateOutOfRangeNotice();

  console.log("ルート再計算:", {
    totalDistanceKm: (route.totalDistance / 1000).toFixed(2),
    totalAscentM: Math.round(route.totalAscent),
    totalDescentM: Math.round(route.totalDescent),
  });
}

/**
 * route.pointsに標高が取得できなかった地点(対象外エリア)が含まれる場合、通知を表示する。
 */
function updateOutOfRangeNotice() {
  if (!outOfRangeNotice) {
    return;
  }
  const hasOutOfRangePoint = route.points.some((point) => point.elevation === null);
  outOfRangeNotice.hidden = !hasOutOfRangePoint;
}

function handleUndo() {
  if (route.waypoints.length === 0) {
    return;
  }
  route.waypoints.pop();
  route.points = truncatePointsToWaypointCount(route.points, route.waypoints.length);
  mapView.removeLastWaypoint();
  recomputeRoute();
  updateButtonState();

  console.log("1つ戻す。経由地点数:", route.waypoints.length, "補間後の地点数:", route.points.length);
}

/**
 * 削除された経由地点に対応する補間点(直前の経由地点より後ろ)を切り捨てる。
 * @param {RoutePoint[]} points
 * @param {number} waypointCount 残す経由地点の数
 * @returns {RoutePoint[]}
 */
function truncatePointsToWaypointCount(points, waypointCount) {
  if (waypointCount === 0) {
    return [];
  }

  let waypointsSeen = 0;
  for (let i = 0; i < points.length; i += 1) {
    if (points[i].isWaypoint) {
      waypointsSeen += 1;
      if (waypointsSeen === waypointCount) {
        return points.slice(0, i + 1);
      }
    }
  }
  return points.slice();
}

function handleReset() {
  if (route.waypoints.length === 0) {
    return;
  }
  route.waypoints = [];
  route.points = [];
  route.totalDistance = 0;
  route.totalAscent = 0;
  route.totalDescent = 0;
  smoothedElevations = [];
  segmentDirections = [];
  mapView.reset();
  elevationChart.update(route.points, smoothedElevations, segmentDirections);
  summaryPanel.update(route);
  updateOutOfRangeNotice();
  updateButtonState();

  console.log("リセットしました");
}

function updateButtonState() {
  const hasWaypoints = route.waypoints.length > 0;
  undoButton.disabled = !hasWaypoints;
  resetButton.disabled = !hasWaypoints;
}

undoButton.addEventListener("click", handleUndo);
resetButton.addEventListener("click", handleReset);
