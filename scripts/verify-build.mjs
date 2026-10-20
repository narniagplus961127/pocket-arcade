import fs from 'node:fs/promises';

const manifest = JSON.parse(await fs.readFile('dist/.vite/manifest.json', 'utf8'));
const slugs = await fs.readdir('src/games');
if (slugs.length !== 100) throw new Error('Expected 100 React games.');

for (const slug of slugs) {
  const entry = manifest[`src/games/${slug}/Game.tsx`];
  if (!entry?.isDynamicEntry) throw new Error(`Missing lazy React game: ${slug}`);
  await fs.access(`dist/${entry.file}`);
  await fs.access(`dist/previews/${slug}.jpg`);
}

const html = await fs.readFile('dist/index.html', 'utf8');
if (!html.includes('favicon.svg')) throw new Error('Favicon is not linked.');
await fs.access('dist/favicon.svg');
for (const retired of ['dist/play', 'dist/vendor']) {
  try {
    await fs.access(retired);
    throw new Error(`Retired HTML pipeline still exists: ${retired}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

console.log(
  'Verified 100 lazy React game bundles, all previews, and the favicon. No standalone HTML game pipeline remains.',
);
