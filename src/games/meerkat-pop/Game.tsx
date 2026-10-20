import { useEffect } from 'react';
import { GameLifecycle } from '../../shared/GameLifecycle';
import { usePageStyles } from '../../shared/usePageStyles';
import { startGame } from './engine';
import styles from './styles.generated.css?inline';

/** Meerkat Pop: React owns the interface; the engine draws and updates the game. */
export default function Game() {
  usePageStyles(styles, 'Meerkat Pop');
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
      <div className="sun" aria-hidden="true"></div>

      <main>
        <header>
          <h1>
            Meerkat
            <br />
            Pop
          </h1>
          <div className="stats">
            <div className="stat">
              <span>Boops</span>
              <b id="score">0</b>
            </div>
            <div className="stat">
              <span>Time</span>
              <b id="time">45</b>
            </div>
          </div>
        </header>
        <div id="field" className="field" aria-label="Burrows"></div>
        <div id="card" className="card">
          <p id="cText">
            <b>Boop the meerkats</b> as they pop up to look around: 1 point each, more if
            you keep a streak going. Golden meerkats are worth 5.{' '}
            <b>Don't boop the snake</b>, it costs you 5 points and your streak. Click or
            tap a burrow, or use the number keys 1–9.
          </p>
          <button id="go" className="btn" type="button">
            Start · 45 s
          </button>
        </div>
      </main>
    </>
  );
}
