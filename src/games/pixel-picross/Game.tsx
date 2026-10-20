import { useEffect } from 'react';
import { GameLifecycle } from '../../shared/GameLifecycle';
import { usePageStyles } from '../../shared/usePageStyles';
import { startGame } from './engine';
import styles from './styles.generated.css?inline';

/** Pixel Picross: React owns the interface; the engine draws and updates the game. */
export default function Game() {
  usePageStyles(styles, 'Pixel Picross');
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
          <h1>Pixel Picross</h1>
          <p className="tag">
            Use the number clues to work out which squares make the hidden picture.
          </p>
        </div>
        <div className="row">
          <button id="tFill" className="ctl" type="button" aria-pressed="true">
            ■ Fill
          </button>
          <button id="tMark" className="ctl" type="button" aria-pressed="false">
            × Mark empty
          </button>
          <span
            style={{
              flex: '1',
            }}
          ></span>
          <button className="ctl size" type="button" data-n="5">
            5×5
          </button>
          <button className="ctl size" type="button" data-n="10">
            10×10
          </button>
          <button className="ctl size" type="button" data-n="15">
            15×15
          </button>
        </div>
        <div className="wrap">
          <table id="grid" aria-label="Picross grid"></table>
        </div>
        <div id="msg" className="msg" aria-live="polite"></div>
        <p className="note">
          Each clue lists the runs of filled squares in that row or column, in order, with
          at least one gap between runs. For example, "3 1" means a run of three, then
          later a single square. Drag to paint several squares at once. Right-click (or
          switch to Mark) to cross off squares you know are empty. The puzzle solves
          itself as soon as your filled squares match every clue.
        </p>
      </main>
    </>
  );
}
