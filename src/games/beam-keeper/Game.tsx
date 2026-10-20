import { useEffect } from 'react';
import { GameLifecycle } from '../../shared/GameLifecycle';
import { usePageStyles } from '../../shared/usePageStyles';
import { startGame } from './engine';
import styles from './styles.generated.css?inline';

/** Beam Keeper: React owns the interface; the engine draws and updates the game. */
export default function Game() {
  usePageStyles(styles, 'Beam Keeper');
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
      <canvas id="c" aria-label="Sea at night"></canvas>

      <div className="hud">
        <div>
          <span className="label">Ships turned</span>
          <span id="score" className="big">
            0
          </span>
        </div>
        <div>
          <span
            className="label"
            style={{
              textAlign: 'right',
            }}
          >
            Hulls left
          </span>
          <div id="lives" className="lives">
            ● ● ●
          </div>
          <span
            className="label"
            style={{
              textAlign: 'right',
            }}
          >
            Best <span id="best">0</span>
          </span>
        </div>
      </div>

      <div id="title" className="overlay">
        <div className="card">
          <p className="eyebrow">Keeper's log · Night watch</p>
          <h1>Beam Keeper</h1>
          <p>
            Ships are sailing blind toward the reef. Hold your lamp on each one until its
            captain sees the rocks and turns away.
          </p>
          <ul className="rules">
            <li>
              <b>Aim</b> by moving the mouse or dragging. Arrow keys work too.
            </li>
            <li>
              <b>Skiffs</b> turn fast. <b>Trawlers</b> need longer. <b>Liners</b> need a
              long, steady look.
            </li>
            <li>Three wrecks and your watch is over.</li>
          </ul>
          <button id="play" className="btn" type="button">
            Light the lamp
          </button>
        </div>
      </div>

      <div id="over" className="overlay" hidden={true}>
        <div className="card">
          <p className="eyebrow">Watch ended</p>
          <h2>The reef won tonight</h2>
          <div className="stats">
            <div>
              <span className="label">Turned</span>
              <span id="sScore">0</span>
            </div>
            <div>
              <span className="label">Watch</span>
              <span id="sTime">0:00</span>
            </div>
            <div>
              <span className="label">Best</span>
              <span id="sBest">0</span>
            </div>
          </div>
          <button id="again" className="btn" type="button">
            Next night
          </button>
        </div>
      </div>
    </>
  );
}
