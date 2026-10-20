import { useEffect } from 'react';
import { GameLifecycle } from '../../shared/GameLifecycle';
import { usePageStyles } from '../../shared/usePageStyles';
import { startGame } from './engine';
import styles from './styles.generated.css?inline';

/** Typewriter Rain: React owns the interface; the engine draws and updates the game. */
export default function Game() {
  usePageStyles(styles, 'Typewriter Rain');
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
      <div className="sheet">
        <canvas id="c" aria-hidden="true"></canvas>
        <div className="top">
          <span>
            Words <b id="score">0</b>
          </span>
          <span>
            WPM <b id="wpm">0</b>
          </span>
          <span>
            Ink <b id="ink">♦♦♦♦♦</b>
          </span>
        </div>
        <div className="line">
          <label htmlFor="type">&gt;</label>
          <input
            id="type"
            type="text"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck="false"
            aria-label="Type the falling words here"
          />
          <span className="ribbon" aria-hidden="true"></span>
        </div>
        <div id="title" className="overlay">
          <div className="card">
            <h1>Typewriter Rain</h1>
            <p>
              Words are falling down the page. Type one and press Space or Enter to strike
              it out before it reaches the bottom. You'll lose a drop of ink for every
              word that lands, and the page goes dry after five.
            </p>
            <p>The storm picks up as you go. Long words are worth more.</p>
            <button id="play" className="btn" type="button">
              Roll in a fresh sheet
            </button>
          </div>
        </div>
        <div id="over" className="overlay" hidden={true}>
          <div className="card">
            <h2>Out of ink</h2>
            <p id="oText"></p>
            <button id="again" className="btn" type="button">
              New sheet
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
