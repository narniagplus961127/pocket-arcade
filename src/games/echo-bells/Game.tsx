import { useEffect } from 'react';
import { GameLifecycle } from '../../shared/GameLifecycle';
import { usePageStyles } from '../../shared/usePageStyles';
import { startGame } from './engine';
import styles from './styles.generated.css?inline';

/** Echo Bells: React owns the interface; the engine draws and updates the game. */
export default function Game() {
  usePageStyles(styles, 'Echo Bells');
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
          <h1>Echo Bells</h1>
          <p className="sub">
            The temple bells ring a tune. Ring it back in the same order. Each round adds
            one more note.
          </p>
        </div>
        <div id="status" className="status" aria-live="polite">
          Press Begin to hear the first tune.
        </div>
        <div className="frame">
          <div className="beam"></div>
          <div id="bells" className="bells"></div>
        </div>
        <div id="dots" className="dots" aria-hidden="true"></div>
        <div className="row">
          <div className="stat">
            <span className="k">Round</span>
            <span id="round" className="v">
              0
            </span>
          </div>
          <div className="stat">
            <span className="k">Mercy</span>
            <span id="mercy" className="v">
              1
            </span>
          </div>
          <div className="stat">
            <span className="k">Best</span>
            <span id="best" className="v">
              0
            </span>
          </div>
        </div>
        <div className="row">
          <button id="go" className="btn" type="button">
            Begin
          </button>
          <button id="replay" className="btn ghost" type="button" hidden={true}>
            Hear it again (uses mercy)
          </button>
        </div>
        <p className="rules">
          Click a bell or press <b>1–6</b>. From round 5, some rounds are marked{' '}
          <b>Echo</b>: ring that tune <b>backwards</b>. You get one <b>mercy</b> per game.
          It replays the tune after a mistake, or on request.
        </p>
      </main>
    </>
  );
}
