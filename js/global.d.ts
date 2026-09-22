// index.htmlで<script>タグ(CDN)から読み込むライブラリのグローバル変数を、
// 型チェック(tsc --noEmit)のために宣言する。実行時には使われない。
//
// LeafletとChart.jsは詳細な型定義パッケージを導入せず、any型の最小限の宣言にとどめる。
// 型チェックの主目的は自前のデータ構造(Route/RoutePoint等)や関数シグネチャの誤りを
// 検出することであり、サードパーティライブラリの厳密な型付けは目的としない。

declare const L: any;
declare const Chart: any;
