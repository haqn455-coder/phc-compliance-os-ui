/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        phc: {
          50: '#f3f8fc',
          100: '#e6f0f8',
          600: '#1467a5',
          700: '#0f537f',
          800: '#0b3558',
          900: '#08283f'
        }
      },
      boxShadow: {
        soft: '0 12px 36px rgba(15, 53, 88, 0.08)'
      }
    }
  },
  plugins: []
};
