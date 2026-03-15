# 📊 note Time Ledger

noteのダッシュボードに表示される記事の数値（ビュー・スキ・コメント）に**時間軸**を与え、各記事の伸び方を観測するChrome拡張機能です。

主目的は「観測」です。AI分析・バズ予測・テーマ提案などの機能は意図的に含んでいません。

## 特徴

- **ボタン一押しで記録** — アクセス状況ページで「📊 記録する」を押すだけ
- **前回差分が見える** — 一覧表で各記事の数値変化を確認
- **日次履歴** — 記事をクリックすると日ごとの推移を表示
- **完全ローカル保存** — データはブラウザ内（IndexedDB）のみ。外部送信なし
- **追加リクエストなし** — ページ上に表示済みの数値を読むだけ。noteのサーバーに負荷をかけません
- **エクスポート/インポート** — JSON形式でバックアップ・復元

## スクリーンショット

<!-- TODO: 実際の画面キャプチャに差し替え -->
> ポップアップ一覧 / 記録ボタン / 履歴表示

## インストール

### Chrome Web Store

[Chrome Web Store からインストール](https://chromewebstore.google.com/detail/lnphgbfmdefofjmnclkpceladnfnocmh)

### 手動インストール（開発者向け）

1. このリポジトリをクローンまたはダウンロード
   ```
   git clone https://github.com/cogitoworks/note-time-ledger.git
   ```
2. Chromeで `chrome://extensions` を開く
3. 右上の「デベロッパーモード」をオンにする
4. 「パッケージ化されていない拡張機能を読み込む」をクリック
5. クローンしたフォルダ（`manifest.json` がある階層）を選択

## 使い方

1. noteにログインし、[アクセス状況](https://note.com/sitesettings/stats) ページを開く
2. ページ右下の **「📊 記録する」** ボタンをクリック
3. ツールバーの **TL アイコン** をクリックしてポップアップを開く
4. 記事の行をクリックすると日次の履歴が表示される

毎日1回記録すれば、翌日から差分列に変化量が表示されます。

## ファイル構成

```
note-time-ledger/
├── manifest.json                  # MV3 マニフェスト
├── src/
│   ├── adapter/
│   │   └── note-dom-parser.js     # ★ DOM依存セレクタ集約（壊れたらここだけ修正）
│   ├── background/
│   │   └── service-worker.js      # 保存処理（拡張コンテキスト）
│   ├── content/
│   │   ├── content.js             # 記録ボタン・DOM読み取り
│   │   └── content.css            # ボタンのスタイル
│   ├── lib/
│   │   └── db.js                  # IndexedDB 操作
│   └── popup/
│       ├── popup.html             # 一覧表示 UI
│       └── popup.js               # 一覧表示ロジック
├── icons/
├── docs/
│   └── privacy-policy.html        # プライバシーポリシー
└── README.md
```

## noteのUI変更で壊れた場合

noteのDOM構造が変更されると、数値の取得が失敗することがあります。

**修正が必要なのは `src/adapter/note-dom-parser.js` の1ファイルだけです。**

ファイル冒頭の `SELECTORS` オブジェクトに、現在使用しているBEMクラス名が記載されています。DevToolsで実際のDOM構造を確認し、セレクタを書き換えてください。

現在のセレクタ（2026年3月確認）:

| 要素 | セレクタ |
|------|----------|
| テーブル | `table.o-statsContent__table` |
| タイトルリンク | `a.o-statsContent__tableTitleLink` |
| ビュー数 | `td.o-statsContent__tableStat--type_view` |
| コメント数 | `td.o-statsContent__tableStat--type_comment` |
| スキ数 | `td.o-statsContent__tableStat--type_suki` |

## 意図的に含めていない機能

| 機能 | 理由 |
|------|------|
| スパークライン | MVP後段。データ蓄積が先 |
| パターン自動分類 | 観測を超えて分析の領域に入る |
| 急上昇アラート | 閾値設計が分析領域。通知はユーザー行動を駆動する |
| 記事間ランキング | 「観測」から「編集判断」に目的が変質する |
| 他ユーザー比較 | 外部データ取得が必要。技術的制約と目的の両方に反する |
| AI分析全般 | 本ツールのスコープ外 |

## 技術情報

- Chrome拡張 Manifest V3
- 言語: JavaScript（JSDocアノテーション付き）
- ストレージ: IndexedDB
- 外部ライブラリ: なし
- 外部通信: なし
- 最小権限: `storage` + `note.com/sitesettings/stats*` のみ

## データ構造

```
Snapshot {
  articleId: string    // 記事ID（URLの /n/XXXXX 部分）
  title:     string
  url:       string
  views:     number
  likes:     number
  comments:  number
  capturedAt: string   // ISO 8601（取得時刻）
  date:      string    // YYYY-MM-DD（upsertキー）
}
```

同日・同記事は最新値で上書き（upsert）。日が変われば新レコード。

## 注意事項

- **非公式ツール**です。note株式会社が提供・推奨するものではありません
- noteのUI変更により動作しなくなる可能性があります
- 自分自身のダッシュボードの表示値を読み取る用途を想定しています

## ライセンス

MIT License
