export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: { 'neon-cyan': '#00FFFF', 'neon-magenta': '#FF00FF', 'neon-pink': '#FF0080', 'dark': { 900: '#0a0a0a', 800: '#121212' } },
      fontFamily: { mono: ['JetBrains Mono', 'monospace'] },
    },
  },
  plugins: [],
}
