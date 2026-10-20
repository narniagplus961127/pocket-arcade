import { useEffect } from 'react';
import { GameLifecycle } from '../../shared/GameLifecycle';
import { usePageStyles } from '../../shared/usePageStyles';
import { startGame } from './engine';
import styles from './styles.generated.css?inline';

/** Pancake Tower: React owns the interface; the engine draws and updates the game. */
export default function Game() {
  usePageStyles(styles, 'Pancake Tower');
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
      <canvas id="c" aria-label="Pancake stack"></canvas>

      <div className="hud">
        <div id="count" className="count">
          0
        </div>
        <div className="sub">
          Pancakes · best <span id="best">0</span>
        </div>
        <div id="perfect" className="perfect" hidden={true}>
          Perfect!
        </div>
      </div>

      <div id="title" className="overlay">
        <div className="card">
          <p className="order">Order #001 · Table 4</p>
          <h1>Pancake Tower</h1>
          <p>
            Pancakes slide across the griddle. Tap to drop each one onto the stack.
            Anything hanging over the edge gets trimmed off, so the stack gets narrower.
          </p>
          <hr className="dash" />
          <div className="line">
            <span>Tap · Click · Space</span>
            <span>Drop</span>
          </div>
          <div className="line">
            <span>Three perfect drops in a row</span>
            <span>Wider again</span>
          </div>
          <div className="line">
            <span>Every 10 pancakes</span>
            <span>Butter pat</span>
          </div>
          <hr className="dash" />
          <button id="play" className="btn" type="button">
            Start flipping
          </button>
        </div>
      </div>

      <div id="over" className="overlay" hidden={true}>
        <div className="card">
          <p className="order">Receipt</p>
          <h2>Order up!</h2>
          <hr className="dash" />
          <div className="line">
            <span>Pancakes stacked</span>
            <span id="sCount">0</span>
          </div>
          <div className="line">
            <span>Perfect drops</span>
            <span id="sPerfect">0</span>
          </div>
          <div className="line">
            <span>House record</span>
            <span id="sBest">0</span>
          </div>
          <hr className="dash" />
          <button id="again" className="btn" type="button">
            Another stack
          </button>
        </div>
      </div>
    </>
  );
}
