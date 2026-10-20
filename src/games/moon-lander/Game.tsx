import { useEffect } from 'react';
import { GameLifecycle } from '../../shared/GameLifecycle';
import { usePageStyles } from '../../shared/usePageStyles';
import { startGame } from './engine';
import styles from './styles.generated.css?inline';

/** Moon Lander: React owns the interface; the engine draws and updates the game. */
export default function Game() {
  usePageStyles(styles, 'Moon Lander');
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
      <canvas id="c" aria-label="Lunar surface"></canvas>

      <div className="tele" aria-label="Telemetry">
        <span>SCORE</span>
        <b id="score">0</b>
        <span>FUEL</span>
        <b id="fuel">1000</b>
        <span>ALT</span>
        <b id="alt">0</b>
        <span>H-SPD</span>
        <b id="hs">0</b>
        <span>V-SPD</span>
        <b id="vs">0</b>
      </div>

      <div className="touch">
        <div>
          <button type="button" data-k="left" aria-label="Rotate left">
            ↺
          </button>
          <button type="button" data-k="right" aria-label="Rotate right">
            ↻
          </button>
        </div>
        <div>
          <button type="button" data-k="thrust" aria-label="Main engine">
            BURN
          </button>
        </div>
      </div>

      <div id="title" className="overlay">
        <div className="card">
          <h1>moon lander</h1>
          <p>
            Put the module down on a flat pad, gently. Rotate with <b>← →</b> and fire the
            main engine with <b>↑</b> or Space. On phones, use the buttons.
          </p>
          <p>
            To land safely you need to be upright, falling slower than 18 m/s, and
            drifting sideways slower than 12 m/s. Narrow pads pay ×3 or ×5. Fuel carries
            over between landings.
          </p>
          <button id="play" className="btn" type="button">
            BEGIN DESCENT
          </button>
        </div>
      </div>

      <div id="over" className="overlay" hidden={true}>
        <div className="card">
          <h2 id="oTitle">contact</h2>
          <p id="oText"></p>
          <button id="again" className="btn" type="button">
            CONTINUE
          </button>
        </div>
      </div>
    </>
  );
}
