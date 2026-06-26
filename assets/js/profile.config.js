// Optional Tailwind config kept for backward compatibility with older pages.
if (window.tailwind) {
  tailwind.config = {
    theme: {
      extend: {
        colors: {
          brand: {
            light: '#f0f7ff',
            blue: '#3b82f6',
            purple: '#8b5cf6',
            cyan: '#06b6d4',
            dark: '#1e1b4b'
          }
        },
        fontFamily: {
          sans: ['Inter', 'sans-serif']
        }
      }
    }
  };
}
