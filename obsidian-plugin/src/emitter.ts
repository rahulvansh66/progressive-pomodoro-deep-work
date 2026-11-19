/** Minimal change notifier that plays well with React's useSyncExternalStore. */
export class Emitter {
  private listeners = new Set<() => void>()
  private _version = 0

  get version() { return this._version }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  emit() {
    this._version++
    for (const fn of [...this.listeners]) fn()
  }
}
