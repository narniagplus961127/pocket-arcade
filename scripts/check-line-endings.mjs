import fs from 'node:fs/promises';
import path from 'node:path';

const excluded = new Set(['node_modules', 'dist', 'archive', '.git']);
const extensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.css',
  '.html',
  '.md',
  '.yml',
  '.yaml',
  '.svg',
]);
const dotfiles = new Set([
  '.editorconfig',
  '.gitattributes',
  '.gitignore',
  '.prettierignore',
]);
const failures = [];
const write = process.argv.includes('--write');
let checked = 0;

async function visit(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await visit(filename);
    } else if (extensions.has(path.extname(entry.name)) || dotfiles.has(entry.name)) {
      const text = await fs.readFile(filename, 'utf8');
      if (/(?<!\r)\n/.test(text) || /\r(?!\n)/.test(text)) {
        if (write) await fs.writeFile(filename, text.replace(/\r\n|\r|\n/g, '\r\n'));
        else failures.push(filename);
      }
      checked++;
    }
  }
}

await visit('.');
if (failures.length)
  throw new Error(`Files without consistent CRLF:\n${failures.join('\n')}`);
console.log(`Verified CRLF line endings in ${checked} active text files.`);
