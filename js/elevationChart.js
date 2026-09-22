// ElevationChart: 累積距離×標高の断面図をChart.jsで描画する。
// 上り/下り区間を色分けし、標高がnullの区間は線を途切れさせる。

/** @typedef {import('./types.js').RoutePoint} RoutePoint */
/** @typedef {"up" | "down" | null} SegmentDirection */

const DEFAULT_LINE_COLOR = "#6b6b66";
const LINE_WIDTH = 2;

/**
 * CSSカスタムプロパティの色を取得する(取得できない場合はfallbackを返す)。
 * @param {string} varName
 * @param {string} fallback
 */
function getCssColor(varName, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return value || fallback;
}

/**
 * @param {string} canvasId
 */
export function createElevationChart(canvasId) {
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById(canvasId));
  const loadingIndicator = document.getElementById("loading-indicator");

  const ascentColor = getCssColor("--color-ascent", "#c1440e");
  const descentColor = getCssColor("--color-descent", "#2f6f9e");

  /** @type {SegmentDirection[]} */
  let currentSegmentDirections = [];

  const chart = new Chart(canvas, {
    type: "line",
    data: {
      datasets: [
        {
          data: /** @type {{ x: number, y: number | null }[]} */ ([]),
          borderColor: DEFAULT_LINE_COLOR,
          borderWidth: LINE_WIDTH,
          pointRadius: 0,
          spanGaps: false,
          segment: {
            borderColor: (/** @type {any} */ ctx) => segmentColor(currentSegmentDirections[ctx.p1DataIndex]),
          },
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      parsing: false,
      scales: {
        x: {
          type: "linear",
          title: { display: true, text: "累積距離 (km)" },
        },
        y: {
          title: { display: true, text: "標高 (m)" },
        },
      },
      plugins: {
        legend: { display: false },
      },
    },
  });

  /**
   * @param {SegmentDirection} direction
   */
  function segmentColor(direction) {
    if (direction === "up") {
      return ascentColor;
    }
    if (direction === "down") {
      return descentColor;
    }
    return DEFAULT_LINE_COLOR;
  }

  /**
   * 断面図を再描画する。標高は平滑化後の値(nullは区間を途切れさせる)を使う。
   * @param {RoutePoint[]} points
   * @param {(number | null)[]} smoothedElevations
   * @param {SegmentDirection[]} segmentDirections
   */
  function update(points, smoothedElevations, segmentDirections) {
    currentSegmentDirections = segmentDirections;
    chart.data.datasets[0].data = points.map((point, i) => ({
      x: point.distanceFromStart / 1000,
      y: smoothedElevations[i],
    }));
    chart.update();
  }

  /**
   * 標高取得中であることの表示を切り替える。
   * @param {boolean} isLoading
   */
  function setLoading(isLoading) {
    if (loadingIndicator) {
      loadingIndicator.hidden = !isLoading;
    }
  }

  return { update, setLoading };
}
