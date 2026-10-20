import { useEffect } from 'react';
import { GameLifecycle } from '../../shared/GameLifecycle';
import { usePageStyles } from '../../shared/usePageStyles';
import { startGame } from './engine';
import styles from './styles.generated.css?inline';

/** Mushroom Forage: React owns the interface; the engine draws and updates the game. */
export default function Game() {
  usePageStyles(styles, 'Mushroom Forage');
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
        <div>
          <h1>Mushroom Forage</h1>
          <p className="tag">
            Somewhere under this moss are poisonous toadstools. Uncover the safe ground
            and mark every toadstool to fill your basket.
          </p>
        </div>
        <div className="stats">
          <div className="chip">
            <span>Toadstools left</span>
            <b id="left">10</b>
          </div>
          <div className="chip">
            <span>Time</span>
            <b id="time">0</b>s
          </div>
          <div className="chip">
            <span>Best</span>
            <b id="best">–</b>
          </div>
        </div>
        <div className="frame">
          <div id="grid" className="grid" role="grid" aria-label="Forest floor"></div>
        </div>
        <div id="msg" className="msg" aria-live="polite">
          Your first dig is always safe.
        </div>
        <div className="controls">
          <button id="mode" className="ctl" type="button" aria-pressed="false">
            Mark mode: off
          </button>
          <button className="ctl size" type="button" data-s="9,10">
            Glade 9×9
          </button>
          <button className="ctl size" type="button" data-s="12,24">
            Grove 12×12
          </button>
          <button className="ctl size" type="button" data-s="14,38">
            Deep wood 14×14
          </button>
        </div>
        <p className="note">
          Each number counts the toadstools in the eight plots touching it. Right-click,
          long-press, or switch on mark mode to flag a toadstool. Clicking an uncovered
          number whose flags are all placed clears its other neighbours.
        </p>
      </main>
    </>
  );
}
