import { Component, Suspense, useEffect, useState, type ReactNode } from 'react';
import Catalog from './Catalog';
import { gameRegistry } from './gameRegistry';

function readGameSlug(): string | null {
  return window.location.hash.match(/^#\/play\/([a-z0-9-]+)$/)?.[1] ?? null;
}

class GameErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <main style={{ padding: '2rem', fontFamily: 'system-ui' }}>
          <h1>This game could not start.</h1>
          <p>Reload the page to try again, or choose another game.</p>
          <a href="#">Back to the arcade</a>
        </main>
      );
    }
    return this.props.children;
  }
}

/** Hash routes work on GitHub Pages without server rewrite rules. */
export default function App() {
  const [slug, setSlug] = useState(readGameSlug);

  useEffect(() => {
    const updateRoute = () => setSlug(readGameSlug());
    window.addEventListener('hashchange', updateRoute);
    return () => window.removeEventListener('hashchange', updateRoute);
  }, []);

  if (!slug) return <Catalog />;
  const Game = gameRegistry[slug];

  if (!Game) {
    return (
      <main style={{ padding: '2rem', fontFamily: 'system-ui' }}>
        <h1>Game not found</h1>
        <a href="#">Back to the arcade</a>
      </main>
    );
  }

  return (
    <GameErrorBoundary key={slug}>
      <Suspense
        fallback={
          <p role="status" style={{ padding: '2rem' }}>
            Loading game…
          </p>
        }
      >
        <Game />
      </Suspense>
    </GameErrorBoundary>
  );
}
