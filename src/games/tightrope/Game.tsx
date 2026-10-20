import { useEffect } from 'react';
import { GameLifecycle } from '../../shared/GameLifecycle';
import { usePageStyles } from '../../shared/usePageStyles';
import { startGame } from './engine';
import styles from './styles.generated.css?inline';

/** Big Top Tightrope: React owns the interface; the engine draws and updates the game. */
export default function Game() {
  usePageStyles(styles, 'Big Top Tightrope');
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
      <canvas id="c" aria-label="Circus tent and tightrope"></canvas>

      <div className="hud">
        <div>
          <span>Distance</span>
          <b id="dist">0 m</b>
        </div>
        <div
          style={{
            textAlign: 'right',
          }}
        >
          <span>Best</span>
          <b id="best">0 m</b>
        </div>
      </div>

      <div className="sides" aria-hidden="false">
        <button type="button" data-s="-1" aria-label="Lean left">
          ◀ LEAN
        </button>
        <button type="button" data-s="1" aria-label="Lean right">
          LEAN ▶
        </button>
      </div>

      <div id="title" className="overlay">
        <div className="card">
          <h1>Big Top Tightrope</h1>
          <p>
            Ladies and gentlemen! The Great Zelda walks the high wire, and the wire keeps
            getting longer. She walks on her own. Your job is to keep her balanced.
          </p>
          <p>
            Lean against the wobble with <b>← →</b>, A/D, or by holding the left or right
            half of the screen. Watch the pole. Gusts and the swaying rope get worse the
            farther she goes.
          </p>
          <button id="play" className="btn" type="button">
            Step onto the wire
          </button>
        </div>
      </div>

      <div id="over" className="overlay" hidden={true}>
        <div className="card">
          <h2>Into the net!</h2>
          <p id="oText"></p>
          <button id="again" className="btn" type="button">
            Climb back up
          </button>
        </div>
      </div>
    </>
  );
}
