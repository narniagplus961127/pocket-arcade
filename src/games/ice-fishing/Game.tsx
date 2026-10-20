import { useEffect } from 'react';
import { GameLifecycle } from '../../shared/GameLifecycle';
import { usePageStyles } from '../../shared/usePageStyles';
import { startGame } from './engine';
import styles from './styles.generated.css?inline';

/** Ice Hole Angler: React owns the interface; the engine draws and updates the game. */
export default function Game() {
  usePageStyles(styles, 'Ice Hole Angler');
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
      <canvas id="c" aria-label="Frozen lake cutaway"></canvas>

      <div className="hud">
        <div>
          <span>Catch</span>
          <b id="score">0</b>
        </div>
        <div
          style={{
            textAlign: 'right',
          }}
        >
          <span>Daylight</span>
          <b id="time">90</b>
        </div>
      </div>

      <div id="title" className="overlay">
        <div className="card">
          <h1>Ice Hole Angler</h1>
          <p>
            <b>Hold</b> (mouse, finger, or Space) to let the line down. <b>Let go</b> to
            reel it back up. Fish bite when they swim into the hook.
          </p>
          <p>
            Once something bites, the reel takes over. Hold to reel in and let go to give
            it slack. Keep the tension needle in the green band until the fish is landed.
            Pull too hard and the line snaps. Too much slack and it gets away.
          </p>
          <div className="fishes">
            <b>Perch</b>
            <span>2 pts, shallow, gentle</span>
            <b>Trout</b>
            <span>5 pts, middle depth</span>
            <b>Pike</b>
            <span>10 pts, deep and strong</span>
            <b>Golden char</b>
            <span>25 pts, rare</span>
          </div>
          <button id="play" className="btn" type="button">
            Drill the hole
          </button>
        </div>
      </div>

      <div id="over" className="overlay" hidden={true}>
        <div className="card">
          <h2>Sun's going down</h2>
          <p id="oText"></p>
          <button id="again" className="btn" type="button">
            Fish another day
          </button>
        </div>
      </div>
    </>
  );
}
