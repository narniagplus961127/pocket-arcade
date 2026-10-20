import { useState, useMemo, useEffect } from 'react';
import { GAMES, KINDS, type Kind } from './games';
import { usePageStyles } from './shared/usePageStyles';
import styles from './index.css?inline';
function GameCard({ game }: { game: (typeof GAMES)[number] }) {
  const [failed, setFailed] = useState(false);
  return (
    <a
      href={`${import.meta.env.BASE_URL}#/play/${game.slug}`}
      target="_blank"
      rel="noopener noreferrer"
      className="cart group flex flex-col bg-card rounded-2xl overflow-hidden text-ink no-underline min-w-0
          shadow-[0_1px_0_rgba(0,0,0,.06),0_10px_22px_-14px_rgba(0,0,0,.4)] transition-transform duration-150
          hover:-translate-y-1 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-accent focus-visible:outline-offset-2"
    >
      <div className="relative aspect-[16/10] bg-chip overflow-hidden">
        {failed ? (
          <div className="absolute inset-0 flex items-center justify-center font-display text-3xl text-muted">
            {game.title[0]}
          </div>
        ) : (
          <img
            src={`${import.meta.env.BASE_URL}previews/${game.slug}.jpg`}
            alt={`Screenshot of ${game.title}`}
            loading="lazy"
            onError={() => setFailed(true)}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
          />
        )}
        <span className="absolute top-2 left-2 font-display text-xs font-extrabold bg-black/55 text-white rounded-md px-1.5 py-0.5 tabular-nums">
          {String(game.number).padStart(3, '0')}
        </span>
      </div>
      <div className="p-3 flex flex-col gap-1 flex-1">
        <h2 className="font-display text-lg font-extrabold leading-tight">
          {game.title}
        </h2>
        <p className="text-sm text-muted leading-snug">{game.description}</p>
        <span className="mt-auto pt-1 text-[11px] font-bold tracking-[.12em] uppercase text-muted">
          {KINDS[game.kind]}
        </span>
      </div>
    </a>
  );
}

export default function Catalog() {
  usePageStyles(styles, 'Pocket Arcade');
  const [kind, setKind] = useState(() => {
    try {
      const saved = localStorage.getItem('arcade-kind');
      return saved && Object.hasOwn(KINDS, saved) ? (saved as Kind) : 'all';
    } catch {
      return 'all';
    }
  });
  const [query, setQuery] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem('arcade-kind', kind);
    } catch (e) {
      /* storage unavailable */
    }
  }, [kind]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: GAMES.length };
    GAMES.forEach((g) => {
      c[g.kind] = (c[g.kind] || 0) + 1;
    });
    return c;
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GAMES.filter(
      (g) =>
        (kind === 'all' || g.kind === kind) &&
        (!q || `${g.title} ${g.description}`.toLowerCase().includes(q)),
    );
  }, [kind, query]);

  return (
    <main className="font-body max-w-[1200px] mx-auto py-8 flex flex-col gap-6">
      <header className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-4 items-end">
        <div>
          <h1 className="font-display text-[clamp(48px,11vw,104px)] leading-[.88] font-extrabold tracking-[-.04em] text-balance">
            Pocket <span className="text-accent">Arcade</span>
          </h1>
          <p className="text-muted mt-3 text-[17px] leading-relaxed max-w-[60ch]">
            {GAMES.length} small browser games, each with its own look and sound. They
            work with a mouse, keyboard or touch screen, and remember your best scores.
          </p>
        </div>
        <div className="text-right">
          <div className="font-display text-[clamp(64px,12vw,120px)] leading-[.8] font-extrabold tracking-[-.05em] tabular-nums">
            {shown.length}
          </div>
          <div className="text-xs font-bold tracking-[.16em] uppercase text-muted mt-1">
            {shown.length === GAMES.length ? 'games on the shelf' : 'matching'}
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-2 bg-card rounded-full px-4 py-2.5 max-w-[420px] border border-chip focus-within:border-accent">
          <span className="text-muted" aria-hidden="true">
            ⌕
          </span>
          <input
            id="search"
            aria-label="Search games"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search games (try “cards” or “ocean”)"
            className="bg-transparent outline-none flex-1 min-w-0 text-ink placeholder:text-muted"
          />
        </label>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by kind">
          {(Object.entries(KINDS) as [Kind, string][])
            .filter(([k]) => counts[k])
            .map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                aria-pressed={kind === k}
                className={`rounded-full px-3.5 py-2 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent
                  ${kind === k ? 'bg-ink text-bg' : 'bg-chip text-ink'}`}
              >
                {label}{' '}
                <span className="font-normal opacity-60 tabular-nums">{counts[k]}</span>
              </button>
            ))}
        </div>
      </div>

      <section className="bg-shelf rounded-3xl p-3 sm:p-4 grid gap-3 sm:gap-4 grid-cols-[repeat(auto-fill,minmax(min(100%,230px),1fr))]">
        {shown.map((g) => (
          <GameCard key={g.slug} game={g} />
        ))}
        {!shown.length && (
          <p className="text-muted p-6">
            Nothing on the shelf matches that. Try another word.
          </p>
        )}
      </section>

      <p className="text-sm text-muted max-w-[72ch]">
        Each game opens in a new tab. Play directly in your browser. The previews are
        screenshots taken a few seconds into play.
      </p>
    </main>
  );
}
