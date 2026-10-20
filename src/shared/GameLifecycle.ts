/** Resources created by an imperative canvas engine belong to its mounted game. */
export class GameLifecycle {
  private frames = new Set<number>();
  private timeouts = new Set<number>();
  private intervals = new Set<number>();
  private listeners: Array<() => void> = [];
  private audioContexts = new Set<AudioContext>();
  private disposed = false;

  requestAnimationFrame = (callback: FrameRequestCallback): number => {
    if (this.disposed) return 0;
    const id = window.requestAnimationFrame((time) => {
      this.frames.delete(id);
      if (!this.disposed) callback(time);
    });
    this.frames.add(id);
    return id;
  };

  cancelAnimationFrame = (id: number): void => {
    window.cancelAnimationFrame(id);
    this.frames.delete(id);
  };

  setTimeout = (callback: (...args: unknown[]) => void, delay = 0): number => {
    if (this.disposed) return 0;
    const id = window.setTimeout(() => {
      this.timeouts.delete(id);
      if (!this.disposed) callback();
    }, delay);
    this.timeouts.add(id);
    return id;
  };

  clearTimeout = (id: number): void => {
    window.clearTimeout(id);
    this.timeouts.delete(id);
  };

  setInterval = (callback: () => void, delay = 0): number => {
    if (this.disposed) return 0;
    const id = window.setInterval(() => {
      if (!this.disposed) callback();
    }, delay);
    this.intervals.add(id);
    return id;
  };

  clearInterval = (id: number): void => {
    window.clearInterval(id);
    this.intervals.delete(id);
  };

  listen<K extends keyof WindowEventMap>(
    target: EventTarget,
    type: K,
    listener: (event: WindowEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  listen(
    target: EventTarget,
    type: string,
    listener: EventListener,
    options?: boolean | AddEventListenerOptions,
  ): void;
  listen(
    target: EventTarget,
    type: string,
    listener: EventListener,
    options?: boolean | AddEventListenerOptions,
  ): void {
    if (this.disposed) return;
    const handler = listener as EventListener;
    target.addEventListener(type, handler, options);
    this.listeners.push(() => target.removeEventListener(type, handler, options));
  }

  createAudioContext = (): AudioContext => {
    if (this.disposed) throw new Error('Cannot create audio for an unmounted game.');
    const context = new AudioContext();
    this.audioContexts.add(context);
    return context;
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.frames.forEach(window.cancelAnimationFrame);
    this.timeouts.forEach(window.clearTimeout);
    this.intervals.forEach(window.clearInterval);
    this.listeners.forEach((remove) => remove());
    this.audioContexts.forEach((context) => void context.close().catch(() => {}));
    this.frames.clear();
    this.timeouts.clear();
    this.intervals.clear();
    this.listeners = [];
    this.audioContexts.clear();
  }
}
