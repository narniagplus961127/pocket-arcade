import { useEffect } from 'react';
import { GameLifecycle } from '../../shared/GameLifecycle';
import { usePageStyles } from '../../shared/usePageStyles';
import { startGame } from './engine';
import styles from './styles.generated.css?inline';

/** Petal Storm: React owns the interface; the engine draws and updates the game. */
export default function Game() {
  usePageStyles(styles, 'Petal Storm');
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
      <canvas id="c" aria-label="Spring sky"></canvas>

      <div className="hud">
        <div>
          <span>SURVIVED</span>
          <b id="time">0.0s</b>
        </div>
        <div
          style={{
            textAlign: 'center',
          }}
        >
          <span>DEW</span>
          <b id="dew">0</b>
        </div>
        <div
          style={{
            textAlign: 'right',
          }}
        >
          <span>WINGS</span>
          <b id="lives">♥♥♥</b>
        </div>
      </div>

      <div id="title" className="overlay">
        <div className="card">
          <h1>Petal Storm</h1>
          <p>
            The old cherry tree is in a strange mood, flinging out spirals and rings of
            petals. You're a small bee, and a petal is enough to knock you out of the air.
          </p>
          <p>
            Move with the mouse, a finger (the bee hovers just above it), or the arrow
            keys. Only the bee's glowing centre counts as a hit. Collect dewdrops for
            points. See how long you can last.
          </p>
          <button id="play" className="btn" type="button">
            Fly in
          </button>
        </div>
      </div>

      <div id="over" className="overlay" hidden={true}>
        <div className="card">
          <h2>Blown away</h2>
          <p id="oText"></p>
          <button id="again" className="btn" type="button">
            Fly again
          </button>
        </div>
      </div>
    </>
  );
}
