import { useEffect } from 'react';
import { GameLifecycle } from '../../shared/GameLifecycle';
import { usePageStyles } from '../../shared/usePageStyles';
import { startGame } from './engine';
import styles from './styles.generated.css?inline';

/** Paint Flood: React owns the interface; the engine draws and updates the game. */
export default function Game() {
  usePageStyles(styles, 'Paint Flood');
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
          <h1>Paint Flood</h1>
          <p className="tag">
            Flood the whole canvas with one colour before the paint runs out.
          </p>
        </div>
        <div className="meta">
          <span>
            Moves <span id="moves">0</span> / <span id="max">25</span>
          </span>
          <span>
            Covered <span id="pct">0</span>%
          </span>
        </div>
        <div className="tube" aria-hidden="true">
          <i id="tubeFill"></i>
        </div>
        <div className="board">
          <canvas id="c" aria-label="Paint grid"></canvas>
        </div>
        <div id="pots" className="pots" aria-label="Paint pots"></div>
        <div id="msg" className="msg" aria-live="polite"></div>
        <div className="row">
          <button className="ctl size" type="button" data-s="10,17">
            Sketch 10×10
          </button>
          <button className="ctl size" type="button" data-s="14,25" aria-pressed="true">
            Study 14×14
          </button>
          <button className="ctl size" type="button" data-s="18,32">
            Mural 18×18
          </button>
        </div>
        <p className="note">
          Your paint starts in the top-left corner. Picking a pot recolours your whole
          region, and it soaks up every touching square of that colour. Plan ahead to grab
          big patches. Keys 1–6 pick a pot.
        </p>
      </main>
    </>
  );
}
