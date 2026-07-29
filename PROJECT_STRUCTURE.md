# DG_STORE structure

```txt
DG_STORE/
|
|-- assets/                         # Static frontend assets
|   |-- css/                        # CSS for HTML pages
|   `-- js/                         # Browser-side page logic
|       |-- admin.js                # admin.html controls
|       |-- cart.js                 # cart.html cart and checkout UI
|       |-- login.js                # login.html register/login UI
|       |-- nap-tien.js             # nap-tien.html QR, countdown, polling
|       |-- profile.js              # profile.html account, orders, wallet history
|       `-- password-recovery.js    # recovery request/reset UI
|
|-- product/                        # Product-specific public page assets
|   `-- sanpham/
|       `-- index.html
|
|-- fulfillment/                    # Multi-vendor fulfillment layer
|   |-- index.js                    # Fulfillment entrypoint
|   |-- vendorRouter.js             # Selects local stock or vendor adapter
|   |-- shopee68Adapter.js          # Shopee68 GET adapter
|   `-- botmmoAdapter.js            # BotMmo POST/JSON adapter
|
|-- routes/                         # Backend API routes by responsibility
|   |-- index.js                    # Mounts all routers
|   |-- health.js                   # GET /api/health
|   |-- auth.js                     # /api/register, /api/login, /api/logout, /api/setup-admin
|   |-- account.js                  # /api/me, profile, password, account history
|   |-- products.js                 # Public product API
|   |-- orders.js                   # Checkout, wallet deduction, fulfillment
|   |-- deposits.js                 # Deposit bills, Casso webhook/sync, wallet credit
|   |-- admin.js                    # Admin dashboard, inventory, vendors and analytics
|   |-- upload.js                   # Authenticated R2 image lifecycle
|   |-- support.js                  # Support tickets and warranty eligibility
|   `-- pages.js                    # HTML page routes
|
|-- middlewares/                    # Security/access filters
|   `-- authMiddleware.js           # JWT auth and admin guard
|
|-- services/                       # Shared backend business helpers
|   |-- storeService.js             # User presenters, wallet helpers, code/money/order helpers
|   |-- emailService.js             # Resend transactional email
|   `-- notificationBot.js          # Stateless operational notifications
|
|-- config/                         # Runtime configuration
|   |-- env.js                      # Validates and exports .env values
|   |-- supabase.js                 # Supabase service client
|   `-- casso.js                    # Casso axios client
|
|-- index.html / home.html          # Store home/product listing pages
|-- login.html                      # Login/register UI
|-- cart.html                       # Cart and checkout UI
|-- nap-tien.html                   # Deposit QR UI
|-- profile.html                    # User profile/history UI
|-- admin.html                      # Admin UI
|-- reset-password.html             # Account recovery UI
|
|-- .env                            # Secrets and runtime keys
|-- server.js                       # Express bootstrap only
|-- package.json                    # npm metadata/scripts
|-- package-lock.json               # npm dependency lockfile
|-- import_products.js              # Manual product import script
|-- config.example.js               # Example frontend config
|-- DATABASE_AUDIT.md               # Database notes
|-- database-multivendor-upgrade.sql
|-- README.md
|-- start-server.cmd
|-- start-server.bat
`-- node_modules/
```

## Route mount map

```txt
/api                  -> health.js, auth.js, account.js, orders.js, upload.js, support.js
/api/products         -> products.js
/api/deposits         -> deposits.js
/api/admin            -> admin.js
/webhook/...          -> deposits.js Casso router
/product/sanpham/:slug-> pages.js
/                     -> pages.js
```

## Request flow

```txt
Browser HTML/JS
  -> routes/*
    -> middlewares/authMiddleware.js when token/admin is required
    -> services/storeService.js for shared user/wallet/order helpers
    -> fulfillment/* when an order needs product delivery
    -> Supabase, Cloudflare R2, Resend, Casso and notification services
```
