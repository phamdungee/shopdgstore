# DG Store rebuild report

## Audit summary

- Stack: Node.js/Express backend with static HTML, CSS and browser JavaScript.
- Data/auth: custom `users` table in Supabase, bcrypt password hashes and JWT sessions; Supabase service role is server-only.
- Original upload: R2 put-object existed but accepted unsafe formats, allowed arbitrary avatar URLs, stored no asset ownership metadata and had no safe delete lifecycle.
- Original recovery: called Supabase Auth even though primary accounts use the custom `users.password_hash` flow.
- Original tracking: a large route, scheduler and Telegram state stored in local JSON files were coupled to `server.js`.
- Original UI/admin: several page-specific themes, custom SVG icon replacement and limited admin order analytics.

## Implemented

- R2 images are decoded and normalized to WebP, namespaced, recorded in `image_assets`, bound to their owner and deleted from R2 through an authenticated ownership check.
- Password recovery uses hashed, expiring, single-use tokens and Resend. The reset link is built only from server-controlled `APP_BASE_URL`.
- `reset-password.html` supports both requesting a reset email and completing a token reset.
- Legacy tracking page, route, frontend script, draft files and `bottracking/` state were removed. `services/notificationBot.js` is a separate stateless operational notification service.
- Storefront uses Font Awesome, a shared flat responsive layer, persistent light/dark mode, generated product category filters, customer support tickets and the 48-hour warranty action.
- Warranty eligibility uses `completed_at` and is revalidated by the server before a warranty ticket is created.
- Admin has compact product, inventory, user, supplier, order and announcement management plus revenue/profit and order-status charts.
- CORS now enforces the configured allowlist.
- `npm run lint`, `npm test` and `npm run build` run the repository validator for JavaScript syntax and local HTML asset references.

## Deployment order

1. Run `migrations/20260722_backend_security.sql` in the Supabase SQL Editor.
2. Copy `.env.example` values into the deployment secret manager and configure R2, Resend and allowed origins.
3. Follow `BACKEND_SETUP.md` for bucket permissions, the R2 public domain and Resend sender verification.
4. Run `npm run lint && npm test && npm run build` before deployment.

Never expose `SUPABASE_SERVICE_ROLE_KEY`, R2 secret keys, `RESEND_API_KEY`, JWT secrets or Telegram bot tokens in browser code.
