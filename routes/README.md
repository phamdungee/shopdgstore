# Backend routes

Moi file trong thu muc nay quan ly mot nhom endpoint rieng.

```txt
index.js     -> mount tat ca router vao Express app
health.js    -> GET /api/health
auth.js      -> POST /api/register, /api/login, /api/logout, /api/setup-admin
account.js   -> GET /api/me, /api/deposit-info, profile, password, history
products.js  -> GET /api/products, GET /api/products/:slug
orders.js    -> POST /api/orders
deposits.js  -> /api/deposits/* va webhook Casso
admin.js     -> /api/admin/*
tracking.js  -> /api/spx-track, /api/ghn-track, /api/watch va Telegram scheduler
pages.js     -> HTML page routes
```

Quy tac them endpoint moi:

```txt
Auth/user session       -> auth.js
Thong tin tai khoan     -> account.js
San pham public         -> products.js
Mua hang/checkout       -> orders.js
Nap tien/Casso          -> deposits.js
Quan tri                -> admin.js
Van don/Telegram bot    -> tracking.js
Trang HTML              -> pages.js
```
