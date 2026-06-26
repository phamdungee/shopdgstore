/* ═══════════════════════════════════════════════════════
   DG Store — SVG Custom Icon Mappings & Replacer
   ═══════════════════════════════════════════════════════ */

(function () {
  const SVG_ICONS = {
    // Brand Logo (fa-bolt): Hexagon lightning bolt
    'fa-bolt': `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad-bolt" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#6366f1" />
            <stop offset="50%" stop-color="#8b5cf6" />
            <stop offset="100%" stop-color="#ec4899" />
          </linearGradient>
        </defs>
        <path d="M12 2L3 7v10l9 5 9-5V7l-9-5zm-1 14.5v-3.5H8.5l4.5-7.5v3.5h2.5l-4.5 7.5z" fill="url(#grad-bolt)" />
      </svg>
    `,

    // Home (fa-house): Abstract house with outline
    'fa-house': `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad-house" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#22d3ee" />
            <stop offset="100%" stop-color="#06b6d4" />
          </linearGradient>
        </defs>
        <path d="M12 3L3 10.5V20c0 1.1.9 2 2 2h5v-6h4v6h5c1.1 0 2-.9 2-2v-9.5L12 3zm6 17h-2v-6H8v6H6v-8.3l6-5 6 5V20z" fill="url(#grad-house)" />
      </svg>
    `,

    // Products (fa-layer-group): Stacked 3D Cubes
    'fa-layer-group': `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad-layer" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#6366f1" />
            <stop offset="100%" stop-color="#8b5cf6" />
          </linearGradient>
        </defs>
        <path d="M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27-7.38 5.74zM12 16L4.63 10.27 3 11.8l9 7 9-7-1.63-1.53L12 16zm0-11.91L3 11.09l9 7 9-7-9-7z" fill="url(#grad-layer)" />
      </svg>
    `,

    // Shopee (fa-bag-shopping): Glowing shopping bag
    'fa-bag-shopping': `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad-shopee" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#ff782f" />
            <stop offset="100%" stop-color="#ee4d2d" />
          </linearGradient>
        </defs>
        <path d="M19 6h-2c0-2.76-2.24-5-5-5S7 3.24 7 6H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-7-3c1.66 0 3 1.34 3 3H9c0-1.66 1.34-3 3-3zm7 17H5V8h2v2c0 .55.45 1 1 1s1-.45 1-1V8h6v2c0 .55.45 1 1 1s1-.45 1-1V8h2v12z" fill="url(#grad-shopee)" />
      </svg>
    `,

    // Shopee alternative (fa-store)
    'fa-store': `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad-store" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#ff782f" />
            <stop offset="100%" stop-color="#ee4d2d" />
          </linearGradient>
        </defs>
        <path d="M20 4H4v2h16V4zm1 10V8l-1-3H4L3 8v6c0 .55.45 1 1 1h1v5c0 .55.45 1 1 1h8c.55 0 1-.45 1-1v-5h4c.55 0 1-.45 1-1zm-10 6H7v-5h4v5zm8-7H5V9h14v4z" fill="url(#grad-store)" />
      </svg>
    `,

    // Social (fa-thumbs-up): Thumbs up with custom heart pathing
    'fa-thumbs-up': `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad-thumbs" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#ec4899" />
            <stop offset="100%" stop-color="#8b5cf6" />
          </linearGradient>
        </defs>
        <path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z" fill="url(#grad-thumbs)" />
      </svg>
    `,

    // Orders (fa-box): Isometric package box
    'fa-box': `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad-box" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#8b5cf6" />
            <stop offset="100%" stop-color="#ec4899" />
          </linearGradient>
        </defs>
        <path d="M12 2.69L3.5 6.64v8.72L12 21.31l8.5-5.95V6.64L12 2.69zM12 4.7l6.5 3.03-3.25 2.27-6.5-3.03L12 4.7zM5.5 8.2l5.5 2.56v7.71l-5.5-3.85V8.2zm13 3.86l-5.5 3.85v-7.71l5.5-2.56v6.42z" fill="url(#grad-box)" />
      </svg>
    `,

    // Deposit (fa-credit-card): Scanning credit card
    'fa-credit-card': `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad-card" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#10b981" />
            <stop offset="100%" stop-color="#06b6d4" />
          </linearGradient>
        </defs>
        <path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2zM6 14h6v2H6v-2z" fill="url(#grad-card)" />
      </svg>
    `,

    // Deposit alternate (fa-wallet)
    'fa-wallet': `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad-wallet" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#10b981" />
            <stop offset="100%" stop-color="#06b6d4" />
          </linearGradient>
        </defs>
        <path d="M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" fill="url(#grad-wallet)" />
      </svg>
    `,

    // Profile (fa-user): Avatar circle
    'fa-user': `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad-user" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#06b6d4" />
            <stop offset="100%" stop-color="#8b5cf6" />
          </linearGradient>
        </defs>
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="url(#grad-user)" />
      </svg>
    `,

    // Policy (fa-file-contract): Shield document
    'fa-file-contract': `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad-policy" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#f59e0b" />
            <stop offset="100%" stop-color="#fbbf24" />
          </linearGradient>
        </defs>
        <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14H7v-2h5v2zm4-4H7v-2h9v2zm0-4H7V7h9v2z" fill="url(#grad-policy)" />
      </svg>
    `,

    // Support (fa-headset): Headset bubble
    'fa-headset': `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad-headset" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#06b6d4" />
            <stop offset="100%" stop-color="#6366f1" />
          </linearGradient>
        </defs>
        <path d="M12 2c-4.97 0-9 4.03-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-4v8h3c1.66 0 3-1.34 3-3v-7c0-4.97-4.03-9-9-9zm-7 11h2v6H5v-6zm14 6h-2v-6h2v6z" fill="url(#grad-headset)" />
      </svg>
    `,

    // Ticket (fa-ticket)
    'fa-ticket': `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad-ticket" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#06b6d4" />
            <stop offset="100%" stop-color="#6366f1" />
          </linearGradient>
        </defs>
        <path d="M22 10V6c0-1.11-.9-2-2-2H4c-1.1 0-1.99.9-1.99 2v4c1.1 0 1.99.9 1.99 2s-.89 2-2 2v4c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2v-4c-1.1 0-2-.9-2-2s.9-2 2-2zm-9 7.5h-2v-2h2v2zm0-4.5h-2v-2h2v2zm0-4.5h-2v-2h2v2z" fill="url(#grad-ticket)" />
      </svg>
    `,

    // Cart (fa-cart-shopping): 3D cart
    'fa-cart-shopping': `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad-cart" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#ec4899" />
            <stop offset="100%" stop-color="#8b5cf6" />
          </linearGradient>
        </defs>
        <path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z" fill="url(#grad-cart)" />
      </svg>
    `,

    // Login (fa-right-to-bracket): Door arrow
    'fa-right-to-bracket': `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad-login" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#6366f1" />
            <stop offset="100%" stop-color="#06b6d4" />
          </linearGradient>
        </defs>
        <path d="M11 7L9.6 8.4l3.6 3.6H2v2h11.2l-3.6 3.6L11 17l6-6-6-6zm11-4H10c-1.1 0-2 .9-2 2v4h2V5h12v14H10v-4H8v4c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" fill="url(#grad-login)" />
      </svg>
    `,

    // Search (fa-magnifying-glass): Lens glow
    'fa-magnifying-glass': `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad-search" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#06b6d4" />
            <stop offset="100%" stop-color="#ffffff" />
          </linearGradient>
        </defs>
        <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" fill="url(#grad-search)" />
      </svg>
    `,

    // Admin Shield (fa-shield-halved): Crown shield
    'fa-shield-halved': `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad-shield" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#f59e0b" />
            <stop offset="100%" stop-color="#ec4899" />
          </linearGradient>
        </defs>
        <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" fill="url(#grad-shield)" />
      </svg>
    `,

    // Chevron down (fa-chevron-down)
    'fa-chevron-down': `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" fill="currentColor" />
      </svg>
    `,

    // Bars/Hamburger (fa-bars)
    'fa-bars': `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" fill="currentColor" />
      </svg>
    `,

    // Close X (fa-xmark)
    'fa-xmark': `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" fill="currentColor" />
      </svg>
    `,

    // Arrow Left (fa-arrow-left)
    'fa-arrow-left': `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" fill="currentColor" />
      </svg>
    `,

    // Trash can (fa-trash)
    'fa-trash': `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad-trash" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#ef4444" />
            <stop offset="100%" stop-color="#ff782f" />
          </linearGradient>
        </defs>
        <path d="M16 9v10H8V9h8zm-1.5-6h-5l-1 1H5v2h14V4h-3.5l-1-1zM18 7H6v12c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7z" fill="url(#grad-trash)" />
      </svg>
    `,

    // Plus sign (fa-plus)
    'fa-plus': `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" fill="currentColor" />
      </svg>
    `,

    // Star rating (fa-star)
    'fa-star': `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad-star" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#f59e0b" />
            <stop offset="100%" stop-color="#fef08a" />
          </linearGradient>
        </defs>
        <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" fill="url(#grad-star)" />
      </svg>
    `,

    // Circle Check success indicator (fa-circle-check)
    'fa-circle-check': `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad-check" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#10b981" />
            <stop offset="100%" stop-color="#34d399" />
          </linearGradient>
        </defs>
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill="url(#grad-check)" />
      </svg>
    `,

    // Simple check mark (fa-check)
    'fa-check': `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="currentColor" />
      </svg>
    `,

    // Fire flame outline (fa-fire)
    'fa-fire': `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad-fire" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#ff5722" />
            <stop offset="100%" stop-color="#ef4444" />
          </linearGradient>
        </defs>
        <path d="M12 2.69c.04.59-.06 1.34-.31 1.98-.59 1.54-1.85 2.76-2.69 4.25-.85 1.51-1.07 3.32-.4 4.96.65 1.6 2.05 2.8 3.75 3.19 1.77.41 3.71-.16 4.79-1.63 1.09-1.48 1.13-3.62.15-5.18-.32-.51-.83-.93-1.11-1.48-.68-1.32-.39-3.08.68-4.14.04-.04.09-.07.13-.11.45.69.83 1.46.99 2.27.35 1.75.05 3.65-1.1 5.03-1.12 1.35-3.04 1.87-4.69 1.25-1.36-.51-2.18-1.92-2-3.37.15-1.22.84-2.31 1.42-3.37.55-1.01.86-2.12.83-3.26-.01-.17-.08-.34-.14-.5-.12.33-.26.65-.41.97z" fill="url(#grad-fire)" />
      </svg>
    `,

    // Gear outline (fa-user-gear, fa-gear, fa-cog)
    'fa-gear': `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" fill="currentColor" />
      </svg>
    `,

    'fa-user-gear': `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad-usergear" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#94a3b8" />
            <stop offset="100%" stop-color="#6366f1" />
          </linearGradient>
        </defs>
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h9.5c-.32-.61-.5-1.29-.5-2 0-1.86.84-3.52 2.16-4.64L12 14zm8 1.4c-.09 0-.17.01-.26.02-.24-.51-.62-.94-1.09-1.24l.39-.58c.07-.11.04-.25-.06-.32l-1.3-.87c-.11-.07-.25-.04-.32.06l-.39.58c-.37-.08-.76-.08-1.12 0l-.39-.58c-.07-.11-.21-.14-.32-.06l-1.3.87c-.11.07-.14.21-.06.32l.39.58c-.47.3-.85.73-1.09 1.24-.09-.01-.17-.02-.26-.02-.39 0-.7.31-.7.7v1.73c0 .39.31.7.7.7.09 0 .17-.01.26-.02.24.51.62.94 1.09 1.24l-.39.58c-.07.11-.04.25.06.32l1.3.87c.11.07.25.04.32-.06l.39-.58c.37.08.76.08 1.12 0l.39.58c.07.11.21.14.32.06l1.3-.87c.11-.07.14-.21.06-.32l-.39-.58c.47-.3.85-.73 1.09-1.24.09.01.17.02.26.02.39 0 .7-.31.7-.7v-1.73c0-.39-.31-.7-.7-.7zm-3 4.1c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" fill="url(#grad-usergear)" />
      </svg>
    `,

    // Fast moving truck (fa-truck-fast)
    'fa-truck-fast': `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad-truck" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#3b82f6" />
            <stop offset="100%" stop-color="#06b6d4" />
          </linearGradient>
        </defs>
        <path d="M20 8h-3V4H4c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm12.5 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM15 12V9h3.56l2.25 3H15z" fill="url(#grad-truck)" />
      </svg>
    `,

    // History sweep / Clock (fa-clock-rotate-left, fa-history)
    'fa-clock-rotate-left': `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad-clock" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#06b6d4" />
            <stop offset="100%" stop-color="#8b5cf6" />
          </linearGradient>
        </defs>
        <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.25 2.52.75-1.23-3.5-2.08V8h-1.5z" fill="url(#grad-clock)" />
      </svg>
    `,

    'fa-spinner': `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
      </svg>
    `,

    // Eye visible/hide (fa-eye)
    'fa-eye': `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" fill="currentColor" />
      </svg>
    `,

    // Paste clipboard (fa-paste)
    'fa-paste': `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M19 2h-4.18C14.4.84 13.3 0 12 0c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm7 18H5V4h2v3h10V4h2v16z" fill="currentColor" />
      </svg>
    `,

    // Google social icon (fa-google)
    'fa-google': `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22c-.62-.63-1.07-1.38-1.37-2.21l3.18-2.46z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
      </svg>
    `,

    // GitHub social icon (fa-github)
    'fa-github': `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.577.688.479C19.138 20.162 22 16.418 22 12c0-5.523-4.477-10-10-10z" fill="currentColor" />
      </svg>
    `,

    // Gauge dashboard (fa-gauge-high)
    'fa-gauge-high': `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad-gauge" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#f59e0b" />
            <stop offset="100%" stop-color="#ec4899" />
          </linearGradient>
        </defs>
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" fill="url(#grad-gauge)" />
      </svg>
    `,

    // Circle info (fa-circle-info)
    'fa-circle-info': `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" fill="currentColor" />
      </svg>
    `,

    // Bell notification (fa-bell)
    'fa-bell': `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad-bell" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#fbbf24" />
            <stop offset="100%" stop-color="#f59e0b" />
          </linearGradient>
        </defs>
        <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" fill="url(#grad-bell)" />
      </svg>
    `,

    // Chevron up (fa-chevron-up)
    'fa-chevron-up': `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6 1.41 1.41z" fill="currentColor" />
      </svg>
    `,

    // Arrow Right (fa-arrow-right)
    'fa-arrow-right': `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" fill="currentColor" />
      </svg>
    `
  };

  // Assign alternates mapping for variants (e.g. products icons / various ratings / secondary styles)
  SVG_ICONS['fa-cubes'] = SVG_ICONS['fa-layer-group'];
  SVG_ICONS['fa-receipt'] = SVG_ICONS['fa-box'];
  SVG_ICONS['fa-users'] = SVG_ICONS['fa-user'];
  SVG_ICONS['fa-circle-check'] = SVG_ICONS['fa-circle-check'];
  SVG_ICONS['fa-scale-balanced'] = SVG_ICONS['fa-file-contract'];
  SVG_ICONS['fa-shield-heart'] = SVG_ICONS['fa-shield-halved'];
  SVG_ICONS['fa-cart-plus'] = SVG_ICONS['fa-cart-shopping'];
  SVG_ICONS['fa-cart-arrow-down'] = SVG_ICONS['fa-cart-shopping'];
  SVG_ICONS['fa-tv'] = SVG_ICONS['fa-layer-group'];
  SVG_ICONS['fa-robot'] = SVG_ICONS['fa-bolt'];
  SVG_ICONS['fa-palette'] = SVG_ICONS['fa-bolt'];
  SVG_ICONS['fa-border-all'] = SVG_ICONS['fa-house'];
  SVG_ICONS['fa-book-open'] = SVG_ICONS['fa-file-contract'];

  // Tracking alias mappings
  SVG_ICONS['fa-hand'] = SVG_ICONS['fa-user'];
  SVG_ICONS['fa-warehouse'] = SVG_ICONS['fa-box'];
  SVG_ICONS['fa-motorcycle'] = SVG_ICONS['fa-truck-fast'];
  SVG_ICONS['fa-rotate-left'] = SVG_ICONS['fa-clock-rotate-left'];
  SVG_ICONS['fa-sync'] = SVG_ICONS['fa-clock-rotate-left'];
  SVG_ICONS['fa-truck'] = SVG_ICONS['fa-truck-fast'];
  SVG_ICONS['fa-tag'] = SVG_ICONS['fa-ticket'];
  SVG_ICONS['fa-clock'] = SVG_ICONS['fa-clock-rotate-left'];
  SVG_ICONS['fa-user-tag'] = SVG_ICONS['fa-user'];
  SVG_ICONS['fa-circle-question'] = SVG_ICONS['fa-circle-info'];
  SVG_ICONS['fa-circle-dot'] = SVG_ICONS['fa-circle-info'];
  SVG_ICONS['fa-truck-ramp-box'] = SVG_ICONS['fa-truck-fast'];
  SVG_ICONS['fa-copy'] = SVG_ICONS['fa-paste'];

  // Portal mappings
  SVG_ICONS['fa-right-from-bracket'] = SVG_ICONS['fa-right-to-bracket'];
  SVG_ICONS['fa-user-plus'] = SVG_ICONS['fa-user'];
  SVG_ICONS['fa-user-shield'] = SVG_ICONS['fa-shield-halved'];
  SVG_ICONS['fa-grip'] = SVG_ICONS['fa-bars'];

  window.SVG_ICONS = SVG_ICONS;

  // Replace Font Awesome tag helper function
  window.replaceIcons = function (container = document) {
    const selector = 'i[class*="fa-"]';
    const elements = container.querySelectorAll(selector);

    elements.forEach(i => {
      // Find the specific fa-* icon class from classList
      const faClass = Array.from(i.classList).find(c => 
        c.startsWith('fa-') && 
        c !== 'fa-solid' && 
        c !== 'fa-regular' && 
        c !== 'fa-brands' && 
        c !== 'fa-spin' && 
        c !== 'fa-beat'
      );

      if (faClass && SVG_ICONS[faClass]) {
        const span = document.createElement('span');
        
        // Inherit animation styles from target classes or Font Awesome styles
        let animationClass = 'sk-icon-bounce';
        if (i.classList.contains('fa-spin') || faClass === 'fa-spinner') {
          animationClass = 'sk-icon-spin';
        } else if (faClass === 'fa-bolt') {
          animationClass = 'sk-icon-rotate';
        } else if (faClass === 'fa-cart-shopping' || faClass === 'fa-thumbs-up') {
          animationClass = 'sk-icon-pulse';
        } else if (faClass === 'fa-credit-card') {
          animationClass = 'sk-icon-scan';
        }

        // Apply classes
        span.className = `sk-icon md ${animationClass}`;
        
        // Preserve any size adjustments
        if (i.classList.contains('fa-lg') || i.classList.contains('text-lg')) {
          span.classList.remove('md');
          span.classList.add('lg');
        } else if (i.classList.contains('fa-2xl') || i.classList.contains('text-2xl')) {
          span.classList.remove('md');
          span.classList.add('xl');
        } else if (i.classList.contains('fa-sm') || i.classList.contains('text-sm')) {
          span.classList.remove('md');
          span.classList.add('sm');
        }

        // Copy generic inline style
        if (i.getAttribute('style')) {
          span.setAttribute('style', i.getAttribute('style'));
        }

        span.innerHTML = SVG_ICONS[faClass];
        i.parentNode.replaceChild(span, i);
      }
    });
  };

  // Run on content load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.replaceIcons());
  } else {
    window.replaceIcons();
  }
})();
