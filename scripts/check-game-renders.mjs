import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { build } from 'esbuild';

// Render every real component with React's server renderer. Effects are deliberately
// excluded: this checks initial UI rendering without emulating a browser or canvas.
const slugs = await fs.readdir('src/games');
const temporaryDirectory = await fs.mkdtemp(
  path.join(os.tmpdir(), 'pocket-arcade-render-'),
);
const output = path.join(temporaryDirectory, 'renders.mjs');
const entry = `
import React from 'react';
import { renderToString } from 'react-dom/server';
${slugs.map((slug, index) => `import Game${index} from './src/games/${slug}/Game';`).join('\n')}
const games = [${slugs.map((slug, index) => `[${JSON.stringify(slug)}, Game${index}]`).join(',')}];
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
// Patchwork Jigsaw generates its artwork with a canvas while initializing state.
// A drawing stub lets this markup check run without a browser; it does not test pixels.
const drawing = new Proxy({}, {
  get: (_, method) => method === 'createLinearGradient' || method === 'createRadialGradient'
    ? () => ({ addColorStop() {} }) : () => {},
  set: () => true,
});
globalThis.document = {
  createElement: tag => {
    if (tag !== 'canvas') throw new Error('Unexpected render-time DOM element: ' + tag);
    return { width: 0, height: 0, getContext: () => drawing, toDataURL: () => 'data:image/png;base64,' };
  },
};
const failures = [];
for (const [slug, Game] of games) {
  try {
    const markup = renderToString(React.createElement(Game));
    if (!markup.trim()) throw new Error('Empty game interface');
  } catch (error) {
    failures.push(slug + ': ' + error.message);
  }
}
if (failures.length) throw new Error(failures.join('\\n'));
console.log('Rendered all 100 React game interfaces successfully.');
`;

try {
  await build({
    stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx' },
    outfile: output,
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'bundle',
    define: { 'process.env.NODE_ENV': '"production"' },
    banner: {
      js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
    },
    plugins: [
      {
        name: 'ignore-render-test-styles',
        setup(context) {
          context.onResolve({ filter: /\.css\?inline$/ }, () => ({
            path: 'styles',
            namespace: 'test-styles',
          }));
          context.onLoad({ filter: /.*/, namespace: 'test-styles' }, () => ({
            contents: "export default '';",
            loader: 'js',
          }));
        },
      },
    ],
  });
  await import(pathToFileURL(output).href);
} finally {
  // This directory is created above solely for this check.
  const temporaryRoot = await fs.realpath(os.tmpdir());
  const resolvedDirectory = await fs.realpath(temporaryDirectory);
  if (
    !resolvedDirectory.startsWith(temporaryRoot + path.sep) ||
    !path.basename(resolvedDirectory).startsWith('pocket-arcade-render-')
  ) {
    throw new Error(
      'Refusing to remove a path outside the render-check temporary directory.',
    );
  }
  await fs.rm(resolvedDirectory, { recursive: true, force: true });
}
