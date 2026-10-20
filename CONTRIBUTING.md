# Contributing

## Development

Use Node.js 24. Install with `npm ci`, then start Vite with `npm run dev`.

Each game lives in `src/games/<slug>/`:

- `Game.tsx` renders its React interface and contains the gameplay for the 59 original React games.
- `engine.ts` contains the gameplay for the 41 imperative games. React mounts the interface before starting it.
- `styles.css` and `tailwind.config.json` define the game's appearance. Generated CSS is ignored by Git.

The catalog data lives in `src/games.ts`. The registry loads game components lazily. Hash routes such as `#/play/comet-courier` work on static hosts without rewrite rules. Shared utilities manage page styles and resource cleanup.

Vite regenerates game styles when you change a component, engine, stylesheet, or game Tailwind configuration.

## Code conventions

Use UTF-8, CRLF line endings, two spaces, and a final newline. Prettier, EditorConfig, and Git attributes enforce these conventions.

```sh
npm run format
npm run format:check
npm run check:crlf
npm run typecheck
npm test
npm run build
npm run verify
```

The shell and shared utilities use strict TypeScript. Migrated game modules use a separate relaxed configuration for their original dynamic state models; some helpers retain inferred or permissive types. New or changed code should use explicit domain types where practical.

Tests cover lifecycle cleanup and initial rendering of all 100 React interfaces. The render check stubs Patchwork Jigsaw's drawing surface. It does not validate graphics, sound, touch input, or complete gameplay; check those interactively before release.

## Deployment

`npm run build` produces the static site in `dist/`. Use `npm run preview` to serve that build locally. No environment variables or backend are required. Google Fonts are optional network resources.

For GitHub Pages, push to `main` and choose **GitHub Actions** under **Settings → Pages**. The included workflow checks formatting, CRLF, tests, types, and bundles before deploying. Relative assets also support custom domains.
