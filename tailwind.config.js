export default {
  content: ['./index.html', './src/Catalog.tsx', './src/App.tsx'],
  theme: {
    extend: {
      colors: Object.fromEntries(
        ['bg', 'shelf', 'card', 'ink', 'muted', 'accent', 'chip'].map((name) => [
          name,
          `var(--${name})`,
        ]),
      ),
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
        body: ['"Atkinson Hyperlegible"', 'system-ui', 'sans-serif'],
      },
    },
  },
};
