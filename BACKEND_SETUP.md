# Backend setup

1. Run `migrations/20260722_backend_security.sql` in Supabase SQL Editor before deploying this version.
2. Copy `.env.example` to `.env` and fill secrets locally. Never commit `.env` or the Supabase service-role key.
3. In Cloudflare R2, create the bucket from `R2_BUCKET_NAME`, create an Object Read/Write API token scoped only to that bucket, attach a custom public domain, and set `R2_CUSTOM_DOMAIN` without `https://`.
4. In Resend, verify the sending domain and set `RESEND_FROM_EMAIL` to an address on that domain. `APP_BASE_URL` is the only reset-link origin; the API ignores client-provided redirect hosts.
5. Set `CORS_ALLOWED_ORIGINS` to a comma-separated list of production frontend origins. Localhost and Vercel preview hosts remain supported by the server policy.

## Security behavior

- Images are decoded and normalized to WebP. SVG/GIF and content whose bytes do not decode as an allowed image are rejected.
- R2 keys for avatars are namespaced by authenticated user. Metadata is stored in `image_assets`; delete checks ownership and removes both the R2 object and active database record.
- Profile avatar URLs must match an undeleted avatar owned by the authenticated user.
- Password-reset tokens are random, stored only as SHA-256 hashes, expire, and are single-use. Email enumeration is avoided with a generic response.
- Warranty eligibility is evaluated server-side from `completed_at` and closes exactly 48 hours after successful completion.
- The legacy parcel-tracking bot is no longer mounted or started. `services/notificationBot.js` is a separate, outbound-only operational notification module and stores no Telegram state on disk.

## API additions

- `POST /api/upload?folder=avatars` and `DELETE /api/uploads/:assetId`
- `POST /api/request-password-reset` and `POST /api/reset-password`
- `GET|POST /api/support/tickets`
- `GET /api/orders/:id/warranty-eligibility`
