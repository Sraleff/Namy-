/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Fundo (sólido) e superfícies de vidro (translúcidas sobre a aurora do fundo).
        // 850 = poço escuro (campos, painéis internos); 800/750/700 = vidro cada vez mais claro.
        ink: {
          950: '#080c17',
          900: '#0b1120',
          850: 'rgb(2 6 23 / 0.42)',
          800: 'rgb(148 163 184 / 0.07)',
          750: 'rgb(148 163 184 / 0.12)',
          700: 'rgb(148 163 184 / 0.22)',
        },
        line: 'rgba(255, 255, 255, 0.09)',
        'line-strong': 'rgba(255, 255, 255, 0.18)',
        cream: '#f8fafc',
        muted: '#94a3b8',
        subtle: '#64748b',
        brand: {
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          violet: '#8b5cf6',
        },
        positive: '#22c55e',
      },
      boxShadow: {
        card: 'inset 0 1px 0 0 rgba(255,255,255,0.06), 0 10px 30px -14px rgba(0,0,0,0.7)',
        lift: 'inset 0 1px 0 0 rgba(255,255,255,0.08), 0 18px 40px -16px rgba(0,0,0,0.8), 0 0 0 1px rgba(165,180,252,0.08)',
        glow: '0 10px 24px -10px rgba(99,102,241,0.85), inset 0 1px 0 rgba(255,255,255,0.25)',
        nav: 'inset 0 1px 0 0 rgba(255,255,255,0.07), 0 20px 40px -12px rgba(0,0,0,0.85)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
      },
    },
  },
  plugins: [],
};
