import { useEffect } from 'react';
import { GameLifecycle } from '../../shared/GameLifecycle';
import { usePageStyles } from '../../shared/usePageStyles';
import { startGame } from './engine';
import styles from './styles.generated.css?inline';

/** Quick Draw: React owns the interface; the engine draws and updates the game. */
export default function Game() {
  usePageStyles(styles, 'Quick Draw');
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
      <canvas id="c" aria-label="Main street at noon"></canvas>

      <div className="hud">
        <div>
          <span>Outlaws beaten</span>
          <b id="wins">0</b>
        </div>
        <div
          style={{
            textAlign: 'right',
          }}
        >
          <span>Your last draw</span>
          <b id="last">—</b>
        </div>
      </div>

      <div id="call" className="call" aria-live="assertive"></div>

      <div id="title" className="overlay">
        <div className="poster">
          <div className="w">WANTED</div>
          <h1>Fastest Hand in the West</h1>
          <p>
            Outlaws are lining up to duel you at noon. Wait for the word <b>DRAW!</b>,
            then click, tap, or press Space as fast as you can. Every outlaw is quicker
            than the last.
          </p>
          <p>Draw before the call and you've lost the duel.</p>
          <div className="reward">Reward: Glory</div>
          <button id="play" className="btn" type="button">
            Step into the street
          </button>
        </div>
      </div>

      <div id="over" className="overlay" hidden={true}>
        <div className="poster">
          <div className="w">GAME OVER</div>
          <h2 id="oTitle">Outdrawn</h2>
          <p id="oText"></p>
          <button id="again" className="btn" type="button">
            Duel again
          </button>
        </div>
      </div>
    </>
  );
}
