module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Light Mode
        'bg-base': '#F0F5FF',
        'bg-surface': '#FFFFFF',
        'bg-sidebar': '#1A2744',
        'primary': '#0057FF',
        'primary-hover': '#0040CC',
        'accent': '#00C2FF',
        'success': '#00C896',
        'warning': '#FF9500',
        'danger': '#FF3B5C',
        'text-primary': '#0D1B3E',
        'text-secondary': '#4A6087',
        'border': '#C8D8F0',

        // Dark Mode
        'dark-bg-base': '#080E1C',
        'dark-bg-surface': '#0F1829',
        'dark-bg-sidebar': '#060C18',
        'dark-primary': '#00C2FF',
        'dark-primary-hover': '#33D0FF',
        'dark-accent': '#7B5CFF',
        'dark-success': '#00E5A0',
        'dark-warning': '#FFB340',
        'dark-danger': '#FF5C7A',
        'dark-text-primary': '#E8F0FF',
        'dark-text-secondary': '#7A96C2',
        'dark-border': '#1E2F50',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Georgia', 'serif'],
        mono: ['Fira Code', 'monospace'],
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
