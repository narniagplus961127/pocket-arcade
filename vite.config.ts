import { defineConfig, normalizePath, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { compileGameStyles } from './scripts/game-styles';

function gameStyleUpdates(): Plugin {
  return {
    name: 'pocket-arcade-game-styles',
    configureServer(server) {
      const update = async (file: string) => {
        const match = normalizePath(file).match(
          /\/src\/games\/([^/]+)\/(?:Game\.tsx|engine\.ts|styles\.css|tailwind\.config\.json)$/,
        );
        if (!match) return;
        try {
          await compileGameStyles(match[1]);
        } catch (error) {
          server.config.logger.error(`Game styles could not update: ${String(error)}`);
        }
      };
      server.watcher.on('change', update);
      server.httpServer?.once('close', () => server.watcher.off('change', update));
    },
  };
}
export default defineConfig({
  plugins: [react(), gameStyleUpdates()],
  base: './',
  build: { manifest: true },
});
