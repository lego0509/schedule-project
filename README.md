# Schedule AI UI Prototype

仕事とプライベートの予定を考慮し、会議候補日をチャットで提示するAIスケジューラーのUIプロトタイプです。

## Current Scope

- 管理者用/利用者用ログイン画面のモック
- チャット形式の依頼UI
- @メンションによる参加者指定UI
- 同姓同名をメールアドレス/部署で区別する候補表示
- 会議候補カード表示
- スマホ/PC対応レイアウト
- PWA用manifest/service worker

## Local Preview

```bash
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:3000
```

## Deployment

This repository can be deployed to Vercel as a Next.js app.

Later phases will replace the current mock login and mock participant search with:

- Supabase Auth
- OpenAI API
- Supabase database
- Microsoft Graph user search
- Microsoft Graph calendar APIs
