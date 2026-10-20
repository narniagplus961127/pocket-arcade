import React, { useState, useEffect, useRef } from 'react';
import { usePageStyles } from '../../shared/usePageStyles';
import styles from './styles.generated.css?inline';
type GameControls = {
  phase?: string;
  cursor?: {
    x: number;
    y: number;
    show: boolean;
  };
  nextRoom?: () => void;
  start?: () => void;
  check?: (x: any, y: any) => void;
  takeHint?: () => void;
};

// ---------- Sound ----------

let audioCtx = null;
function playTone(freq, duration = 0.08, type = 'sine', volume = 0.04) {
  try {
    audioCtx = audioCtx || new window.AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const now = audioCtx.currentTime;
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  } catch (e) {
    // Audio is optional.
  }
}

// ---------- Helpers ----------

const rnd = (a, b) => a + Math.random() * (b - a);
const rint = (a, b) => Math.floor(rnd(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Axis-aligned box overlap with some breathing room.
function overlaps(a, b, pad = 4) {
  return (
    a.x < b.x + b.w + pad &&
    b.x < a.x + a.w + pad &&
    a.y < b.y + b.h + pad &&
    b.y < a.y + a.h + pad
  );
}
const boxOf = (it) => ({
  x: it.x,
  y: it.y,
  w: it.w,
  h: it.h,
});
function union(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
}

// The area that counts as a hit: the difference box plus a margin, never smaller than a fingertip.
function hitBox(b) {
  const w = Math.max(28, b.w + 10);
  const h = Math.max(28, b.h + 10);
  return {
    x: b.x + b.w / 2 - w / 2,
    y: b.y + b.h / 2 - h / 2,
    w,
    h,
  };
}
const inside = (b, x, y) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
const BEST_KEY = 'twin-rooms-best';
function readBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch (e) {
    return 0;
  }
}

function writeBest(value) {
  try {
    localStorage.setItem(BEST_KEY, String(String(value)));
  } catch (e) {
    /* storage unavailable */
  }
}

// ---------- Room catalogue ----------
// The scene is 400×300 units. The wall meets the floor at FLOOR_Y; furniture stands on BASE_Y.

const W = 400;
const H = 300;
const FLOOR_Y = 212;
const BASE_Y = 238;
const ROUND_MS = 90000;
const PENALTY_MS = 5000;
const PALETTE = [
  '#e0a526',
  '#2a7f7a',
  '#d2622a',
  '#7d8b3a',
  '#e07a5f',
  '#4f6d8f',
  '#e8a3a0',
  '#c94f3d',
  '#f2d16b',
  '#8fb8a8',
  '#3b4b5c',
];
const WOODS = ['#7a4a2a', '#5e3820', '#9a6236'];
const WALLS = [
  '#e8dcc2',
  '#cfe0d6',
  '#f0d2b4',
  '#d5dde6',
  '#e9c9a0',
  '#bcd3c8',
  '#f2e3a7',
];
const FLOORS = ['#a8723f', '#8a5a33', '#b98552', '#7b6a58'];
const FLIPPABLE = ['armchair', 'floorlamp', 'plant', 'frame', 'clock', 'cat', 'bird'];
const MOVABLE = ['frame', 'clock', 'shelf', 'window', 'pendant'];
function makeBooks(width) {
  const books = [];
  let total = 0;
  while (true) {
    const bw = rint(4, 7);
    if (total + bw + 1 > width) break;
    books.push({
      w: bw,
      h: rint(12, 20),
      c: pick(PALETTE),
    });
    total += bw + 1;
  }
  return books;
}

function makeLeaves() {
  return Array.from(
    {
      length: rint(5, 8),
    },
    (_, k) => ({
      a: rnd(-45, 45),
      l: rnd(16, 30),
      dark: k % 2 === 0,
    }),
  );
}

// Each maker returns the size and look of one kind of object. `layer` sets the drawing order.
const MAKERS = {
  window: () => ({
    w: rint(64, 84),
    h: rint(62, 78),
    color: pick(PALETTE),
    sky: pick(['#bfe1ea', '#f5c99b', '#cfe8f0']),
    layer: 1,
  }),
  frame: () => ({
    w: rint(26, 46),
    h: rint(26, 44),
    color: pick(PALETTE),
    color2: pick(PALETTE),
    frame: pick(['#2b2b2b', '#7a4a2a', '#c9a24a']),
    layer: 1,
  }),
  clock: () => {
    const s = rint(30, 38);
    const angles = shuffle([40, 70, 110, 140, 220, 250, 290, 320]);
    return {
      w: s,
      h: s,
      color: pick(['#c9a24a', '#7a4a2a', '#2a7f7a', '#2b2b2b']),
      a1: angles[0],
      a2: angles[1],
      layer: 1,
    };
  },
  shelf: () => {
    const w = rint(56, 76);
    return {
      w,
      h: 28,
      color: pick(WOODS),
      books: makeBooks(w - 16),
      layer: 1,
    };
  },
  pendant: () => ({
    w: 36,
    h: rint(40, 70),
    color: pick(PALETTE),
    layer: 1,
    ceiling: true,
  }),
  sofa: () => ({
    w: rint(100, 128),
    h: 48,
    color: pick(PALETTE),
    layer: 2,
  }),
  armchair: () => ({
    w: 50,
    h: 56,
    color: pick(PALETTE),
    layer: 2,
  }),
  sideboard: () => ({
    w: rint(84, 112),
    h: 40,
    color: pick(PALETTE),
    wood: pick(WOODS),
    doors: rint(2, 4),
    layer: 2,
  }),
  floorlamp: () => ({
    w: 60,
    h: 122,
    color: pick(PALETTE),
    layer: 2,
  }),
  plant: () => ({
    w: rint(38, 46),
    h: rint(56, 74),
    color: pick(PALETTE),
    leaves: makeLeaves(),
    layer: 2,
  }),
  tablelamp: () => ({
    w: 22,
    h: 32,
    color: pick(PALETTE),
    layer: 3,
  }),
  vase: () => ({
    w: 13,
    h: 24,
    color: pick(PALETTE),
    layer: 3,
  }),
  bookstack: () => ({
    w: 24,
    h: 14,
    books: [0, 1, 2].map(() => ({
      c: pick(PALETTE),
    })),
    layer: 3,
  }),
  bird: () => ({
    w: 18,
    h: 15,
    color: pick(PALETTE),
    layer: 3,
  }),
  rug: () => ({
    w: rint(160, 220),
    h: 28,
    color: pick(PALETTE),
    color2: pick(PALETTE),
    layer: 0,
  }),
  cat: () => ({
    w: 36,
    h: 24,
    color: pick(['#2b2b2b', '#e9a35b', '#d9d2c5', '#7a7a7a']),
    layer: 4,
  }),
};
let nextId = 1;
function newItem(type) {
  return {
    id: nextId++,
    type,
    flip: Math.random() < 0.5,
    x: 0,
    y: 0,
    ...MAKERS[type](),
  };
}
const cloneItem = (it) => ({
  ...it,
  books: it.books
    ? it.books.map((b) => ({
        ...b,
      }))
    : undefined,
});

// ---------- Room generator ----------

function generateRoom(level) {
  const items = [];

  // Is this box inside the picture and clear of every solid object (rugs don't count)?
  const fits = (box, list, ignoreId?) =>
    box.x >= 2 &&
    box.x + box.w <= W - 2 &&
    box.y >= 0 &&
    box.y + box.h <= H - 2 &&
    !list.some((o) => o.type !== 'rug' && o.id !== ignoreId && overlaps(box, o, 4));

  // Rug first, so it is drawn under everything.
  const rug = newItem('rug');
  rug.x = rint(8, W - 8 - rug.w);
  rug.y = rint(244, 256);
  items.push(rug);

  // Floor furniture: packed left to right in random order, then spread across the room.
  const floor = [];
  let cursor = 0;
  for (const type of shuffle([
    'sofa',
    'sideboard',
    'armchair',
    'plant',
    'floorlamp',
    'plant',
    'armchair',
  ])) {
    const it = newItem(type);
    if (cursor + it.w > W - 12) continue;
    it.x = cursor;
    it.y = BASE_Y - it.h;
    floor.push(it);
    cursor += it.w + rint(6, 14);
  }
  const last = floor[floor.length - 1];
  const slack = W - 12 - (last.x + last.w);
  let offset = 6;
  floor.forEach((it) => {
    offset += (slack / (floor.length + 1)) * rnd(0.5, 1);
    it.x += Math.round(offset);
  });
  items.push(...floor);

  // Small things on top of each sideboard.
  floor
    .filter((f) => f.type === 'sideboard')
    .forEach((sb) => {
      const count = rint(1, 3);
      for (let k = 0; k < count; k++) {
        const it = newItem(pick(['tablelamp', 'vase', 'bookstack', 'bird']));
        for (let t = 0; t < 20; t++) {
          it.x = rint(sb.x + 2, sb.x + sb.w - 2 - it.w);
          it.y = sb.y - it.h;
          if (!items.some((o) => o.layer === 3 && overlaps(it, o, 3))) {
            items.push(it);
            break;
          }
        }
      }
    });

  // Wall decorations wherever they fit.
  for (const type of [
    'window',
    ...shuffle(['frame', 'frame', 'frame', 'clock', 'shelf', 'pendant', 'frame']),
  ]) {
    const it = newItem(type);
    for (let t = 0; t < 40; t++) {
      it.x = rint(4, W - 4 - it.w);
      it.y = it.ceiling ? 0 : rint(14, FLOOR_Y - 24 - it.h);
      if (fits(it, items)) {
        items.push(it);
        break;
      }
    }
  }

  // ---- Differences ----
  // The twin starts as a copy. Each difference changes one object and records the box to find.
  let twin = items.map(cloneItem);
  const diffs = [];
  const used = new Set();
  const target = Math.min(7, 5 + Math.floor((level - 1) / 2) + rint(0, 1));
  const free = (box) => !diffs.some((d) => overlaps(d.box, box, 3));
  const twinOf = (id) => twin.find((t) => t.id === id);
  const unused = (filter) => items.filter((i) => !used.has(i.id) && filter(i));
  const kinds = ['color', 'color', 'missing', 'extra', 'moved', 'flip'];
  let attempts = 0;
  while (diffs.length < target && attempts < 400) {
    attempts++;
    const kind = pick(kinds);
    if (kind === 'color') {
      const it = pick(unused(() => true));
      if (!it || !free(it)) continue;
      const t = twinOf(it.id);
      if (t.books) {
        // Bookish objects change the colour of a single book.
        const k = rint(0, t.books.length - 1);
        t.books[k].c = pick(PALETTE.filter((c) => c !== t.books[k].c));
      } else {
        t.color = pick(PALETTE.filter((c) => c !== it.color && c !== it.color2));
      }
      used.add(it.id);
      diffs.push({
        kind,
        box: boxOf(it),
      });
    }
    if (kind === 'missing') {
      const it = pick(unused((i) => !['rug', 'sideboard', 'sofa'].includes(i.type)));
      if (!it || !free(it)) continue;
      twin = twin.filter((t) => t.id !== it.id);
      used.add(it.id);
      diffs.push({
        kind,
        box: boxOf(it),
      });
    }
    if (kind === 'extra') {
      const it = newItem(pick(['cat', 'frame', 'clock', 'bird', 'vase', 'plant']));
      const sideboards = twin.filter((t) => t.type === 'sideboard');
      let placed = false;
      for (let t = 0; t < 40 && !placed; t++) {
        let ok = false;
        if (it.type === 'cat') {
          it.x = rint(4, W - 4 - it.w);
          it.y = rint(244, H - 4 - it.h);
          ok = fits(it, twin);
        } else if (it.type === 'frame' || it.type === 'clock') {
          it.x = rint(4, W - 4 - it.w);
          it.y = rint(14, FLOOR_Y - 24 - it.h);
          ok = fits(it, twin);
        } else if (it.type === 'plant') {
          it.x = rint(4, W - 4 - it.w);
          it.y = BASE_Y - it.h;
          ok = fits(it, twin);
        } else if (sideboards.length) {
          const sb = pick(sideboards);
          it.x = rint(sb.x + 2, sb.x + sb.w - 2 - it.w);
          it.y = sb.y - it.h;
          ok = !twin.some((o) => o.layer === 3 && overlaps(it, o, 3));
        }
        placed = ok && free(it);
      }
      if (!placed) continue;
      twin.push(it);
      diffs.push({
        kind,
        box: boxOf(it),
      });
    }
    if (kind === 'moved') {
      const it = pick(unused((i) => MOVABLE.includes(i.type)));
      if (!it) continue;
      const horizontal = it.ceiling || Math.random() < 0.5;
      const sign = Math.random() < 0.5 ? -1 : 1;
      const dx = horizontal ? sign * rint(16, 26) : 0;
      const dy = horizontal ? 0 : sign * rint(12, 20);
      const moved = {
        ...boxOf(it),
        x: it.x + dx,
        y: it.y + dy,
        id: it.id,
      };
      const box = union(boxOf(it), moved);
      if (!fits(moved, twin, it.id) || !free(box)) continue;
      const t = twinOf(it.id);
      t.x = moved.x;
      t.y = moved.y;
      used.add(it.id);
      diffs.push({
        kind,
        box,
      });
    }
    if (kind === 'flip') {
      const it = pick(unused((i) => FLIPPABLE.includes(i.type)));
      if (!it || !free(it)) continue;
      twinOf(it.id).flip = !it.flip;
      used.add(it.id);
      diffs.push({
        kind,
        box: boxOf(it),
      });
    }
  }

  // Either picture may be the changed one.
  const swap = Math.random() < 0.5;
  return {
    left: swap ? twin : items,
    right: swap ? items : twin,
    diffs: diffs.map((d, i) => ({
      ...d,
      id: i,
    })),
    wall: pick(WALLS),
    floor: pick(FLOORS),
    wallpaper: rint(0, 2),
  };
}

// ---------- Drawing ----------
// Every object is drawn in its own local box from (0,0) to (w,h).

function drawItem(it) {
  const { w, h } = it;
  switch (it.type) {
    case 'window':
      return (
        <>
          <rect x="0" y="0" width={w} height={h} rx="3" fill="#f6efe0" />
          <rect x="5" y="5" width={w - 10} height={h - 10} fill={it.sky} />
          <path
            d={`M5 ${h - 16} Q ${w * 0.35} ${h - 34} ${w * 0.6} ${h - 18} T ${w - 5} ${h - 22} V ${h - 5} H 5 Z`}
            fill="#7fae7a"
          />
          <line
            x1={w / 2}
            y1="5"
            x2={w / 2}
            y2={h - 5}
            stroke="#f6efe0"
            strokeWidth="3"
          />
          <line
            x1="5"
            y1={h / 2}
            x2={w - 5}
            y2={h / 2}
            stroke="#f6efe0"
            strokeWidth="3"
          />
          <rect x="-2" y="-3" width="11" height={h + 5} rx="2" fill={it.color} />
          <rect x={w - 9} y="-3" width="11" height={h + 5} rx="2" fill={it.color} />
        </>
      );
    case 'frame':
      return (
        <>
          <rect x="0" y="0" width={w} height={h} rx="1.5" fill={it.frame} />
          <rect x="3" y="3" width={w - 6} height={h - 6} fill="#f4ecdc" />
          <circle cx={w * 0.36} cy={h * 0.42} r={Math.min(w, h) * 0.2} fill={it.color} />
          <rect
            x={w * 0.52}
            y={h * 0.28}
            width={w * 0.26}
            height={h * 0.48}
            fill={it.color2}
          />
          <line
            x1={w * 0.18}
            y1={h * 0.82}
            x2={w * 0.82}
            y2={h * 0.62}
            stroke="#2b2b2b"
            strokeWidth="1.2"
          />
        </>
      );
    case 'clock': {
      const r = w / 2;
      const hand = (deg, len) => {
        const a = (deg * Math.PI) / 180;
        return {
          x2: r + Math.sin(a) * len,
          y2: r - Math.cos(a) * len,
        };
      };
      return (
        <>
          {Array.from(
            {
              length: 12,
            },
            (_, k) => {
              const a = (k * Math.PI) / 6;
              return (
                <g key={String(String(k))}>
                  <line
                    x1={r + Math.cos(a) * r * 0.42}
                    y1={r + Math.sin(a) * r * 0.42}
                    x2={r + Math.cos(a) * r * 0.9}
                    y2={r + Math.sin(a) * r * 0.9}
                    stroke={it.color}
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <circle
                    cx={r + Math.cos(a) * r * 0.92}
                    cy={r + Math.sin(a) * r * 0.92}
                    r="1.8"
                    fill={it.color}
                  />
                </g>
              );
            },
          )}
          <circle
            cx={r}
            cy={r}
            r={r * 0.38}
            fill="#f4ecdc"
            stroke={it.color}
            strokeWidth="1.5"
          />
          <line
            x1={r}
            y1={r}
            {...hand(it.a1, r * 0.3)}
            stroke="#2b2b2b"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <line
            x1={r}
            y1={r}
            {...hand(it.a2, r * 0.2)}
            stroke="#2b2b2b"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </>
      );
    }
    case 'shelf': {
      let bx = 8;
      return (
        <>
          {it.books.map((b, k) => {
            const el = (
              <rect
                key={String(String(k))}
                x={bx}
                y={h - 4 - b.h}
                width={b.w}
                height={b.h}
                fill={b.c}
              />
            );
            bx += b.w + 1;
            return el;
          })}
          <rect x="0" y={h - 4} width={w} height="4" rx="1" fill={it.color} />
        </>
      );
    }
    case 'pendant':
      return (
        <>
          <line
            x1={w / 2}
            y1="0"
            x2={w / 2}
            y2={h - 14}
            stroke="#3a3a3a"
            strokeWidth="1.5"
          />
          <path
            d={`M 2 ${h - 1} C 2 ${h - 24} ${w - 2} ${h - 24} ${w - 2} ${h - 1} Z`}
            fill={it.color}
          />
          <ellipse cx={w / 2} cy={h - 1} rx="5" ry="2.5" fill="#fff3b0" />
        </>
      );
    case 'sofa':
      return (
        <>
          <line
            x1="12"
            y1={h - 9}
            x2="8"
            y2={h}
            stroke="#5e3820"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <line
            x1={w - 12}
            y1={h - 9}
            x2={w - 8}
            y2={h}
            stroke="#5e3820"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <rect x="6" y="2" width={w - 12} height={h * 0.55} rx="7" fill={it.color} />
          <rect
            x="2"
            y={h * 0.45}
            width={w - 4}
            height={h * 0.36}
            rx="6"
            fill={it.color}
          />
          <rect
            x="2"
            y={h * 0.68}
            width={w - 4}
            height={h * 0.13}
            rx="4"
            fill="#000"
            opacity="0.15"
          />
          <line
            x1={w / 2}
            y1={h * 0.08}
            x2={w / 2}
            y2={h * 0.68}
            stroke="#000"
            strokeOpacity="0.18"
          />
          <circle cx={w * 0.25} cy={h * 0.25} r="1.6" fill="#000" opacity="0.25" />
          <circle cx={w * 0.75} cy={h * 0.25} r="1.6" fill="#000" opacity="0.25" />
          <rect
            x="0"
            y={h * 0.3}
            width="11"
            height={h * 0.52}
            rx="5"
            fill={it.color}
            stroke="#000"
            strokeOpacity="0.15"
          />
          <rect
            x={w - 11}
            y={h * 0.3}
            width="11"
            height={h * 0.52}
            rx="5"
            fill={it.color}
            stroke="#000"
            strokeOpacity="0.15"
          />
        </>
      );
    case 'armchair':
      return (
        <>
          <line
            x1={w * 0.22}
            y1={h * 0.74}
            x2={w * 0.1}
            y2={h}
            stroke="#5e3820"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <line
            x1={w * 0.82}
            y1={h * 0.74}
            x2={w * 0.94}
            y2={h}
            stroke="#5e3820"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d={`M ${w * 0.12} ${h * 0.66} L ${w * 0.02} ${h * 0.06} Q ${w * 0.22} ${-h * 0.02} ${w * 0.42} ${h * 0.1} L ${w * 0.5} ${h * 0.6} Z`}
            fill={it.color}
          />
          <rect
            x={w * 0.08}
            y={h * 0.55}
            width={w * 0.86}
            height={h * 0.2}
            rx="6"
            fill={it.color}
          />
          <rect
            x={w * 0.08}
            y={h * 0.67}
            width={w * 0.86}
            height={h * 0.08}
            rx="3"
            fill="#000"
            opacity="0.15"
          />
          <line
            x1={w * 0.9}
            y1={h * 0.46}
            x2={w * 0.9}
            y2={h * 0.58}
            stroke="#7a4a2a"
            strokeWidth="3"
          />
          <rect
            x={w * 0.5}
            y={h * 0.42}
            width={w * 0.46}
            height="5"
            rx="2"
            fill="#7a4a2a"
          />
        </>
      );
    case 'sideboard': {
      const dw = (w - 8 - (it.doors - 1) * 3) / it.doors;
      return (
        <>
          <line
            x1="10"
            y1={h - 9}
            x2="6"
            y2={h}
            stroke={it.wood}
            strokeWidth="3"
            strokeLinecap="round"
          />
          <line
            x1={w - 10}
            y1={h - 9}
            x2={w - 6}
            y2={h}
            stroke={it.wood}
            strokeWidth="3"
            strokeLinecap="round"
          />
          <rect x="0" y="0" width={w} height={h - 9} rx="2" fill={it.wood} />
          {Array.from(
            {
              length: it.doors,
            },
            (_, k) => (
              <g key={String(String(k))}>
                <rect
                  x={4 + k * (dw + 3)}
                  y="4"
                  width={dw}
                  height={h - 17}
                  rx="1.5"
                  fill={it.color}
                />
                <circle
                  cx={4 + k * (dw + 3) + dw / 2}
                  cy={h * 0.4}
                  r="1.6"
                  fill="#2b2b2b"
                />
              </g>
            ),
          )}
        </>
      );
    }
    case 'floorlamp': {
      const sx = w - 12;
      const sy = h * 0.16;
      return (
        <>
          <path
            d={`M 9 ${h - 4} Q 6 ${h * 0.05} ${sx} ${sy}`}
            fill="none"
            stroke="#4a4a4a"
            strokeWidth="2.2"
          />
          <ellipse cx="9" cy={h - 3} rx="9" ry="3" fill="#2f2f2f" />
          <path
            d={`M ${sx - 12} ${sy + 16} Q ${sx} ${sy - 8} ${sx + 12} ${sy + 16} Z`}
            fill={it.color}
          />
          <circle cx={sx} cy={sy + 17} r="3" fill="#fff3b0" />
        </>
      );
    }
    case 'plant': {
      const by = h * 0.62;
      return (
        <>
          {it.leaves.map((lf, k) => (
            <ellipse
              key={String(String(k))}
              cx="0"
              cy={-lf.l / 2}
              rx={lf.l * 0.22}
              ry={lf.l / 2}
              fill={lf.dark ? '#2f6b3c' : '#5a9a4f'}
              transform={`translate(${w / 2} ${by}) rotate(${lf.a})`}
            />
          ))}
          <path
            d={`M ${w * 0.22} ${by} L ${w * 0.78} ${by} L ${w * 0.68} ${h} L ${w * 0.32} ${h} Z`}
            fill={it.color}
          />
          <rect
            x={w * 0.18}
            y={by - 3}
            width={w * 0.64}
            height="5"
            rx="1.5"
            fill={it.color}
          />
          <rect
            x={w * 0.18}
            y={by - 3}
            width={w * 0.64}
            height="5"
            rx="1.5"
            fill="#000"
            opacity="0.15"
          />
        </>
      );
    }
    case 'tablelamp':
      return (
        <>
          <ellipse
            cx={w / 2}
            cy={h * 0.74}
            rx={w * 0.24}
            ry={h * 0.22}
            fill="#f4ecdc"
            stroke="#2b2b2b"
            strokeOpacity="0.25"
          />
          <rect x={w * 0.3} y={h - 3} width={w * 0.4} height="3" fill="#2b2b2b" />
          <path
            d={`M ${w * 0.1} ${h * 0.52} L ${w * 0.9} ${h * 0.52} L ${w * 0.7} 0 L ${w * 0.3} 0 Z`}
            fill={it.color}
          />
        </>
      );
    case 'vase':
      return (
        <path
          d={`M ${w * 0.35} 0 H ${w * 0.65} V ${h * 0.25} Q ${w} ${h * 0.45} ${w * 0.8} ${h} H ${w * 0.2} Q 0 ${h * 0.45} ${w * 0.35} ${h * 0.25} Z`}
          fill={it.color}
        />
      );
    case 'bookstack':
      return (
        <>
          <rect x="0" y={h - 5} width={w} height="5" rx="1" fill={it.books[0].c} />
          <rect x="2" y={h - 10} width={w - 4} height="5" rx="1" fill={it.books[1].c} />
          <rect x="1" y="0" width={w - 7} height="4" rx="1" fill={it.books[2].c} />
        </>
      );
    case 'bird':
      return (
        <>
          <ellipse
            cx={w * 0.45}
            cy={h * 0.62}
            rx={w * 0.4}
            ry={h * 0.32}
            fill={it.color}
          />
          <circle cx={w * 0.74} cy={h * 0.3} r={h * 0.24} fill={it.color} />
          <path
            d={`M ${w * 0.9} ${h * 0.26} L ${w} ${h * 0.34} L ${w * 0.9} ${h * 0.4} Z`}
            fill="#e0a526"
          />
          <circle cx={w * 0.78} cy={h * 0.26} r="1" fill="#2b2b2b" />
          <path
            d={`M ${w * 0.08} ${h * 0.5} L 0 ${h * 0.3} L ${w * 0.2} ${h * 0.45} Z`}
            fill={it.color}
          />
        </>
      );
    case 'rug':
      return (
        <>
          <rect x="0" y="0" width={w} height={h} rx="4" fill={it.color} />
          <rect
            x="6"
            y="5"
            width={w - 12}
            height={h - 10}
            rx="2"
            fill="none"
            stroke={it.color2}
            strokeWidth="2.5"
          />
          {[0, 1, 2, 3, 4].map((k) => (
            <circle
              key={String(String(k))}
              cx={w * (0.2 + k * 0.15)}
              cy={h / 2}
              r="3"
              fill={it.color2}
            />
          ))}
        </>
      );
    case 'cat':
      return (
        <>
          <path
            d={`M ${w * 0.12} ${h * 0.78} Q ${-w * 0.04} ${h * 0.25} ${w * 0.14} ${h * 0.16}`}
            stroke={it.color}
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
          />
          <ellipse
            cx={w * 0.45}
            cy={h * 0.68}
            rx={w * 0.34}
            ry={h * 0.3}
            fill={it.color}
          />
          <circle cx={w * 0.76} cy={h * 0.42} r={h * 0.26} fill={it.color} />
          <path
            d={`M ${w * 0.64} ${h * 0.32} L ${w * 0.66} ${h * 0.04} L ${w * 0.76} ${h * 0.2} Z M ${w * 0.78} ${h * 0.2} L ${w * 0.88} ${h * 0.04} L ${w * 0.9} ${h * 0.32} Z`}
            fill={it.color}
          />
          <circle cx={w * 0.71} cy={h * 0.42} r="1.5" fill="#f2d16b" />
          <circle cx={w * 0.83} cy={h * 0.42} r="1.5" fill="#f2d16b" />
        </>
      );
    default:
      return null;
  }
}

function itemTransform(it) {
  return it.flip
    ? `translate(${it.x + it.w} ${it.y}) scale(-1 1)`
    : `translate(${it.x} ${it.y})`;
}

// Wall, wallpaper, skirting board and floorboards: identical in both pictures.
function Backdrop({ room }) {
  return (
    <>
      <rect x="0" y="0" width={W} height={FLOOR_Y} fill={room.wall} />
      {room.wallpaper === 1 &&
        Array.from(
          {
            length: 20,
          },
          (_, k) => (
            <rect
              key={String(String(k))}
              x={k * 20 + 8}
              y="0"
              width="4"
              height={FLOOR_Y}
              fill="#000"
              opacity="0.04"
            />
          ),
        )}
      {room.wallpaper === 2 &&
        Array.from(
          {
            length: 60,
          },
          (_, k) => (
            <circle
              key={String(String(k))}
              cx={(k % 12) * 34 + (Math.floor(k / 12) % 2) * 17 + 8}
              cy={Math.floor(k / 12) * 40 + 20}
              r="3"
              fill="#000"
              opacity="0.05"
            />
          ),
        )}
      <rect x="0" y={FLOOR_Y} width={W} height={H - FLOOR_Y} fill={room.floor} />
      {Array.from(
        {
          length: 5,
        },
        (_, k) => (
          <line
            key={String(String(k))}
            x1="0"
            y1={FLOOR_Y + 14 + k * 16}
            x2={W}
            y2={FLOOR_Y + 14 + k * 16}
            stroke="#000"
            strokeOpacity="0.1"
          />
        ),
      )}
      <rect x="0" y={FLOOR_Y - 6} width={W} height="7" fill="#f4ecdc" />
    </>
  );
}

// ---------- Picture ----------

function Picture({ room, items, label, found, hintId, misses, cursor, onPick }) {
  const svgRef = useRef(null);
  const handleClick = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    onPick(x, y);
  };
  const sorted = [...items].sort((a, b) => a.layer - b.layer);
  const hinted = room.diffs.find((d) => d.id === hintId);
  const ring = (d, props) => (
    <ellipse
      cx={d.box.x + d.box.w / 2}
      cy={d.box.y + d.box.h / 2}
      rx={Math.max(13, d.box.w / 2 + 6)}
      ry={Math.max(13, d.box.h / 2 + 6)}
      fill="none"
      {...props}
    />
  );
  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      onClick={handleClick}
      role="img"
      aria-label={label}
      className="w-full h-auto block rounded-lg cursor-crosshair select-none"
      style={{
        aspectRatio: `${W} / ${H}`,
      }}
    >
      <Backdrop room={room} />
      {sorted.map((it) => (
        <g key={String(String(it.id))} transform={itemTransform(it)}>
          {drawItem(it)}
        </g>
      ))}

      {room.diffs
        .filter((d) => found.includes(d.id))
        .map((d) => (
          <g key={String(String(d.id))}>
            {ring(d, {
              stroke: '#fff',
              strokeWidth: 6,
              opacity: 0.8,
            })}
            {ring(d, {
              stroke: '#e2654a',
              strokeWidth: 3,
            })}
          </g>
        ))}

      {hinted && !found.includes(hinted.id) && (
        <g className="hint-pulse">
          {ring(hinted, {
            stroke: '#f2b52a',
            strokeWidth: 4,
            strokeDasharray: '6 4',
          })}
        </g>
      )}

      {misses.map((m) => (
        <g
          key={String(String(m.id))}
          stroke="#c0392b"
          strokeWidth="3.5"
          strokeLinecap="round"
        >
          <line x1={m.x - 7} y1={m.y - 7} x2={m.x + 7} y2={m.y + 7} />
          <line x1={m.x + 7} y1={m.y - 7} x2={m.x - 7} y2={m.y + 7} />
        </g>
      ))}

      {cursor.show && (
        <g stroke="#22312e" strokeWidth="2" fill="none">
          <circle cx={cursor.x} cy={cursor.y} r="11" stroke="#fff" strokeWidth="4" />
          <circle cx={cursor.x} cy={cursor.y} r="11" />
          <line x1={cursor.x - 16} y1={cursor.y} x2={cursor.x - 6} y2={cursor.y} />
          <line x1={cursor.x + 6} y1={cursor.y} x2={cursor.x + 16} y2={cursor.y} />
          <line x1={cursor.x} y1={cursor.y - 16} x2={cursor.x} y2={cursor.y - 6} />
          <line x1={cursor.x} y1={cursor.y + 6} x2={cursor.x} y2={cursor.y + 16} />
        </g>
      )}
    </svg>
  );
}

// A mid-century starburst for the header.
function Starburst({ className }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      {Array.from(
        {
          length: 8,
        },
        (_, k) => {
          const a = (k * Math.PI) / 4;
          return (
            <line
              key={String(String(k))}
              x1={20 + Math.cos(a) * 5}
              y1={20 + Math.sin(a) * 5}
              x2={20 + Math.cos(a) * (k % 2 ? 12 : 18)}
              y2={20 + Math.sin(a) * (k % 2 ? 12 : 18)}
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          );
        },
      )}
      <circle cx="20" cy="20" r="4" fill="currentColor" />
    </svg>
  );
}

// ---------- App ----------

function App() {
  usePageStyles(styles, 'Twin Rooms');

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
  const [phase, setPhase] = useState('intro');
  const [room, setRoom] = useState(() => generateRoom(1));
  const [found, setFound] = useState([]);
  const [rooms, setRooms] = useState(0);
  const [timeLeft, setTimeLeft] = useState(ROUND_MS);
  const [hints, setHints] = useState(2);
  const [hintId, setHintId] = useState(null);
  const [misses, setMisses] = useState([]);
  const [penaltyKey, setPenaltyKey] = useState(0);
  const [cursor, setCursor] = useState({
    x: W / 2,
    y: H / 2,
    show: false,
  });
  const [best, setBest] = useState(readBest);
  const endsAt = useRef(0);

  // ---- Round control ----

  const beginRoom = (level) => {
    setRoom(generateRoom(level));
    setFound([]);
    setHints(2);
    setHintId(null);
    setMisses([]);
    setTimeLeft(ROUND_MS);
    endsAt.current = Date.now() + ROUND_MS;
    setPhase('playing');
  };
  const start = () => {
    setRooms(0);
    beginRoom(1);
  };
  const nextRoom = () => beginRoom(rooms + 1);

  // Countdown, measured against a deadline so penalties just move the deadline.
  useEffect(() => {
    if (phase !== 'playing') return undefined;
    const id = setInterval(() => {
      const left = endsAt.current - Date.now();
      if (left <= 0) {
        setTimeLeft(0);
        setPhase('over');
        playTone(220, 0.4, 'triangle', 0.05);
        setTimeout(() => playTone(165, 0.5, 'triangle', 0.05), 180);
      } else {
        setTimeLeft(left);
      }
    }, 100);
    return () => clearInterval(id);
  }, [phase]);

  // ---- Checking a spot ----

  const check = (x, y) => {
    if (phase !== 'playing') return;
    const candidates = room.diffs
      .filter((d) => inside(hitBox(d.box), x, y))
      .sort(
        (a, b) =>
          Math.hypot(a.box.x + a.box.w / 2 - x, a.box.y + a.box.h / 2 - y) -
          Math.hypot(b.box.x + b.box.w / 2 - x, b.box.y + b.box.h / 2 - y),
      );
    const fresh = candidates.find((d) => !found.includes(d.id));
    if (fresh) {
      const nowFound = [...found, fresh.id];
      setFound(nowFound);
      if (hintId === fresh.id) setHintId(null);
      playTone(660, 0.1);
      setTimeout(() => playTone(880, 0.14), 70);
      if (nowFound.length === room.diffs.length) {
        const total = rooms + 1;
        setRooms(total);
        setPhase('cleared');
        [523, 659, 784, 1047].forEach((f, k) =>
          setTimeout(() => playTone(f, 0.16, 'triangle', 0.05), 150 + k * 90),
        );
        if (total > best) {
          setBest(total);
          writeBest(total);
        }
      }
      return;
    }

    // Tapping something already circled is harmless.
    if (candidates.length) return;
    endsAt.current -= PENALTY_MS;
    setTimeLeft(Math.max(0, endsAt.current - Date.now()));
    setPenaltyKey((k) => k + 1);
    const miss = {
      id: Math.random(),
      x,
      y,
    };
    setMisses((m) => [...m, miss]);
    setTimeout(() => setMisses((m) => m.filter((p) => p.id !== miss.id)), 700);
    playTone(150, 0.22, 'square', 0.03);
  };
  const takeHint = () => {
    if (phase !== 'playing' || hints <= 0) return;
    const remaining = room.diffs.filter((d) => !found.includes(d.id));
    if (!remaining.length) return;
    setHints((h) => h - 1);
    setHintId(pick(remaining).id);
    playTone(990, 0.2, 'sine', 0.03);
  };

  // ---- Keyboard: arrows steer a crosshair, Space/Enter checks, H for a hint ----

  const actions = useRef({} as GameControls);
  actions.current = {
    check,
    takeHint,
    start,
    nextRoom,
    phase,
    cursor,
  };
  useEffect(() => {
    const onKey = (e) => {
      const a = actions.current;
      // Let focused buttons handle their own Enter/Space, unless the crosshair is out and waiting.
      const crosshairActive = a.phase === 'playing' && a.cursor.show;
      if (
        e.target.tagName === 'BUTTON' &&
        (e.key === 'Enter' || e.key === ' ') &&
        !crosshairActive
      )
        return;
      if (a.phase !== 'playing') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (a.phase === 'cleared') a.nextRoom();
          else a.start();
        }
        return;
      }
      const step = e.shiftKey ? 24 : 8;
      const moves = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      if (moves[e.key]) {
        e.preventDefault();
        const [dx, dy] = moves[e.key];
        setCursor((c) => ({
          x: Math.max(0, Math.min(W, c.x + (c.show ? dx : 0))),
          y: Math.max(0, Math.min(H, c.y + (c.show ? dy : 0))),
          show: true,
        }));
      } else if ((e.key === 'Enter' || e.key === ' ') && a.cursor.show) {
        e.preventDefault();
        a.check(a.cursor.x, a.cursor.y);
      } else if (e.key === 'h' || e.key === 'H') {
        a.takeHint();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const pickWithPointer = (x, y) => {
    setCursor((c) => ({
      ...c,
      x,
      y,
      show: false,
    }));
    check(x, y);
  };

  // ---- Render ----

  const seconds = Math.ceil(timeLeft / 1000);
  const showBoards = phase === 'playing' || phase === 'cleared';
  return (
    <main className="font-body max-w-[1060px] mx-auto py-5 flex flex-col gap-4">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Starburst className="w-10 h-10 text-mustard shrink-0" />
          <h1 className="font-display font-bold text-[clamp(36px,10vw,60px)] leading-none">
            Twin Rooms
          </h1>
        </div>
        <div className="text-right text-sm">
          <div>
            Rooms tidied <b className="font-display text-2xl text-teal">{rooms}</b>
          </div>
          <div className="text-muted">Best {Math.max(best, rooms)}</div>
        </div>
      </header>

      {showBoards && (
        <section
          className="rounded-2xl bg-card p-3 flex flex-col gap-2 shadow-sm"
          aria-label="Round status"
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div
              className="flex items-center gap-1.5"
              aria-label={`${found.length} of ${room.diffs.length} differences found`}
            >
              {room.diffs.map((d) => (
                <span
                  key={String(String(d.id))}
                  className={`w-4 h-4 rounded-full border-2 border-coral ${found.includes(d.id) ? 'bg-coral' : ''}`}
                />
              ))}
              <span className="ml-1 text-sm text-muted">
                {found.length}/{room.diffs.length} found
              </span>
            </div>
            <div className="relative flex items-center gap-3">
              <span
                className={`font-display text-2xl tabular-nums ${seconds <= 15 ? 'text-coral' : ''}`}
              >
                {seconds}s
              </span>
              {penaltyKey > 0 && phase === 'playing' && (
                <span
                  key={String(String(penaltyKey))}
                  className="penalty-rise absolute -top-2 left-0 font-bold text-coral pointer-events-none"
                >
                  −5s
                </span>
              )}
              <button
                type="button"
                onClick={takeHint}
                disabled={phase !== 'playing' || hints <= 0}
                className="px-3 py-1.5 rounded-full bg-mustard text-[#22312e] font-bold text-sm disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
              >
                Hint ({hints})
              </button>
            </div>
          </div>
          <div
            className="h-2 rounded-full overflow-hidden"
            style={{
              background: 'color-mix(in srgb, var(--muted) 22%, transparent)',
            }}
          >
            <div
              className="h-full bg-teal transition-[width] duration-100"
              style={{
                width: `${(timeLeft / ROUND_MS) * 100}%`,
              }}
            />
          </div>
        </section>
      )}

      {showBoards && (
        <div className="grid gap-3 md:grid-cols-2">
          {[
            ['Room A', room.left],
            ['Room B', room.right],
          ].map(([label, items]) => (
            <figure
              key={String(String(label))}
              className="m-0 rounded-2xl bg-card p-2 shadow-sm"
            >
              <Picture
                room={room}
                items={items}
                label={`${label} living room picture`}
                found={found}
                hintId={hintId}
                misses={misses}
                cursor={cursor}
                onPick={pickWithPointer}
              />
              <figcaption className="text-xs text-muted mt-1 px-1">{label}</figcaption>
            </figure>
          ))}
        </div>
      )}

      {phase === 'cleared' && (
        <div
          className="rounded-2xl bg-teal text-white px-4 py-3 flex items-center justify-between gap-3 flex-wrap"
          role="status"
        >
          <span>
            <b className="font-display text-xl">Room tidied!</b> {seconds}s to spare. The
            next room is waiting.
          </span>
          <button
            type="button"
            onClick={nextRoom}
            className="px-4 py-2 rounded-full bg-mustard text-[#22312e] font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            Next room
          </button>
        </div>
      )}

      {(phase === 'intro' || phase === 'over') && (
        <section className="rounded-2xl bg-card p-6 flex flex-col items-center text-center gap-3 shadow-sm">
          <Starburst className="w-14 h-14 text-coral" />
          <p className="font-display text-3xl">
            {phase === 'over' ? 'Time is up!' : 'Spot the difference'}
          </p>
          {phase === 'over' ? (
            <p className="text-muted max-w-[42ch]">
              You tidied {rooms} {rooms === 1 ? 'room' : 'rooms'}. Best so far:{' '}
              {Math.max(best, rooms)}.
            </p>
          ) : (
            <ul className="text-muted max-w-[46ch] text-left list-disc pl-5 flex flex-col gap-1">
              <li>Two pictures of the same living room. One has 5 to 7 changes.</li>
              <li>Things may change colour, vanish, appear, move or flip.</li>
              <li>Tap a difference on either picture to circle it.</li>
              <li>
                Wrong taps cost 5 seconds. You have 90 seconds and 2 hints per room.
              </li>
              <li>Every room you finish scores a point.</li>
            </ul>
          )}
          <p className="text-sm text-muted">
            Keyboard: arrows move the crosshair (Shift for big steps), Space checks, H for
            a hint.
          </p>
          <button
            type="button"
            onClick={start}
            className="font-display text-2xl px-7 py-2 rounded-full bg-coral text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
          >
            {phase === 'over' ? 'Play again' : 'Start'}
          </button>
        </section>
      )}
    </main>
  );
}
export default App;
