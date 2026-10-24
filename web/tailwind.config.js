/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Shared with the Technicon Services ERP so the two apps feel related.
        brand: { DEFAULT: '#3B6FD4', dark: '#2F5CB8', soft: '#EAF0FB' },
        ink: { DEFAULT: '#141B34', muted: '#5B6480', faint: '#8A93AD' },
        line: '#E4E8F2',
        canvas: '#F4F6FC',
        danger: { DEFAULT: '#D93D42', soft: '#FDECEC' },
        ok: { DEFAULT: '#1F8A5B', soft: '#E6F4EC' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(20, 27, 52, 0.04), 0 1px 3px rgba(20, 27, 52, 0.06)',
      },
    },
  },
  plugins: [],
};
