# 美容室月次レポート自動配信ツール

カット専門店3店舗（桜台店・富士見台店・中村橋店）の月次レポートを  
Googleスプレッドシートのデータから自動生成し、LINEへ画像で送信するツールです。

## 仕組み（4パーツ）

```
GitHub Actions（毎月10日 7時）
    ↓
Google Sheets API でスプレッドシートからデータ取得
    ↓
Node.js: HTML生成 → Claude AIでコメント生成 → Playwright撮影
    ↓
Surge: 画像を公開URLへ → LINE Messaging API で全スタッフへ送信
```

## ファイル構成

```
scripts/
├── fetch-data.js          # スプレッドシートからデータ取得
├── generate-ai-comment.js # Claude APIでAIコメント生成
├── generate-html.js       # 3店舗分のHTMLレポート生成
├── screenshot.js          # PlaywrightでPNG撮影
└── post-line.js           # Surge公開 → LINE送信

.github/workflows/
└── monthly-report.yml     # GitHub Actions（毎月10日自動実行）

config/
└── service-account.json   # Googleサービスアカウント（.gitignore済み）
```

## セットアップ

### 1. 依存関係インストール

```bash
npm install
npx playwright install chromium
```

### 2. 環境変数の設定

```bash
cp .env.example .env
# .env を開いて各値を設定する
```

### 3. 手動実行テスト

```bash
npm run run-all
```

## GitHub Secrets

| シークレット名 | 値 |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | サービスアカウントJSONの中身（全文） |
| `SPREADSHEET_ID` | GoogleスプレッドシートのID |
| `ANTHROPIC_API_KEY` | Claude APIキー |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINEチャネルアクセストークン |
| `LINE_GROUP_ID` | LINE送信先グループID |
| `SURGE_LOGIN` | Surgeのメールアドレス |
| `SURGE_TOKEN` | Surgeのトークン |
| `SURGE_DOMAIN` | Surgeのドメイン（例: salon-report.surge.sh） |
