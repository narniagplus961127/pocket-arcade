import { useEffect } from 'react';
import { GameLifecycle } from '../../shared/GameLifecycle';
import { usePageStyles } from '../../shared/usePageStyles';
import { startGame } from './engine';
import styles from './styles.generated.css?inline';

/** Comet Courier: React owns the interface; the engine draws and updates the game. */
export default function Game() {
  usePageStyles(styles, 'Comet Courier');
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
      <canvas id="c" aria-label="Game field"></canvas>

      <div className="hud">
        <div>
          <span className="label">Score</span>
          <span id="score" className="score">
            0
          </span>
        </div>
        <div className="right">
          <div className="best">
            <span className="label">Best</span>
            <span id="best">0</span>
          </div>
          <button id="mute" className="mute" type="button">
            Sound on
          </button>
        </div>
      </div>

      <div id="combo" className="combo" hidden={true}></div>

      <div id="toast" className="toast" hidden={true}>
        <span className="label" id="toastLabel">
          Sector 1
        </span>
        <strong id="toastName">Home Orbit</strong>
      </div>

      <div id="hint" className="hint" hidden={true}>
        Tap anywhere to let go
      </div>

      <div id="titleCard" className="overlay">
        <div className="card">
          <p className="eyebrow">One comet · a sky full of planets</p>
          <h1 className="grad">
            Comet
            <br />
            Courier
          </h1>
          <p className="lede">
            You orbit a planet. Let go and you fly off along your orbit's edge. Catch the
            next planet's ring and keep climbing. Orbits decay, so don't linger.
          </p>
          <ul className="keys">
            <li>
              <b>Tap / Space</b>Let go of the orbit
            </li>
            <li>
              <b>Hop quick</b>Leave within a second to grow a chain and multiply points
            </li>
            <li>
              <b>Sparks</b>Fly through them for bonus points
            </li>
            <li>
              <b>Rocks</b>Show up in later sectors. Don't touch them
            </li>
          </ul>
          <button id="play" className="btn" type="button">
            Launch
          </button>
        </div>
      </div>

      <div id="overCard" className="overlay" hidden={true}>
        <div className="card">
          <p className="eyebrow">Delivery interrupted</p>
          <h2 className="grad">Orbit lost</h2>
          <p id="reason" className="reason">
            Drifted into deep space.
          </p>
          <span id="newBest" className="badge" hidden={true}>
            New best
          </span>
          <div className="stats">
            <div className="stat">
              <span className="label">Score</span>
              <span id="sScore">0</span>
            </div>
            <div className="stat">
              <span className="label">Planets</span>
              <span id="sPlanets">0</span>
            </div>
            <div className="stat">
              <span className="label">Sparks</span>
              <span id="sSparks">0</span>
            </div>
            <div className="stat">
              <span className="label">Longest chain</span>
              <span id="sChain">0</span>
            </div>
          </div>
          <button id="again" className="btn" type="button">
            Fly again
          </button>
          <p className="small">Space or Enter also relaunches.</p>
        </div>
      </div>
    </>
  );
}
