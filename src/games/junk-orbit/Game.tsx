import { useEffect } from 'react';
import { GameLifecycle } from '../../shared/GameLifecycle';
import { usePageStyles } from '../../shared/usePageStyles';
import { startGame } from './engine';
import styles from './styles.generated.css?inline';

/** Junk Orbit: React owns the interface; the engine draws and updates the game. */
export default function Game() {
  usePageStyles(styles, 'Junk Orbit');
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
      <canvas id="c" aria-label="Orbital debris field"></canvas>

      <div className="block" aria-label="Status">
        <div>SCORE</div>
        <div id="score">0</div>
        <div>SECTOR</div>
        <div id="wave">1</div>
        <div>HULLS</div>
        <div id="lives">3</div>
      </div>

      <div className="touch">
        <div>
          <button type="button" data-k="left" aria-label="Rotate left">
            ◀
          </button>
          <button type="button" data-k="right" aria-label="Rotate right">
            ▶
          </button>
        </div>
        <div>
          <button type="button" data-k="thrust" aria-label="Thrust">
            THR
          </button>
          <button type="button" data-k="fire" aria-label="Fire">
            FIRE
          </button>
        </div>
      </div>

      <div id="title" className="overlay">
        <div className="card">
          <p className="dwg">DWG NO. JO-01 · SCALE 1:1 · REV A</p>
          <h1>Junk Orbit</h1>
          <p>
            Low orbit is crowded with dead satellites and loose bolts. Fly the cleanup tug
            and break every piece of junk down to dust before it hits you.
          </p>
          <div className="spec">
            <b>← →</b>
            <span>rotate</span>
            <b>↑</b>
            <span>thrust</span>
            <b>Space</b>
            <span>fire the laser</span>
            <b>Phones</b>
            <span>buttons along the bottom</span>
          </div>
          <button id="play" className="btn" type="button">
            LAUNCH TUG
          </button>
        </div>
      </div>

      <div id="over" className="overlay" hidden={true}>
        <div className="card">
          <p className="dwg">INCIDENT REPORT</p>
          <h2>Tug lost</h2>
          <p id="oText"></p>
          <button id="again" className="btn" type="button">
            REBUILD
          </button>
        </div>
      </div>
    </>
  );
}
