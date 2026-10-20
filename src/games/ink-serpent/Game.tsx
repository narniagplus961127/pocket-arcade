import { useEffect } from 'react';
import { GameLifecycle } from '../../shared/GameLifecycle';
import { usePageStyles } from '../../shared/usePageStyles';
import { startGame } from './engine';
import styles from './styles.generated.css?inline';

/** Ink Serpent: React owns the interface; the engine draws and updates the game. */
export default function Game() {
  usePageStyles(styles, 'Ink Serpent');
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
            <h1>Ink Serpent</h1>
            <p className="tag">A brush stroke that grows with every drop of ink.</p>
          </div>
          <div className="seal">
            <span id="score">0</span>
            <small>DROPS</small>
          </div>
        </header>
        <div className="board">
          <canvas id="c" aria-label="Snake board"></canvas>
          <div id="over" className="over">
            <div>
              <h2 id="oTitle">Wet the brush</h2>
              <p id="oText">
                Steer with the arrow keys, WASD, swipes, or the pad below.
                <br />
                Don't run into the paper's edge or your own stroke.
              </p>
              <button id="go" className="btn" type="button">
                Begin
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
        <div className="row">
          <span>
            Best: <b id="best">0</b>
          </span>
          <span>Speed rises every five drops</span>
        </div>
      </main>
    </>
  );
}
