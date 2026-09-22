# リポジトリ構造定義書

## 1. 全体方針

ビルドツールを使わないプレーンJS/HTML/CSS構成のため、リポジトリの構造もシンプルに保つ。
GitHub Pagesはリポジトリルート(`main`ブランチ)をそのまま公開元として設定する。

## 2. フォルダ・ファイル構成

```
sakamichi/
├── index.html              # メイン画面(唯一のHTMLファイル)
├── css/
│   └── style.css           # 全体スタイル
├── js/
│   ├── main.js             # AppController。全体の初期化・各モジュールの連携
│   ├── mapView.js          # 地図表示・クリック入力(Leaflet制御)
│   ├── routeSampler.js     # 経由地点間の補間点生成
│   ├── elevationService.js # 国土地理院 DEMタイルの取得・デコード・キャッシュ
│   ├── distanceCalculator.js # 距離(Haversine公式)・標高の平滑化・獲得標高/累積下降量の計算
│   ├── elevationChart.js   # 断面図描画(Chart.js制御)
│   ├── summaryPanel.js     # サマリー表示(総距離・獲得標高・累積下降量)
│   └── gpxParser.js        # GPXファイルのパース(次期実装)
├── docs/                   # 永続的ドキュメント(本ドキュメント群)
│   ├── product-requirements.md
│   ├── functional-design.md
│   ├── architecture.md
│   ├── repository-structure.md
│   ├── development-guidelines.md
│   └── glossary.md
├── .steering/               # 作業単位のステアリングファイル
│   └── [YYYYMMDD]-[開発タイトル]/
│       ├── requirements.md
│       ├── design.md
│       └── tasklist.md
├── package.json             # 開発用ツール(ESLint・TypeScript)とnpmスクリプトの定義
├── package-lock.json
├── eslint.config.js         # ESLint設定
├── jsconfig.json            # 型チェック設定(checkJs)
├── .nojekyll                # GitHub PagesのJekyll処理を無効化
├── .gitignore               # node_modules 等を除外
└── README.md                # プロジェクト概要、公開URL、使い方
```

## 3. ディレクトリの役割

| ディレクトリ/ファイル | 役割 |
|---|---|
| `index.html` | サービスの唯一のエントリーポイント(SPA的な1ページ構成) |
| `css/` | スタイルシート一式。今後増える場合も用途別にファイルを分ける想定 |
| `js/` | 機能ごとに分割したJavaScriptモジュール。`<script type="module">` で読み込む |
| `docs/` | プロダクト要求・設計・技術仕様など恒久的なドキュメント |
| `.steering/` | 個別の開発作業(機能追加・修正)ごとの一時的なドキュメント |
| `README.md` | リポジトリ訪問者向けのプロジェクト概要・公開URL・簡単な使い方 |
| `package.json` ほか設定ファイル | 開発時のリント・型チェック専用。公開されるアプリの動作には使わない |

## 4. ファイル配置ルール

- HTMLファイルは `index.html` の1つのみとし、複数画面が必要になった場合のみ
  `docs/functional-design.md` を更新のうえ追加を検討する
- JavaScriptはモジュール(機能)単位で `js/` 配下にファイルを分割し、
  1ファイルが肥大化しすぎないようにする
- 外部ライブラリ(Leaflet、Chart.js)はCDN経由で `index.html` から読み込み、
  リポジトリ内にライブラリ本体は含めない
- `node_modules` は開発ツール(ESLint・TypeScript)専用とし、`.gitignore` で除外してコミットしない
- 画像や地図アイコン等の静的アセットが必要な場合は `assets/` フォルダを新設する
- GitHub Pagesの公開設定は「リポジトリルート(`main`ブランチ)」を用いる
  (`/docs` フォルダを公開用に使う場合は、永続的ドキュメント用の `docs/` と
  名前が衝突するため、その際は別名を検討する)
- リポジトリルートを公開するため、`docs/` のMarkdownも公開される点に留意する
  (`.steering/` などドットで始まるフォルダも `.nojekyll` 配置時は公開対象となる)
