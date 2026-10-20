import fs from 'node:fs/promises';
import path from 'node:path';
import postcss from 'postcss';
import tailwindcss, { type Config } from 'tailwindcss';

/** Compile only the selected game's classes, palette, typography, and custom CSS. */
export async function compileGameStyles(slug: string): Promise<void> {
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`Invalid game slug: ${slug}`);
  const directory = path.join('src/games', slug);
  const config: Partial<Config> = JSON.parse(
    await fs.readFile(path.join(directory, 'tailwind.config.json'), 'utf8'),
  );
  const source = await fs.readFile(path.join(directory, 'styles.css'), 'utf8');
  const result = await postcss([
    tailwindcss({
      ...config,
      content: [`${directory.replaceAll('\\', '/')}/**/*.{ts,tsx}`],
    }),
  ]).process(source, { from: path.join(directory, 'styles.css') });

  await fs.writeFile(
    path.join(directory, 'styles.generated.css'),
    result.css.replace(/\r?\n/g, '\r\n'),
  );
}
