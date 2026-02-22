/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: '#1B2A4A',
        steel: '#3D5A80',
        teal: '#2A9D8F',
        warm: '#E76F51',
        light: '#F0F4F8',
        dark: '#2D3748',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
