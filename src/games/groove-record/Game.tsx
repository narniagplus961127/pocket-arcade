import { useEffect } from 'react';
import { GameLifecycle } from '../../shared/GameLifecycle';
import { usePageStyles } from '../../shared/usePageStyles';
import { startGame } from './engine';
import styles from './styles.generated.css?inline';

/** Groove Record: React owns the interface; the engine draws and updates the game. */
export default function Game() {
  usePageStyles(styles, 'Groove Record');
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
      <canvas id="c" aria-label="Record turntable"></canvas>

      <div className="hud">
        <div>
          <span className="label">Score</span>
          <span id="score" className="big">
            0
          </span>
          <div className="groove" aria-label="Groove meter">
            <i id="groove"></i>
          </div>
        </div>
        <div className="right">
          <span className="label">Combo · BPM</span>
          <span id="combo" className="big">
            0
          </span>
          <span className="label" id="bpm">
            96 bpm
          </span>
        </div>
      </div>

      <div id="title" className="overlay">
        <div className="card">
          <p className="eyebrow">Side A · Track 1</p>
          <h1>Groove Record</h1>
          <p>
            Beats roll out from the record's label toward four pads on the rim. Hit each
            pad as a beat reaches it, and the pads play the melody. Every 8 bars the tempo
            picks up.
          </p>
          <div className="keys">
            <span>
              <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd> <kbd>←</kbd>
            </span>
            <span>or W D S A, one per pad</span>
            <span>
              <kbd>Tap</kbd>
            </span>
            <span>the matching side of the record on touch screens</span>
          </div>
          <p>Misses drain the groove meter. When it's empty, the needle lifts.</p>
          <button id="play" className="btn" type="button">
            Drop the needle
          </button>
        </div>
      </div>

      <div id="over" className="overlay" hidden={true}>
        <div className="card">
          <p className="eyebrow">Needle lifted</p>
          <h2>That's the record</h2>
          <div className="stats">
            <div>
              <b id="sScore">0</b>
              <span>Score</span>
            </div>
            <div>
              <b id="sCombo">0</b>
              <span>Max combo</span>
            </div>
            <div>
              <b id="sBest">0</b>
              <span>Best</span>
            </div>
          </div>
          <p id="sAcc">Perfect hits: 0</p>
          <button id="again" className="btn" type="button">
            Flip it over
          </button>
        </div>
      </div>
    </>
  );
}
