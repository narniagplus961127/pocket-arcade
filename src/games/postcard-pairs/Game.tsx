import { useEffect } from 'react';
import { GameLifecycle } from '../../shared/GameLifecycle';
import { usePageStyles } from '../../shared/usePageStyles';
import { startGame } from './engine';
import styles from './styles.generated.css?inline';

/** Postcard Pairs: React owns the interface; the engine draws and updates the game. */
export default function Game() {
  usePageStyles(styles, 'Postcard Pairs');
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
        <div className="airmail" aria-hidden="true"></div>
        <div>
          <h1>Postcard Pairs</h1>
          <p className="tag-line">Flip two stamps at a time. Find every matching pair.</p>
        </div>
        <div className="tags">
          <div className="lt">
            <span>Flips</span>
            <b id="moves">0</b>
          </div>
          <div className="lt">
            <span>Time</span>
            <b id="time">0</b>s
          </div>
          <div className="lt">
            <span>Best</span>
            <b id="best">–</b>
          </div>
        </div>
        <div id="grid" className="grid" aria-label="Stamp cards"></div>
        <div id="msg" className="msg" aria-live="polite"></div>
        <div className="sizes">
          <button className="ctl" type="button" data-s="4,4">
            Weekend · 16
          </button>
          <button className="ctl" type="button" data-s="5,4">
            Holiday · 20
          </button>
          <button className="ctl" type="button" data-s="6,6">
            Grand tour · 36
          </button>
        </div>
      </main>
    </>
  );
}
