// SummaryPanel: 総距離・獲得標高・累積下降量を表示する。

/** @typedef {import('./types.js').Route} Route */

export function createSummaryPanel() {
  const distanceElement = document.getElementById("summary-distance");
  const ascentElement = document.getElementById("summary-ascent");
  const descentElement = document.getElementById("summary-descent");

  /**
   * @param {Route} route
   */
  function update(route) {
    if (distanceElement) {
      distanceElement.textContent = `${(route.totalDistance / 1000).toFixed(1)} km`;
    }
    if (ascentElement) {
      ascentElement.textContent = `${Math.round(route.totalAscent)} m`;
    }
    if (descentElement) {
      descentElement.textContent = `${Math.round(route.totalDescent)} m`;
    }
  }

  return { update };
}
