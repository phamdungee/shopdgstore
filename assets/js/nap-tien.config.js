// Optional Tailwind config kept for backward compatibility with older pages.
if (window.tailwind) {
  tailwind.config = {
    theme: {
      extend: {
        colors: {
          orange: {
            50: '#fff7ed',
            100: '#ffedd5',
            500: '#f97316',
            600: '#ea580c'
          }
        },
        fontFamily: {
          sans: ['Inter', 'sans-serif']
        }
      }
    }
  };
}
