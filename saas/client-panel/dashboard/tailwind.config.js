/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Superfícies (do mais escuro ao mais claro)
        ink: {
          950: '#080c17',
          900: '#0b1120',
          850: '#0f172a',
          800: '#131a2b',
          750: '#1a2236',
          700: '#232c42',
        },
        line: 'rgba(148, 163, 184, 0.10)',
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
        card: '0 1px 0 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.5)',
        glow: '0 8px 24px -8px rgba(99,102,241,0.55)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
      },
    },
  },
  plugins: [],
};
