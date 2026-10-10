/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50:'#eff8ff',100:'#dceeff',200:'#b8ddff',300:'#83c4ff',400:'#48a4ff',500:'#1f82f5',600:'#0b63db',700:'#0a4fb3',800:'#0c438e',900:'#103b70',950:'#0b264b' },
        medical: {50:'#effcf5',100:'#d8f8e8',200:'#b4efd3',300:'#7fe0b7',400:'#46c995',500:'#22ad78',600:'#158c61',700:'#116f50',800:'#115841',900:'#104936',950:'#052b21' },
        ink: '#10233f',
        canvas: '#f5f8fb'
      },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      spacing: { '18': '4.5rem' },
      boxShadow: { soft:'0 8px 30px rgba(15, 35, 63, .08)', panel:'0 1px 2px rgba(15,35,63,.05), 0 12px 34px rgba(15,35,63,.06)' },
      borderRadius: { '2xl':'1rem','3xl':'1.5rem' },
      keyframes: { 'fade-up': {'0%':{opacity:'0',transform:'translateY(8px)'},'100%':{opacity:'1',transform:'translateY(0)'}}, shimmer:{'100%':{transform:'translateX(100%)'}} },
      animation: { 'fade-up':'fade-up .35s ease-out both', shimmer:'shimmer 1.5s infinite' }
    }
  },
  plugins: []
};
