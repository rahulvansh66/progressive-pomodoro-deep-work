import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Block } from '../src/types'

vi.mock('obsidian', async () => await import('./fakeVault'))
// The store uses window.setTimeout (Obsidian convention); alias it in Node.
;(globalThis as unknown as { window: typeof globalThis }).window = globalThis

const { FakeVault } = await import('./fakeVault')
const { SessionStore } = await import('../src/store/SessionStore')

const D = '2026-11-19'
const block = (time: string, extra: Partial<Block> = {}): Block => ({
  id: `${D}T${time}`, date: D, time, plannedMinutes: 5, actualMinutes: 5, rating: 'okay', breakMinutes: 5,
  category: 'Work', task: 'Write report', note: null, ...extra,
})

let vault: InstanceType<typeof FakeVault>
let store: InstanceType<typeof SessionStore>

beforeEach(async () => {
  vi.useFakeTimers()
  vault = new FakeVault()
  store = new SessionStore({ vault } as never, 'Pomodoro Log')
  await store.load()
  store.watch()
})

describe('SessionStore', () => {
  it('creates the folder and daily file on first add, then appends', async () => {
    await store.add(block('09:10:00'))
    await store.add(block('09:20:00', { rating: 'flow', breakMinutes: 0 }))
    expect(vault.folders.has('Pomodoro Log')).toBe(true)
    const content = vault.files.get(`Pomodoro Log/${D}.md`)!
    expect(content).toBe(
      `---\ndate: ${D}\n---\n# Pomodoro log\n\n` +
      '- 09:10:00 [planned:: 5] [actual:: 5] [rating:: okay] [break:: 5] [category:: Work] [task:: [[Write report]]]\n' +
      '- 09:20:00 [planned:: 5] [actual:: 5] [rating:: flow] [break:: 0] [category:: Work] [task:: [[Write report]]]\n',
    )
    expect(store.all().map((b) => b.rating)).toEqual(['okay', 'flow'])
  })

  it('updates and removes a single line', async () => {
    await store.add(block('09:10:00'))
    await store.add(block('09:20:00'))
    await store.update(`${D}T09:10:00`, { rating: 'focused', note: 'great start' })
    expect(store.find(`${D}T09:10:00`)).toMatchObject({ rating: 'focused', note: 'great start' })
    await store.remove(`${D}T09:20:00`)
    expect(store.all()).toHaveLength(1)
    await expect(store.remove(`${D}T09:20:00`)).rejects.toThrow(/not found/)
  })

  it('picks up hand edits and counts unreadable lines', async () => {
    await store.add(block('09:10:00'))
    const listener = vi.fn()
    store.subscribe(listener)
    const path = `Pomodoro Log/${D}.md`
    vault.edit(path, (c) => c.replace('[rating:: okay]', '[rating:: flow]') + '- 10:00:00 [planned:: 5] [rating:: oops]\n')
    await vi.runAllTimersAsync()
    expect(store.all()[0].rating).toBe('flow')
    expect(store.invalidCount()).toBe(1)
    expect(store.filesWithInvalid()).toEqual([path])
    expect(listener).toHaveBeenCalled()
  })

  it('ignores files outside the log folder or not named by date', async () => {
    vault.folders.add('Pomodoro Log')
    await vault.create('Pomodoro Log/notes.md', '- 09:00:00 [planned:: 5] [actual:: 5] [rating:: okay]')
    await vault.create(`Other/${D}.md`, '- 09:00:00 [planned:: 5] [actual:: 5] [rating:: okay]')
    await vi.runAllTimersAsync()
    expect(store.all()).toHaveLength(0)
  })

  it('loads existing logs and drops deleted files', async () => {
    vault.folders.add('Pomodoro Log')
    vault.files.set('Pomodoro Log/2026-11-18.md', '- 08:00:00 [planned:: 2] [actual:: 2] [rating:: distracted]\n')
    await store.load()
    expect(store.all().map((b) => b.date)).toEqual(['2026-11-18'])
    vault.files.delete('Pomodoro Log/2026-11-18.md')
    vault.fire('delete', { path: 'Pomodoro Log/2026-11-18.md' })
    await vi.runAllTimersAsync()
    expect(store.all()).toHaveLength(0)
  })

  it('renames a category across logged blocks', async () => {
    await store.add(block('09:10:00'))
    await store.add(block('09:20:00', { category: 'Study' }))
    expect(await store.renameCategory('Work', 'Deep work')).toBe(1)
    expect(store.all().map((b) => b.category)).toEqual(['Deep work', 'Study'])
  })

  it('switches folders', async () => {
    await store.add(block('09:10:00'))
    await store.setFolder('Logs/Focus')
    expect(store.all()).toHaveLength(0)
    await store.add(block('09:30:00'))
    expect(vault.files.has(`Logs/Focus/${D}.md`)).toBe(true)
  })
})
