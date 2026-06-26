# Database Audit

Audit date: 2026-06-12

## Tables used by the current app

- `users`: login, register, profile, balance, admin dashboard.
- `login_logs`: login security log and admin dashboard.
- `store_orders`: product purchase history for each user.
- `wallet_transactions`: balance movements for each user.

## Tables not referenced by the current app code

- `api_logs`: 0 rows.
- `categories`: 4 rows, but products/categories are currently hardcoded in frontend.
- `orders`: 0 rows, old schema that conflicts with the new purchase-history schema.
- `password_resets`: 0 rows.
- `product_images`: 0 rows.
- `products`: 0 rows, current frontend is not reading products from database.
- `settings`: 2 rows, not read by current code.
- `suppliers`: 0 rows.
- `support_tickets`: 0 rows.
- `user_sessions`: 0 rows.
- `verification_codes`: 0 rows.

## Recommended order

1. Run `database-optimize.sql` in Supabase SQL Editor.
2. Run `database-cleanup-unused.sql` only after confirming the unused tables are not needed for another admin tool or future feature.
3. Restart `server.js` after database changes.

`database-cleanup-unused.sql` creates an `archive_before_cleanup` schema and copies the unused tables there before dropping them from `public`.
