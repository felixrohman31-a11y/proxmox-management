import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        soft: '0 1px 2px 0 rgb(0 0 0 / 0.5), 0 4px 16px -6px rgb(0 0 0 / 0.6)',
        'soft-lg': '0 4px 12px -2px rgb(0 0 0 / 0.5), 0 16px 40px -12px rgb(0 0 0 / 0.7)',
        glow: '0 0 0 1px rgb(249 115 22 / 0.25), 0 10px 28px -6px rgb(234 88 12 / 0.5)'
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)'
      }
    }
  },
  plugins: []
};

export default config;
