import { useEffect } from 'react';
import { GameLifecycle } from '../../shared/GameLifecycle';
import { usePageStyles } from '../../shared/usePageStyles';
import { startGame } from './engine';
import styles from './styles.generated.css?inline';

/** Hedge Maze: React owns the interface; the engine draws and updates the game. */
export default function Game() {
  usePageStyles(styles, 'Hedge Maze');
  useEffect(() => {
    const lifecycle = new GameLifecycle();
    try {
      startGame(lifecycle);
    } catch (error) {
      lifecycle.dispose();
      throw error;
    }
    return () => lifecycle.dispose();
  }, []);
  return (
    <>
      <main>
        <header>
          <div>
            <h1>Hedge Maze</h1>
            <p className="tag">Find three keys in the dark, then reach the gate.</p>
          </div>
          <div className="status">
            <div className="keys" aria-label="Keys found">
              <span id="k0">⚷</span>
              <span id="k1">⚷</span>
              <span id="k2">⚷</span>
            </div>
            <div className="watch" id="time">
              0:00
            </div>
          </div>
        </header>
        <div className="board">
          <canvas id="c" aria-label="Maze"></canvas>
          <div id="over" className="over">
            <div>
              <h2 id="oTitle">The garden at dusk</h2>
              <p id="oText">
                Your lantern only lights a few steps around you. Three keys are hidden
                somewhere in the hedges, and the gate in the far corner won't open until
                you have them all. Move with the arrow keys, WASD, swipes, or the pad.
              </p>
              <button id="go" className="btn" type="button">
                Enter the maze
              </button>
            </div>
          </div>
        </div>
        <div className="pad" aria-label="Direction pad">
          <span></span>
          <button type="button" data-d="0,-1" aria-label="Up">
            ↑
          </button>
          <span></span>
          <button type="button" data-d="-1,0" aria-label="Left">
            ←
          </button>
          <button type="button" data-d="0,1" aria-label="Down">
            ↓
          </button>
          <button type="button" data-d="1,0" aria-label="Right">
            →
          </button>
        </div>
        <p className="note">
          Paths you've walked stay faintly visible. Each maze you finish makes the next
          one bigger. Best times are kept for each size.
        </p>
      </main>
    </>
  );
}
