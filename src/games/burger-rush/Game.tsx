import { useEffect } from 'react';
import { GameLifecycle } from '../../shared/GameLifecycle';
import { usePageStyles } from '../../shared/usePageStyles';
import { startGame } from './engine';
import styles from './styles.generated.css?inline';

/** Burger Rush: React owns the interface; the engine draws and updates the game. */
export default function Game() {
  usePageStyles(styles, 'Burger Rush');
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
          <h1>Burger Rush</h1>
          <div className="stats">
            <div className="stat">
              <span>Tips</span>
              <b id="tips">$0</b>
            </div>
            <div className="stat">
              <span>Served</span>
              <b id="served">0</b>
            </div>
            <div className="stat">
              <span>Walkouts</span>
              <b id="lost">0/3</b>
            </div>
          </div>
        </header>
        <div id="rail" className="rail" aria-label="Orders"></div>
        <div id="plate" className="plate" aria-label="Your burger"></div>
        <div id="msg" className="msg" aria-live="polite"></div>
        <div id="bins" className="bins"></div>
        <div className="row">
          <button id="serve" className="btn" type="button">
            Ding! Serve (Enter)
          </button>
          <button id="trash" className="btn ghost" type="button">
            Bin it (Backspace)
          </button>
        </div>
      </main>

      <div id="title" className="overlay">
        <div className="card">
          <h2>Burger Rush</h2>
          <p>
            Orders come in on the rail. Build the <b>highlighted</b> ticket from the
            bottom up by tapping the ingredient bins (or pressing keys 1–8), then hit{' '}
            <b>Serve</b>.
          </p>
          <p>
            Fast, correct burgers earn bigger tips. A wrong burger costs you. If a
            customer's patience bar runs out, they walk out, and three walkouts closes the
            diner.
          </p>
          <button id="play" className="btn" type="button">
            Open the diner
          </button>
        </div>
      </div>

      <div id="over" className="overlay" hidden={true}>
        <div className="card">
          <h2>Closing time</h2>
          <p id="oText"></p>
          <button id="again" className="btn" type="button">
            Next shift
          </button>
        </div>
      </div>
    </>
  );
}
