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
python -m http.server 4174 --bind 127.0.0.1
```

Open:

```text
http://127.0.0.1:4174/index.html
```

## Deployment

This repository can be deployed to Vercel as a static site. No build command is required for the current prototype.

### GitLab CI to Vercel

Vercel's GitLab integration may require a paid plan. If it is unavailable, deploy through GitLab CI with Vercel CLI instead.

Set these GitLab CI/CD variables:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `VERCEL_PROJECT_PRODUCTION_URL`

The pipeline in `.gitlab-ci.yml` deploys the `main` branch to production.

Later phases will replace the current mock login and mock participant search with:

- Supabase Auth
- OpenAI API
- Supabase database
- Microsoft Graph user search
- Microsoft Graph calendar APIs
