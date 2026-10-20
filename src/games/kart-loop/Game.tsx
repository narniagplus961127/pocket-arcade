import { useEffect } from 'react';
import { GameLifecycle } from '../../shared/GameLifecycle';
import { usePageStyles } from '../../shared/usePageStyles';
import { startGame } from './engine';
import styles from './styles.generated.css?inline';

/** Kart Loop: React owns the interface; the engine draws and updates the game. */
export default function Game() {
  usePageStyles(styles, 'Kart Loop');
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
      <canvas id="c" aria-label="Kart circuit"></canvas>

      <div className="tower">
        <div>
          <span className="k">LAP</span>
          <b id="lap">0 / 3</b>
        </div>
        <div>
          <span className="k">TIME</span>
          <b id="cur">0.00</b>
        </div>
        <div>
          <span className="k">LAST</span>
          <b id="lastLap">—</b>
        </div>
        <div>
          <span className="k">RECORD</span>
          <b id="rec">—</b>
        </div>
      </div>

      <div id="big" className="big" aria-live="assertive"></div>

      <div className="pedals">
        <div>
          <button type="button" data-k="left" aria-label="Steer left">
            ◀
          </button>
          <button type="button" data-k="right" aria-label="Steer right">
            ▶
          </button>
        </div>
        <div>
          <button type="button" data-k="brake" aria-label="Brake">
            BRK
          </button>
          <button type="button" data-k="gas" aria-label="Accelerate">
            GAS
          </button>
        </div>
      </div>

      <div id="title" className="overlay">
        <div className="card">
          <h1>Kart Loop</h1>
          <p>
            Three laps, one kart, against the clock. Hold <b>↑</b> to accelerate, <b>↓</b>{' '}
            to brake, and steer with <b>← →</b>. On phones, use the pedals at the bottom.
          </p>
          <p>
            The grass is slow. Clip the red-and-white curbs for the fastest line. Ease off
            before the hairpin.
          </p>
          <button id="play" className="btn" type="button">
            Start engine
          </button>
        </div>
      </div>

      <div id="over" className="overlay" hidden={true}>
        <div className="card">
          <h2 id="oTitle">Chequered flag</h2>
          <p id="oText"></p>
          <button id="again" className="btn" type="button">
            Race again
          </button>
        </div>
      </div>
    </>
  );
}
