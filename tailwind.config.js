/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Deep arcane night — the dark the lighthouse cuts through
        abyss: '#050810',
        void: '#080d18',
        surface: {
          DEFAULT: '#0e1626',
          raised: '#131d33',
          overlay: '#1a2742',
        },
        line: {
          DEFAULT: '#1f2c49',
          strong: '#2e3f64',
        },
        // The beam — warm lighthouse gold (primary accent)
        beam: {
          deep: '#c8881f',
          DEFAULT: '#f5b942',
          soft: '#ffd479',
          glow: '#ffe6ad',
        },
        // Arcane teal (secondary accent)
        arcane: {
          deep: '#0f9e8e',
          DEFAULT: '#2dd4bf',
          soft: '#5eead4',
        },
        // Mystic violet (tertiary / magic)
        mystic: {
          DEFAULT: '#a78bfa',
          soft: '#c4b5fd',
        },
        ink: {
          DEFAULT: '#e8eefb',
          muted: '#9aa8c8',
          faint: '#637095',
        },
        // Resource + state colors
        hp: '#f0506e',
        mp: '#4aa8ff',
        sp: '#5ad17f',
        danger: '#ef4444',
        success: '#34d399',
        warn: '#fbbf24',
      },
      fontFamily: {
        display: ['Cinzel', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        'glow-beam': '0 0 24px -2px rgba(245, 185, 66, 0.45)',
        'glow-beam-lg': '0 0 48px -4px rgba(245, 185, 66, 0.55)',
        'glow-arcane': '0 0 24px -2px rgba(45, 212, 191, 0.45)',
        'glow-danger': '0 0 24px -2px rgba(239, 68, 68, 0.5)',
        panel: '0 8px 40px -12px rgba(0, 0, 0, 0.7)',
        'inner-line': 'inset 0 1px 0 0 rgba(255, 255, 255, 0.04)',
      },
      backgroundImage: {
        'beam-radial':
          'radial-gradient(circle at 50% -10%, rgba(245,185,66,0.18), transparent 55%)',
        'arcane-radial':
          'radial-gradient(circle at 50% 50%, rgba(45,212,191,0.12), transparent 60%)',
        'panel-sheen':
          'linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0) 40%)',
      },
      keyframes: {
        'beam-sweep': {
          '0%, 100%': { opacity: '0.35', transform: 'rotate(-8deg) scaleY(1)' },
          '50%': { opacity: '0.7', transform: 'rotate(8deg) scaleY(1.08)' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'roll-in': {
          '0%': { opacity: '0', transform: 'scale(0.6) rotate(-25deg)' },
          '60%': { opacity: '1', transform: 'scale(1.12) rotate(6deg)' },
          '100%': { opacity: '1', transform: 'scale(1) rotate(0)' },
        },
      },
      animation: {
        'beam-sweep': 'beam-sweep 9s ease-in-out infinite',
        'pulse-glow': 'pulse-glow 2.6s ease-in-out infinite',
        float: 'float 6s ease-in-out infinite',
        shimmer: 'shimmer 2.4s linear infinite',
        'fade-up': 'fade-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) both',
        'roll-in': 'roll-in 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) both',
      },
    },
  },
  plugins: [],
};
