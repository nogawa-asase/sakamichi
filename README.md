# sakamichi

サイクリスト向けのルート標高断面図ツールです。
地図上をクリックしてルートを作ると、累積距離に対する標高の変化(上り・下り)を断面図で確認できます。
インストールや会員登録は不要で、ブラウザだけで使えます。

- 対象エリア: 日本国内
- 公開URL: https://nogawa-asase.github.io/sakamichi/

## 使い方

1. 地図上をクリックして、ルートの経由地点を順に追加します
2. 画面下部に標高断面図と、総距離・総上り・総下りが表示されます
3. 「1つ戻す」で直前の地点を削除、「リセット」でルートを最初から作り直せます

## ローカルでの開発

ES Modulesを使っているため、`index.html` を直接開くのではなく、簡易HTTPサーバー経由で開きます。

```bash
npx --yes serve -l 8000 .
# ブラウザで http://localhost:8000/ を開く
```

コード変更後はリントと型チェックを実行します。

```bash
npm install          # 初回のみ
npm run lint
npm run typecheck
```

設計・開発ルールは `docs/` 配下のドキュメントを参照してください。

## 出典

地図・標高データ: [国土地理院](https://maps.gsi.go.jp/development/ichiran.html)
