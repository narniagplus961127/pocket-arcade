import React, { useState, useMemo, useEffect } from 'react';
import { usePageStyles } from '../../shared/usePageStyles';
import styles from './styles.generated.css?inline';

// ---------- Sound ----------

let audioCtx = null;
function playTone(freq, duration = 0.08, type = 'triangle', volume = 0.05) {
  try {
    audioCtx = audioCtx || new window.AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const now = audioCtx.currentTime;
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  } catch (e) {
    // Audio is optional.
  }
}

// ---------- Quilt artwork ----------
// Draws a random patchwork quilt on a canvas and returns it as an image URL.

const PALETTES = [
  ['#e8505b', '#f9d56e', '#14b1ab', '#f3ecc2', '#2d4059'],
  ['#ff8c61', '#ce6a85', '#985277', '#5c374c', '#faa275'],
  ['#264653', '#2a9d8f', '#e9c46a', '#f4a261', '#e76f51'],
  ['#3d5a80', '#98c1d9', '#e0fbfc', '#ee6c4d', '#293241'],
];
function paintQuilt(n) {
  const size = 600;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const palette = PALETTES[Math.floor(Math.random() * PALETTES.length)];
  const pick = () => palette[Math.floor(Math.random() * palette.length)];
  const block = size / (n * 2);
  for (let r = 0; r < n * 2; r++) {
    for (let c = 0; c < n * 2; c++) {
      const x = c * block;
      const y = r * block;
      const a = pick();
      const b = pick();
      ctx.fillStyle = a;
      ctx.fillRect(x, y, block, block);
      ctx.fillStyle = b;
      const style = (r * 3 + c * 7) % 4;
      ctx.beginPath();
      if (style === 0) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + block, y);
        ctx.lineTo(x, y + block);
      } else if (style === 1) {
        ctx.arc(x + block / 2, y + block / 2, block * 0.32, 0, Math.PI * 2);
      } else if (style === 2) {
        ctx.rect(x + block * 0.25, y, block * 0.5, block);
      } else {
        ctx.moveTo(x + block / 2, y);
        ctx.lineTo(x + block, y + block / 2);
        ctx.lineTo(x + block / 2, y + block);
        ctx.lineTo(x, y + block / 2);
      }
      ctx.fill();
    }
  }

  // A big motif across the whole quilt so pieces are easier to place.
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, size);
  ctx.lineTo(size, 0);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Stitching
  ctx.setLineDash([8, 6]);
  ctx.strokeStyle = 'rgba(0,0,0,.35)';
  ctx.lineWidth = 2;
  for (let i = 1; i < n; i++) {
    ctx.beginPath();
    ctx.moveTo((i * size) / n, 0);
    ctx.lineTo((i * size) / n, size);
    ctx.moveTo(0, (i * size) / n);
    ctx.lineTo(size, (i * size) / n);
    ctx.stroke();
  }
  return canvas.toDataURL('image/png');
}

// ---------- Components ----------

function Piece({ piece, n, image, selected, onClick, onRotate, size }) {
  const pos = `${(piece.col / (n - 1)) * 100}% ${(piece.row / (n - 1)) * 100}%`;
  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={(e) => {
        e.preventDefault();
        onRotate && onRotate();
      }}
      aria-label={`Quilt square${selected ? ', selected' : ''}`}
      className={`relative block rounded-sm shadow-md transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-thread
          ${selected ? 'ring-4 ring-thread z-10 scale-105' : ''}`}
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${image})`,
        backgroundSize: `${n * 100}% ${n * 100}%`,
        backgroundPosition: pos,
        transform: `rotate(${piece.rotation * 90}deg)${selected ? ' scale(1.05)' : ''}`,
      }}
    />
  );
}

function App() {
  usePageStyles(styles, 'Patchwork Jigsaw');

  // Close the synthesizer when this game leaves the page.
  React.useEffect(
    () => () => {
      if (audioCtx) {
        void audioCtx.close().catch(() => {});
        audioCtx = null;
      }
    },
    [],
  );
  const [n, setN] = useState(4);
  const [rotate, setRotate] = useState(false);
  const [image, setImage] = useState(() => paintQuilt(4));
  const [pieces, setPieces] = useState([]); // { id, row, col, rotation, slot (null = in basket) }
  const [selected, setSelected] = useState(null);
  const [moves, setMoves] = useState(0);
  const build = (size = n, withRotation = rotate) => {
    setImage(paintQuilt(size));
    const list = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        list.push({
          id: r * size + c,
          row: r,
          col: c,
          rotation: withRotation ? Math.floor(Math.random() * 4) : 0,
          slot: null,
        });
      }
    }
    setPieces(list.sort(() => Math.random() - 0.5));
    setSelected(null);
    setMoves(0);
  };
  useEffect(() => {
    build();
  }, []);
  const solved =
    pieces.length > 0 && pieces.every((p) => p.slot === p.id && p.rotation === 0);
  const placedCorrect = pieces.filter((p) => p.slot === p.id && p.rotation === 0).length;
  useEffect(() => {
    if (solved)
      [523, 659, 784, 1047].forEach((f, i) =>
        setTimeout(() => playTone(f, 0.25), i * 110),
      );
  }, [solved]);
  const pieceInSlot = (slot) => pieces.find((p) => p.slot === slot);
  const clickSlot = (slot) => {
    if (solved) return;
    const occupant = pieceInSlot(slot);
    if (selected === null) {
      if (occupant) setSelected(occupant.id);
      return;
    }
    const moving = pieces.find((p) => p.id === selected);
    const fromSlot = moving.slot;
    setPieces((all) =>
      all.map((p) => {
        if (p.id === moving.id)
          return {
            ...p,
            slot,
          };
        if (occupant && p.id === occupant.id)
          return {
            ...p,
            slot: fromSlot,
          }; // swap
        return p;
      }),
    );
    setSelected(null);
    setMoves((m) => m + 1);
    const willBeRight = moving.id === slot && moving.rotation === 0;
    playTone(willBeRight ? 880 : 420, 0.09);
  };
  const clickBasket = (piece) => {
    if (selected === piece.id) setSelected(null);
    else setSelected(piece.id);
    playTone(520, 0.04, 'sine', 0.03);
  };
  const rotatePiece = (id) => {
    setPieces((all) =>
      all.map((p) =>
        p.id === id
          ? {
              ...p,
              rotation: (p.rotation + 1) % 4,
            }
          : p,
      ),
    );
    playTone(600, 0.04, 'sine', 0.03);
  };
  const basket = pieces.filter((p) => p.slot === null);
  const slotSize = `calc(min(560px, 100vw - 48px) / ${n})`;
  const basketSize = `calc(min(560px, 100vw - 48px) / ${n + 2})`;
  return (
    <main className="font-body max-w-[1100px] mx-auto py-6 flex flex-col gap-5">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-[clamp(38px,10vw,58px)] leading-none font-extrabold">
            Patchwork Jigsaw
          </h1>
          <p className="text-muted mt-1">
            Sew the quilt back together, one square at a time.
          </p>
        </div>
        <div className="flex gap-5">
          <div>
            <div className="text-[11px] font-semibold tracking-[.14em] uppercase text-muted">
              In place
            </div>
            <div className="font-display text-2xl">
              {placedCorrect}/{n * n}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold tracking-[.14em] uppercase text-muted">
              Moves
            </div>
            <div className="font-display text-2xl">{moves}</div>
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[auto_minmax(0,1fr)] items-start">
        <div
          className="mat-grid p-3 rounded-xl shadow-xl"
          style={{
            width: 'fit-content',
          }}
        >
          <div
            className="grid border-2 border-dashed border-white/50"
            style={{
              gridTemplateColumns: `repeat(${n}, ${slotSize})`,
            }}
          >
            {Array.from({
              length: n * n,
            }).map((_, slot) => {
              const occupant = pieceInSlot(slot);
              return (
                <div
                  key={String(String(slot))}
                  className="relative"
                  style={{
                    width: slotSize,
                    height: slotSize,
                  }}
                >
                  {occupant ? (
                    <Piece
                      piece={occupant}
                      n={n}
                      image={image}
                      size={slotSize}
                      selected={selected === occupant.id}
                      onClick={() => clickSlot(slot)}
                      onRotate={() => rotatePiece(occupant.id)}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => clickSlot(slot)}
                      aria-label={`Empty square ${slot + 1}`}
                      className="w-full h-full border border-white/15 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-thread"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="text-[11px] font-semibold tracking-[.14em] uppercase text-muted">
            Basket · {basket.length} squares
          </div>
          <div className="flex flex-wrap gap-2 min-h-[80px] p-3 rounded-xl bg-mat/10 border-2 border-dashed border-mat/40">
            {basket.map((p) => (
              <Piece
                key={String(String(p.id))}
                piece={p}
                n={n}
                image={image}
                size={basketSize}
                selected={selected === p.id}
                onClick={() => clickBasket(p)}
                onRotate={() => rotatePiece(p.id)}
              />
            ))}
            {!basket.length && (
              <span className="text-muted text-sm self-center">
                Every square is on the mat.
              </span>
            )}
          </div>

          {selected !== null && rotate && (
            <button
              type="button"
              onClick={() => rotatePiece(selected)}
              className="self-start rounded-full border-2 border-ink px-4 py-2 font-semibold"
            >
              ⟳ Rotate selected square
            </button>
          )}

          {solved && (
            <p className="font-display text-2xl text-thread" role="status">
              The quilt is finished in {moves} moves!
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {[3, 4, 5, 6].map((size) => (
              <button
                key={String(String(size))}
                type="button"
                onClick={() => {
                  setN(size);
                  build(size);
                }}
                className={`rounded-full border-2 border-ink px-3.5 py-1.5 text-sm font-semibold
                    focus-visible:outline focus-visible:outline-2 focus-visible:outline-thread ${n === size ? 'bg-ink text-bg' : ''}`}
              >
                {size}×{size}
              </button>
            ))}
            <label className="flex items-center gap-2 text-sm ml-2">
              <input
                type="checkbox"
                checked={rotate}
                onChange={(e) => {
                  setRotate(e.target.checked);
                  build(n, e.target.checked);
                }}
              />
              Rotated squares
            </label>
          </div>

          <p className="text-sm text-muted leading-relaxed">
            Tap a square to pick it up, then tap a spot on the mat to place it. Placing it
            on another square swaps the two. With rotated squares switched on, right-click
            a square or use the rotate button to turn it.
          </p>
        </div>
      </div>
    </main>
  );
}
export default App;
