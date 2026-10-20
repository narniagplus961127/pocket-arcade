import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

const modules = import.meta.glob<{ default: ComponentType }>('./games/*/Game.tsx');

/** Keep each game in its own chunk, loaded only when the player opens it. */
export const gameRegistry: Record<
  string,
  LazyExoticComponent<ComponentType>
> = Object.fromEntries(
  Object.entries(modules).map(([file, load]) => [file.split('/')[2], lazy(load)]),
);
