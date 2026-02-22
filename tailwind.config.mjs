/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#1B2A4A',
          deep: '#111E36',
          mid: '#243560',
        },
        teal: {
          DEFAULT: '#2A9D8F',
          light: '#3BBDAE',
          pale: '#E6F5F3',
        },
        steel: '#3D5A80',
        slate: '#3D5A80',
        warm: '#E76F51',
        light: '#F7F9FC',
        dark: '#2D3748',
      },
      fontFamily: {
        display: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
