import { useEffect } from 'react';
import { GameLifecycle } from '../../shared/GameLifecycle';
import { usePageStyles } from '../../shared/usePageStyles';
import { startGame } from './engine';
import styles from './styles.generated.css?inline';

/** Firefly Jar: React owns the interface; the engine draws and updates the game. */
export default function Game() {
  usePageStyles(styles, 'Firefly Jar');
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
      <canvas id="c" aria-label="Meadow at night"></canvas>

      <div className="hud">
        <div>
          <span className="k">In the jar</span>
          <span id="count" className="v">
            0
          </span>
        </div>
        <div className="mid">
          <span className="k">Streak</span>
          <span id="streak" className="v">
            ×1
          </span>
        </div>
        <div className="right">
          <span className="k">Dusk left</span>
          <span id="time" className="v">
            60
          </span>
        </div>
      </div>

      <div id="title" className="overlay">
        <div className="card">
          <p className="eyebrow">A summer evening, 60 seconds of it</p>
          <h1>Firefly Jar</h1>
          <p>
            Fireflies blink on and off over the meadow. Tap one while it's glowing to
            catch it in your jar. Catch several in quick succession to build a streak.
          </p>
          <div className="legend">
            <span
              className="dot"
              style={{
                background: '#efff8a',
                boxShadow: '0 0 10px #efff8a',
              }}
            ></span>
            <span>Firefly: 1 × your streak</span>
            <span
              className="dot"
              style={{
                background: '#ffcf4a',
                boxShadow: '0 0 12px #ffcf4a',
              }}
            ></span>
            <span>Golden firefly: 5 points and 3 extra seconds</span>
            <span
              className="dot"
              style={{
                background: '#b9a9c9',
              }}
            ></span>
            <span>Moth: leave it alone, it costs 4 seconds</span>
          </div>
          <button id="play" className="btn" type="button">
            Unscrew the lid
          </button>
        </div>
      </div>

      <div id="over" className="overlay" hidden={true}>
        <div className="card">
          <p className="eyebrow">Night has fallen</p>
          <h2 id="oTitle">A glowing jar</h2>
          <p id="oText">0 fireflies caught.</p>
          <p
            id="oBest"
            style={{
              color: 'var(--muted)',
            }}
          >
            Best jar: 0
          </p>
          <button id="again" className="btn" type="button">
            One more evening
          </button>
        </div>
      </div>
    </>
  );
}
