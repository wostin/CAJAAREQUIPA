/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sora: ['Sora', 'sans-serif'],
        sans: ['DM Sans', 'sans-serif'],
      },
      colors: {
        // Paleta CMAC Arequipa v4 (basada en v3)
        'ca-navy':   '#0D2461',
        'ca-blue':   '#1A3A8F',
        'ca-teal':   '#00A896',
        'ca-teal2':  '#008F7A',
        'ca-orange': '#F97316',
        'ca-gold':   '#F4C430',
        // Backgrounds
        'ca-bg':     '#F4F6FB',
        'ca-bg2':    '#EEF1F8',
        'ca-border': '#DDE2F0',
        // Texto
        'ca-text1':  '#0D1B3E',
        'ca-text2':  '#374060',
        'ca-text3':  '#7B84A3',
        // Legacy aliases (retrocompat)
        'cmac-red':  '#0D2461',
        'cmac-dark': '#1A3A8F',
        'cmac-gold': '#F4C430',
      },
      borderRadius: {
        'xl2': '20px',
      },
      boxShadow: {
        'ca':  '0 2px 12px rgba(13,36,97,.08)',
        'ca2': '0 8px 32px rgba(13,36,97,.14)',
        'ca3': '0 16px 48px rgba(13,36,97,.22)',
      },
    },
  },
  plugins: [],
};
