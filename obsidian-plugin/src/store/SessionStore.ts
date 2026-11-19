import { normalizePath, TFile, TFolder, type App, type EventRef, type TAbstractFile } from 'obsidian'
import { Emitter } from '../emitter'
import { isIsoDate } from '../logic/dates'
import { appendLine, newLogFile, parseFile, replaceBlockLine, serializeLine, type ParsedFile } from '../logic/format'
import type { Block } from '../types'

/**
 * Reads and writes focus blocks in `<folder>/YYYY-MM-DD.md` daily log files.
 * Keeps a parsed cache per file and re-parses only files that change.
 */
export class SessionStore extends Emitter {
  private cache = new Map<string, ParsedFile & { date: string }>()
  private sorted: Block[] | null = null
  private emitTimer: number | null = null
  private refs: EventRef[] = []

  constructor(private app: App, private folder: string) {
    super()
  }

  get folderPath() { return normalizePath(this.folder || 'Pomodoro Log') }

  /** Date of a log file, or null if the file isn't a daily log in our folder. */
  private dateOf(path: string): string | null {
    const prefix = `${this.folderPath}/`
    if (!path.startsWith(prefix)) return null
    const name = path.slice(prefix.length)
    const m = /^(\d{4}-\d{2}-\d{2})\.md$/.exec(name)
    return m && isIsoDate(m[1]) ? m[1] : null
  }

  async load() {
    this.cache.clear()
    const folder = this.app.vault.getAbstractFileByPath(this.folderPath)
    if (folder instanceof TFolder) {
      const files = folder.children.filter((f): f is TFile => f instanceof TFile && this.dateOf(f.path) !== null)
      await Promise.all(files.map((f) => this.reparse(f, false)))
    }
    this.changed(true)
  }

  async setFolder(folder: string) {
    this.folder = folder
    await this.load()
  }

  /** Listen for vault changes (call once the workspace layout is ready). */
  watch() {
    const v = this.app.vault
    this.refs.push(
      v.on('create', (f) => this.onFile(f)),
      v.on('modify', (f) => this.onFile(f)),
      v.on('delete', (f) => { if (this.cache.delete(f.path)) this.changed() }),
      v.on('rename', (f, old) => {
        const had = this.cache.delete(old)
        if (this.dateOf(f.path)) this.onFile(f)
        else if (had) this.changed()
      }),
    )
    return this.refs
  }

  private onFile(f: TAbstractFile) {
    if (f instanceof TFile && this.dateOf(f.path)) void this.reparse(f, true)
  }

  private async reparse(f: TFile, notify: boolean) {
    const date = this.dateOf(f.path)
    if (!date) return
    const content = await this.app.vault.cachedRead(f)
    this.cache.set(f.path, { ...parseFile(content, date), date })
    if (notify) this.changed()
  }

  /** Coalesce bursts of changes (our own writes fire modify events too) into one re-render. */
  private changed(now = false) {
    this.sorted = null
    if (this.emitTimer !== null) window.clearTimeout(this.emitTimer)
    if (now) { this.emitTimer = null; this.emit(); return }
    this.emitTimer = window.setTimeout(() => { this.emitTimer = null; this.emit() }, 50)
  }

  // ---- Queries --------------------------------------------------------
  all(): Block[] {
    if (!this.sorted) {
      this.sorted = [...this.cache.values()].flatMap((f) => f.blocks).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    }
    return this.sorted
  }

  invalidCount(): number {
    let n = 0
    for (const f of this.cache.values()) n += f.invalid
    return n
  }

  /** Files that contain unreadable lines (for the warning link). */
  filesWithInvalid(): string[] {
    return [...this.cache.entries()].filter(([, f]) => f.invalid > 0).map(([p]) => p)
  }

  pathFor(date: string) { return normalizePath(`${this.folderPath}/${date}.md`) }

  find(id: string) { return this.all().find((b) => b.id === id) }

  // ---- Writes ---------------------------------------------------------
  async add(block: Block) {
    const path = this.pathFor(block.date)
    const line = serializeLine(block)
    let file = this.app.vault.getAbstractFileByPath(path)
    if (!(file instanceof TFile)) {
      await this.ensureFolder()
      file = await this.app.vault.create(path, appendLine(newLogFile(block.date), line))
    } else {
      await this.app.vault.process(file as TFile, (c) => appendLine(c, line))
    }
    await this.reparse(file as TFile, true)
  }

  async update(id: string, patch: Partial<Pick<Block, 'rating' | 'note' | 'category' | 'task'>>) {
    const b = this.find(id)
    if (!b) throw new Error('Block not found: it may have been edited or deleted in the log file.')
    await this.rewrite(b.date, (c) => replaceBlockLine(c, b.date, id, serializeLine({ ...b, ...patch })))
  }

  async remove(id: string) {
    const b = this.find(id)
    if (!b) throw new Error('Block not found: it may have been edited or deleted in the log file.')
    await this.rewrite(b.date, (c) => replaceBlockLine(c, b.date, id, null))
  }

  /** Rewrite every logged block of category `from` to `to` (category rename). Returns blocks changed. */
  async renameCategory(from: string, to: string): Promise<number> {
    let changed = 0
    const byDate = new Map<string, Block[]>()
    for (const b of this.all()) if (b.category === from) byDate.set(b.date, [...(byDate.get(b.date) ?? []), b])
    for (const [date, blocks] of byDate) {
      await this.rewrite(date, (c) => {
        let out: string | null = c
        for (const b of blocks) {
          const next: string | null = replaceBlockLine(out!, date, b.id, serializeLine({ ...b, category: to }))
          if (next !== null) { out = next; changed++ }
        }
        return out
      })
    }
    return changed
  }

  private async rewrite(date: string, fn: (content: string) => string | null) {
    const file = this.app.vault.getAbstractFileByPath(this.pathFor(date))
    if (!(file instanceof TFile)) throw new Error(`Log file not found: ${this.pathFor(date)}`)
    let found = true
    await this.app.vault.process(file, (c) => {
      const next = fn(c)
      if (next === null) { found = false; return c }
      return next
    })
    if (!found) throw new Error('Block not found in its log file: it may have been edited by hand.')
    await this.reparse(file, true)
  }

  private async ensureFolder() {
    const p = this.folderPath
    if (this.app.vault.getAbstractFileByPath(p)) return
    // Create nested folders one level at a time.
    let cur = ''
    for (const part of p.split('/')) {
      cur = cur ? `${cur}/${part}` : part
      if (!this.app.vault.getAbstractFileByPath(cur)) await this.app.vault.createFolder(cur)
    }
  }
}
