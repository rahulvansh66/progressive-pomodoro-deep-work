/** In-memory stand-in for the parts of Obsidian's App/Vault the SessionStore uses. */
export class TAbstractFile { constructor(public path: string) {} }
export class TFile extends TAbstractFile {
  get name() { return this.path.split('/').pop()! }
}
export class TFolder extends TAbstractFile {
  constructor(path: string, private vault: FakeVault) { super(path) }
  get children(): TAbstractFile[] {
    const prefix = `${this.path}/`
    return [...this.vault.files.keys()]
      .filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
      .map((p) => new TFile(p))
  }
}
export const normalizePath = (p: string) => p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '')

type Handler = (...args: unknown[]) => void

export class FakeVault {
  files = new Map<string, string>()
  folders = new Set<string>()
  handlers = new Map<string, Handler[]>()

  getAbstractFileByPath(p: string) {
    if (this.files.has(p)) return new TFile(p)
    if (this.folders.has(p)) return new TFolder(p, this)
    return null
  }
  async cachedRead(f: TFile) { return this.files.get(f.path) ?? '' }
  async create(p: string, content: string) {
    this.files.set(p, content)
    const f = new TFile(p)
    this.fire('create', f)
    return f
  }
  async createFolder(p: string) { this.folders.add(p) }
  async process(f: TFile, fn: (c: string) => string) {
    const next = fn(this.files.get(f.path) ?? '')
    this.files.set(f.path, next)
    this.fire('modify', f)
    return next
  }
  /** Simulate the user editing a file by hand. */
  edit(p: string, fn: (c: string) => string) {
    this.files.set(p, fn(this.files.get(p) ?? ''))
    this.fire('modify', new TFile(p))
  }
  on(name: string, h: Handler) {
    this.handlers.set(name, [...(this.handlers.get(name) ?? []), h])
    return { name, h }
  }
  fire(name: string, ...args: unknown[]) {
    for (const h of this.handlers.get(name) ?? []) h(...args)
  }
}
