import { useEffect } from 'react';
import { GameLifecycle } from '../../shared/GameLifecycle';
import { usePageStyles } from '../../shared/usePageStyles';
import { startGame } from './engine';
import styles from './styles.generated.css?inline';

/** Hive Defense: React owns the interface; the engine draws and updates the game. */
export default function Game() {
  usePageStyles(styles, 'Hive Defense');
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
      <main>
        <header>
          <div>
            <h1>Hive Defense</h1>
            <p className="tag">
              Plant guards along the path before the wasps reach the hive.
            </p>
          </div>
          <div className="stats">
            <div>
              <span>Wave</span>
              <b id="wave">0</b>
            </div>
            <div>
              <span>Nectar</span>
              <b id="money">0</b>
            </div>
            <div>
              <span>Hive</span>
              <b id="lives">20</b>
            </div>
          </div>
        </header>
        <div className="map">
          <canvas id="c" aria-label="Meadow map"></canvas>
          <div id="over" className="over">
            <div>
              <h2 id="oTitle">The meadow is quiet… for now</h2>
              <p id="oText">
                Pick a guard below, then tap a grassy cell to plant it. Wasps follow the
                dirt path to the hive, and each one that reaches it costs the hive honey.
                Waves get tougher as you go.
              </p>
              <button id="go" className="btn" type="button">
                Begin
              </button>
            </div>
          </div>
        </div>
        <div className="shop">
          <button type="button" data-t="0" aria-pressed="true">
            <b>Pollen Flower · 30</b>
            <span>Quick single shots</span>
          </button>
          <button type="button" data-t="1" aria-pressed="false">
            <b>Honey Pot · 40</b>
            <span>Slows everything nearby</span>
          </button>
          <button type="button" data-t="2" aria-pressed="false">
            <b>Guard Bees · 75</b>
            <span>Heavy splash stings</span>
          </button>
          <button id="next" className="wave" type="button">
            Send wave
          </button>
        </div>
        <p className="note">
          You earn nectar for every wasp you stop, plus a bonus for clearing each wave.
          Tap a planted guard to sell it for half price. Hornets are tough, and beetles
          are fast.
        </p>
      </main>
    </>
  );
}
