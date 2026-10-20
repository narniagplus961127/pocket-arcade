import fs from 'node:fs/promises';
import { compileGameStyles } from './game-styles.ts';

const slugs = await fs.readdir('src/games');
if (slugs.length !== 100) throw new Error(`Expected 100 games; found ${slugs.length}.`);

for (const slug of slugs) {
  await compileGameStyles(slug);
}

console.log('Compiled Tailwind styles for all 100 React games.');
