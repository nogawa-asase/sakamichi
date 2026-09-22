# 初回実装 設計

`requirements.md` の範囲を実装するための設計。コンポーネント構成・API設計・データモデルは
`docs/functional-design.md`、技術スタック・非機能要件は `docs/architecture.md` を正とし、
本書では実装に必要な粒度まで具体化する。

## 1. 実装アプローチ

- `docs/repository-structure.md` のファイル構成に従い、`js/` 配下をモジュール(機能)単位で分割する
- モジュール間は関数の引数・戻り値でデータを受け渡す(グローバル変数を作らない)
- `AppController`(`main.js`)が全体のフローを制御する。各モジュールは自分の責務だけを持ち、
  他モジュールを直接呼び出さない(呼び出しは`main.js`が仲介する)
- 実装順序は「データが流れる順」に進める(地図→補間→標高取得→計算→描画)ことで、
  各モジュールを単体で動作確認しながら進められるようにする

## 2. 変更・新規作成するコンポーネント

`docs/repository-structure.md` の構成に対応させる。

| ファイル | 対応コンポーネント | 責務 |
|---|---|---|
| `index.html` | - | ライブラリ読み込み(Leaflet/Chart.js、CDN+SRI)、画面のマークアップ、出典表示 |
| `css/style.css` | - | 全体レイアウト(地図・断面図・サマリー・ボタン) |
| `js/main.js` | AppController | 各モジュールの初期化・連携、世代番号の管理、取得中表示の切り替え |
| `js/mapView.js` | MapView | Leaflet初期化、クリックで経由地点追加、マーカー・線の描画、1つ戻す/リセットのUI操作 |
| `js/routeSampler.js` | RouteSampler | 経由地点間を50m間隔で補間し`RoutePoint`配列を生成 |
| `js/elevationService.js` | ElevationService | DEMタイルの取得(5A→5B→10Bフォールバック)・デコード・双線形補間・タイルキャッシュ |
| `js/distanceCalculator.js` | DistanceCalculator | Haversine距離計算、標高の平滑化、獲得標高/累積下降量の計算 |
| `js/elevationChart.js` | ElevationChart | Chart.jsでの断面図描画、上り/下り色分け、取得中表示 |
| `js/summaryPanel.js` | SummaryPanel | 総距離・総上り・総下りの表示 |

## 3. データ構造

`docs/functional-design.md` の型定義をJSDocで実装する。

```js
/**
 * @typedef {Object} Waypoint
 * @property {number} lat
 * @property {number} lng
 */

/**
 * @typedef {Object} RoutePoint
 * @property {number} lat
 * @property {number} lng
 * @property {number | null} elevation - 取得前 or DEM欠損はnull
 * @property {number} distanceFromStart - 起点からの距離(m)
 * @property {boolean} isWaypoint
 */

/**
 * @typedef {Object} Route
 * @property {Waypoint[]} waypoints
 * @property {RoutePoint[]} points
 * @property {number} totalDistance
 * @property {number} totalAscent
 * @property {number} totalDescent
 * @property {"map" | "gpx"} source
 */
```

### AppController内の状態

```js
/** @type {Route} */
let route = { waypoints: [], points: [], totalDistance: 0, totalAscent: 0, totalDescent: 0, source: "map" };

/** 世代番号。ルート変更のたびにインクリメントし、非同期処理の競合を防ぐ */
let generation = 0;
```

## 4. 主要な処理フロー

### 4.1 経由地点の追加(地図クリック)

1. `MapView`がクリックを検知し、`main.js`へ`{lat, lng}`を通知
2. `main.js`: `generation++`。`route.waypoints`に追加し、マーカー・線を描画
3. `main.js`: 新しい世代番号を記録した上で、追加された区間(直前のwaypoint→新waypoint)のみ
   `RouteSampler`に渡し補間点を生成 → `route.points`の末尾に追加(elevationはnull)
4. `main.js`: 取得中フラグを立て、`ElevationChart`に「取得中」表示を指示
5. `main.js`: `ElevationService`に新規追加分の`RoutePoint`配列を渡し、非同期で標高を取得
6. 取得完了時、記録しておいた世代番号 `!==` 現在の`generation`であれば結果を破棄して終了
7. 一致していれば`route.points`に標高を反映し、`DistanceCalculator`で
   累積距離・総距離・平滑化・獲得標高/累積下降量を再計算して`route`を更新
8. `ElevationChart`・`SummaryPanel`を再描画し、取得中フラグを解除

### 4.2 1つ戻す

1. `generation++`
2. `route.waypoints`の末尾を削除
3. `route.points`から、削除したwaypointに対応する区間(直前のwaypointより後ろ)をすべて削除
4. 残った`route.points`で`DistanceCalculator`を再計算し、再描画
   (新規の標高取得は発生しない。進行中の取得があれば手順6の世代番号チェックで自然に破棄される)

### 4.3 リセット

1. `generation++`
2. `route`を初期状態に戻し、地図上のマーカー・線、断面図、サマリーをクリア

### 4.4 標高が全タイルで無効値(海上・国外)の場合

- 該当`RoutePoint.elevation`は`null`のまま
- `ElevationChart`は`elevation`がnullの区間を線で結ばず途切れさせる
- `null`地点が1件でも発生したら、画面に「対象外エリアを含みます」等の通知を表示する
  (`main.js`が`route.points`をチェックして判定する)

## 5. DEMタイル処理の詳細設計(ElevationService)

`docs/functional-design.md`「API設計」の仕様を実装に落とし込む。

- **座標→タイル番号変換**: 緯度経度とズームレベルから`{z, x, y, pixelX, pixelY}`を計算する
  標準的なWebメルカトルのタイル座標式を使う
- **フォールバック順**: `dem5a_png`(z=15) → `dem5b_png`(z=15) → `dem_png`(z=14)
  - 各タイルはHTTP 404、またはピクセルが無効値(`x === 2^23`)の場合に次を試す
- **デコード**:
  1. `new Image()` に `crossOrigin = "anonymous"` を設定してタイルURLを読み込む
  2. オフスクリーンの`<canvas>`に描画し、`getImageData`でRGBAを取得
  3. 対象ピクセル周囲4点のRGBから、それぞれ標高値を算出(仕様の変換式)し、双線形補間する
     (4点のいずれかが無効値の場合はその点を補間から除外し、有効な点のみで按分する。
      全点が無効の場合は`null`とする)
- **キャッシュ**: `Map<string, Promise<ImageData>>` をキーを`"種別/z/x/y"`としてモジュール内に保持し、
  同一タイルの再取得・再デコードを防ぐ
- **同時取得数の制限**: 簡易的なキュー(同時実行数6)を設け、`fetch`の並列数を抑える
- **中断**: 初回実装では行わない(古い結果は世代番号チェックで破棄するため、
  通信自体の中断(AbortController)は次期以降の最適化とする)

## 6. 標高の平滑化・獲得標高計算の詳細設計(DistanceCalculator)

- **平滑化**: `route.points`を`distanceFromStart`順に並べ、各点について
  「距離が前後100m以内」に含まれる点の標高(nullを除く)の単純平均を算出する
- **上り/下り判定**: 平滑化後の標高列を先頭から走査し、直前の「基準標高」との差が
  閾値(3m)以上になった時点で差分を`totalAscent`/`totalDescent`に加算し、基準標高を更新する
- **色分け用の区間データ**: 隣り合う2点の平滑化後標高の差が正なら`"up"`、0以下なら`"down"`を
  区間ごとに持たせ、`ElevationChart`に渡す

## 7. 画面構成(index.html / style.css)

- 単一の`index.html`に以下のセクションを縦に配置する(`docs/functional-design.md`のワイヤーフレーム通り)
  - タイトル
  - 地図エリア(`<div id="map">`)
  - 断面図(`<canvas id="elevation-chart">`)、取得中インジケータ、対象外エリア通知欄
  - サマリー(総距離・総上り・総下り)、操作ボタン(リセット・1つ戻す)
  - フッター(国土地理院の出典表示)
- レイアウトはFlexboxで縦に積む。色・余白はCSSカスタムプロパティ(`:root`)で定義する

## 8. 開発環境構築

- `package.json`(devDependenciesのみ): `eslint`, `typescript`
- `npm scripts`: `lint`(`eslint .`), `typecheck`(`tsc --noEmit`)
- `eslint.config.js`: ES2015以降のブラウザ環境向け設定(`env: browser`, `sourceType: module`)
- `jsconfig.json`(または`tsconfig.json`+`checkJs: true`): `js/`配下を型チェック対象にする
- `.gitignore`に`node_modules/`を追加
- リポジトリルートに`.nojekyll`を追加

## 9. 影響範囲

- 新規プロジェクトのため既存コードへの影響はない
- `docs/`配下の各ドキュメントと齟齬が生じないよう、実装中に設計変更が必要になった場合は
  該当する`docs/`ファイルも合わせて更新する(CLAUDE.mdの「機能追加・修正時の手順」に準じる)
