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

## Environment Variables

OpenAI is optional in local development. If `OPENAI_API_KEY` is not set, `/api/chat` returns a deterministic mock response.

```text
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.1
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

## Microsoft Login

This prototype uses Supabase Auth with the Azure OAuth provider.

Required setup:

1. Create a Supabase project and set `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
2. In Microsoft Entra ID, create an app registration.
3. Set supported account types to allow personal Microsoft accounts.
4. Add this redirect URI to the Microsoft app:

```text
https://<supabase-project-ref>.supabase.co/auth/v1/callback
```

5. In Supabase Auth Providers, enable Azure and set the Microsoft client ID and secret.
6. Add the app URL to Supabase Auth URL configuration. For local development:

```text
http://localhost:3000/auth/callback
```

For Vercel:

```text
https://<vercel-domain>/auth/callback
```

The chat API classifies input into:

- `small_talk`
- `schedule_request`

For `schedule_request`, it returns a structured `scheduleRequest` JSON object that can later be passed to calendar providers.

The current prototype also includes a programmatic candidate calculation flow:

```text
OpenAI structured scheduleRequest
-> outlook_mock_all_free availability JSON
-> calculateMeetingCandidates()
-> 3 candidate slots
```

Candidate calculation does not use AI. AI is only used to classify the message and convert the user's request into JSON.

Mentioned participant names are masked before calling OpenAI:

```text
@山田 太郎 -> ｛Aさん｝
@佐藤 花子 -> ｛Bさん｝
```

The server restores the original participant names after receiving the structured response. OpenAI does not receive selected participant names, emails, or IDs.

## Debug Logging

- Browser console: `/api/chat` response details such as `intent`, `scheduleRequest`, `calendarAvailability`, and `candidates`.
- Server/Vercel logs: masking and candidate-calculation steps with participant aliases only.
- Server/Vercel logs do not print selected participant names, emails, or IDs.

Later phases will replace the current mock login and mock participant search with:

- Supabase Auth
- OpenAI API
- Supabase database
- Microsoft Graph user search
- Microsoft Graph calendar APIs
