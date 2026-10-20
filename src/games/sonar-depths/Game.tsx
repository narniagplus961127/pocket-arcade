import { useEffect } from 'react';
import { GameLifecycle } from '../../shared/GameLifecycle';
import { usePageStyles } from '../../shared/usePageStyles';
import { startGame } from './engine';
import styles from './styles.generated.css?inline';

/** Sonar Depths: React owns the interface; the engine draws and updates the game. */
export default function Game() {
  usePageStyles(styles, 'Sonar Depths');
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
      <canvas id="c" aria-label="Sonar view"></canvas>

      <div className="hud">
        <div className="readout">
          <span className="k">RANGE</span>
          <span id="dist" className="v">
            0 m
          </span>
        </div>
        <div className="readout">
          <span className="k">PEARLS</span>
          <span id="pearls" className="v">
            0
          </span>
        </div>
        <div className="readout">
          <span className="k">BEST</span>
          <span id="best" className="v">
            0
          </span>
        </div>
      </div>

      <button id="ping" className="ping" type="button" aria-label="Send a sonar ping">
        PING
      </button>

      <div id="title" className="overlay">
        <div className="card">
          <p className="eyebrow">VESSEL LOG · TRENCH SURVEY 7</p>
          <h1>Sonar Depths</h1>
          <p>
            Your lights are dead. The only way to see the trench is to listen for the
            echoes. The sub sweeps forward on its own, and your job is to keep it off the
            rock.
          </p>
          <ul className="rules">
            <li>Hold anywhere (or Space) to rise. Let go to sink.</li>
            <li>
              The sonar pings itself every few seconds. Press PING or E for an extra one.
            </li>
            <li>Echoes fade. Remember the shape of the rock.</li>
            <li>Avoid mines. Pearls are worth 50 m each.</li>
          </ul>
          <button id="play" className="btn" type="button">
            DIVE
          </button>
        </div>
      </div>

      <div id="over" className="overlay" hidden={true}>
        <div className="card">
          <p className="eyebrow">SIGNAL LOST</p>
          <h2 id="cause">Hull breach</h2>
          <div className="stats">
            <div>
              <span className="k">SCORE</span>
              <span id="sScore" className="v">
                0
              </span>
            </div>
            <div>
              <span className="k">PEARLS</span>
              <span id="sPearls" className="v">
                0
              </span>
            </div>
            <div>
              <span className="k">BEST</span>
              <span id="sBest" className="v">
                0
              </span>
            </div>
          </div>
          <button id="again" className="btn" type="button">
            DIVE AGAIN
          </button>
        </div>
      </div>
    </>
  );
}
