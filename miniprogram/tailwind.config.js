/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,js,ts,jsx,tsx}'],
  corePlugins: {
    // 小程序不需要 preflight（主要给 H5）
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        primary: '#FF6B6B',
        secondary: '#4ECDC4',
        ocean: '#45B7D1',
        sand: '#FFEAA7',
        coral: '#FF6B6B',
        sunset: '#F39C12',
      },
    },
  },
  plugins: [],
}