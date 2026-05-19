/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f7ff',
          100: '#e0f0ff',
          200: '#bae0ff',
          300: '#7cc9ff',
          400: '#36b9ff',
          500: '#0099ff',
          600: '#0077d9',
          700: '#005bb8',
          800: '#004399',
          900: '#002266',
        },
      },
    },
  },
  plugins: [],
}
