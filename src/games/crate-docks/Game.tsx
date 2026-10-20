import { useEffect } from 'react';
import { GameLifecycle } from '../../shared/GameLifecycle';
import { usePageStyles } from '../../shared/usePageStyles';
import { startGame } from './engine';
import styles from './styles.generated.css?inline';

/** Crate Docks: React owns the interface; the engine draws and updates the game. */
export default function Game() {
  usePageStyles(styles, 'Crate Docks');
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
        <div className="hold">
          <canvas id="c" aria-label="Cargo hold"></canvas>
          <div id="over" className="over">
            <div>
              <h2 id="oTitle">Shift starts</h2>
              <p id="oText">
                Pack containers into the hold.
                <br />
                Fill a full row and a ship takes it out to sea.
              </p>
              <button id="go" className="btn" type="button">
                Open the dock
              </button>
            </div>
          </div>
        </div>
        <div className="side">
          <h1>
            Crate
            <br />
            Docks
          </h1>
          <div>
            <span className="k">Score</span>
            <span id="score" className="v">
              0
            </span>
          </div>
          <div>
            <span className="k">Rows shipped</span>
            <span id="lines" className="v">
              0
            </span>
          </div>
          <div>
            <span className="k">Shift</span>
            <span id="level" className="v">
              1
            </span>
          </div>
          <div>
            <span className="k">Next crate</span>
            <canvas id="next"></canvas>
          </div>
          <div>
            <span className="k">Best</span>
            <span id="best" className="v">
              0
            </span>
          </div>
          <p className="help">← → move · ↑ rotate · ↓ lower · Space drop · P pause</p>
        </div>
        <div className="pad">
          <button type="button" data-a="left" aria-label="Move left">
            ◀
          </button>
          <button type="button" data-a="rot" aria-label="Rotate">
            ⟳
          </button>
          <button type="button" data-a="down" aria-label="Lower">
            ▼
          </button>
          <button type="button" data-a="drop" aria-label="Drop">
            DROP
          </button>
          <button type="button" data-a="right" aria-label="Move right">
            ▶
          </button>
        </div>
      </main>
    </>
  );
}
