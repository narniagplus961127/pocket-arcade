import { useEffect } from 'react';
import { GameLifecycle } from '../../shared/GameLifecycle';
import { usePageStyles } from '../../shared/usePageStyles';
import { startGame } from './engine';
import styles from './styles.generated.css?inline';

/** Glacier Breaker: React owns the interface; the engine draws and updates the game. */
export default function Game() {
  usePageStyles(styles, 'Glacier Breaker');
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
      <canvas id="c" aria-label="Ice field"></canvas>

      <div className="hud">
        <div>
          <small>Score</small>
          <span id="score">0</span>
        </div>
        <div
          style={{
            textAlign: 'center',
          }}
        >
          <small>Floe</small>
          <span id="lvl">1</span>
        </div>
        <div
          style={{
            textAlign: 'right',
          }}
        >
          <small>Lives</small>
          <span id="lives">3</span>
        </div>
      </div>

      <div id="title" className="overlay">
        <div className="card">
          <p className="eyebrow">Expedition log · Day 1</p>
          <h1>Glacier Breaker</h1>
          <p>
            Pip the penguin rides an ice floe and bounces a snowball into the glacier.
            Thick blocks take more than one hit, and some have fish frozen inside.
          </p>
          <div className="pw">
            <b>Wide</b>
            <span>a bigger floe for 12 seconds</span>
            <b>Triple</b>
            <span>two extra snowballs</span>
            <b>Slow</b>
            <span>a calmer snowball for 10 seconds</span>
          </div>
          <p>
            Move with the mouse, a finger, or the arrow keys. Click, tap, or press Space
            to launch.
          </p>
          <button id="play" className="btn" type="button">
            Start the thaw
          </button>
        </div>
      </div>

      <div id="over" className="overlay" hidden={true}>
        <div className="card">
          <p className="eyebrow" id="oEyebrow">
            Out of snowballs
          </p>
          <h2 id="oTitle">Pip needs a nap</h2>
          <p id="oText">Score 0 · Floe 1</p>
          <button id="again" className="btn" type="button">
            Back on the ice
          </button>
        </div>
      </div>
    </>
  );
}
