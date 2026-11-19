import { describe, expect, it } from 'vitest'
import {
  appendLine, escapeText, findBlockLine, newLogFile, parseFile, parseLine, replaceBlockLine, serializeLine,
} from '../src/logic/format'
import type { Block } from '../src/types'

const D = '2026-11-19'
const base: Block = {
  id: `${D}T09:10:23`, date: D, time: '09:10:23', plannedMinutes: 5, actualMinutes: 4.5, rating: 'distracted',
  breakMinutes: 5, category: 'Work', task: 'Write report', note: 'Paused: phone call',
}

describe('serializeLine / parseLine', () => {
  it('writes the documented format', () => {
    expect(serializeLine(base)).toBe(
      '- 09:10:23 [planned:: 5] [actual:: 4.5] [rating:: distracted] [break:: 5] [category:: Work] [task:: [[Write report]]] [note:: Paused: phone call]',
    )
  })

  it('round-trips', () => {
    const p = parseLine(serializeLine(base), D)
    expect(p).toEqual({ kind: 'block', block: base })
  })

  it('omits empty optional fields and round-trips them as null', () => {
    const b = { ...base, category: null, task: null, note: null, breakMinutes: 0 }
    const line = serializeLine(b)
    expect(line).toBe('- 09:10:23 [planned:: 5] [actual:: 4.5] [rating:: distracted] [break:: 0]')
    expect(parseLine(line, D)).toEqual({ kind: 'block', block: b })
  })

  it('escapes notes to a single bracket-free line', () => {
    expect(escapeText('first line\nsecond [x] line')).toBe('first line / second x line')
    const p = parseLine(serializeLine({ ...base, note: 'a\nb ] c' }), D)
    expect(p.kind === 'block' && p.block.note).toBe('a / b  c')
  })

  it('reads task links with aliases and paths', () => {
    const p = parseLine('- 10:00:00 [planned:: 5] [actual:: 5] [rating:: okay] [task:: [[Projects/Report|the report]]]', D)
    expect(p.kind === 'block' && p.block.task).toBe('Projects/Report')
  })

  it('accepts fields in any order and missing break', () => {
    const p = parseLine('* 10:00:00 [rating:: flow] [actual:: 12] [planned:: 10]', D)
    expect(p).toMatchObject({ kind: 'block', block: { rating: 'flow', actualMinutes: 12, breakMinutes: 0 } })
  })

  it('flags broken entries as invalid and ignores other lines', () => {
    expect(parseLine('- 10:00:00 [planned:: 5] [actual:: 5] [rating:: amazing]', D).kind).toBe('invalid')
    expect(parseLine('- 10:00:00 [planned:: x] [actual:: 5] [rating:: okay]', D).kind).toBe('invalid')
    expect(parseLine('- 25:00:00 [planned:: 5] [actual:: 5] [rating:: okay]', D).kind).toBe('invalid')
    expect(parseLine('# Pomodoro log', D).kind).toBe('other')
    expect(parseLine('- a regular bullet', D).kind).toBe('other')
    expect(parseLine('', D).kind).toBe('other')
  })
})

describe('file helpers', () => {
  const content = appendLine(appendLine(newLogFile(D), serializeLine(base)), serializeLine({ ...base, time: '09:20:00', rating: 'okay' }))

  it('parses a whole file, skipping frontmatter and counting bad lines', () => {
    const withBad = appendLine(content, '- 11:00:00 [planned:: 5] [rating:: okay]')
    const { blocks, invalid } = parseFile(withBad, D)
    expect(blocks.map((b) => b.time)).toEqual(['09:10:23', '09:20:00'])
    expect(invalid).toBe(1)
  })

  it('handles CRLF files', () => {
    expect(parseFile(content.replace(/\n/g, '\r\n'), D).blocks).toHaveLength(2)
  })

  it('replaces and removes a single line by id', () => {
    const id = `${D}T09:20:00`
    const updated = replaceBlockLine(content, D, id, serializeLine({ ...base, time: '09:20:00', rating: 'flow' }))!
    expect(parseFile(updated, D).blocks.map((b) => b.rating)).toEqual(['distracted', 'flow'])
    const removed = replaceBlockLine(content, D, id, null)!
    expect(parseFile(removed, D).blocks).toHaveLength(1)
    expect(replaceBlockLine(content, D, `${D}T23:59:59`, null)).toBeNull()
  })

  it('finds the line number of a block', () => {
    expect(findBlockLine(content, D, base.id)).toBe(5)
  })

  it('appendLine adds a missing trailing newline', () => {
    expect(appendLine('abc', 'x')).toBe('abc\nx\n')
  })
})
