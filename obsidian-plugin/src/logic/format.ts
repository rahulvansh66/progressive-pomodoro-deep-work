/**
 * Daily log file format. One block per list item, as Dataview inline fields:
 *
 *   - 09:10:23 [planned:: 5] [actual:: 4.5] [rating:: okay] [break:: 5] [category:: Work] [task:: [[Write report]]] [note:: …]
 */
import { isRating, type Block } from '../types'
import { round1 } from './dates'

/** Make free text safe for a single inline field: one line, no brackets. */
export function escapeText(s: string): string {
  return s.replace(/\s*\r?\n\s*/g, ' / ').replace(/[[\]]/g, '').trim()
}

/** Task link text must not contain characters that break a [[wikilink]]. */
const escapeLink = (s: string) => s.replace(/[[\]|\r\n]/g, '').trim()

export function serializeLine(b: Omit<Block, 'id' | 'date'>): string {
  const parts = [
    `- ${b.time}`,
    `[planned:: ${b.plannedMinutes}]`,
    `[actual:: ${round1(b.actualMinutes)}]`,
    `[rating:: ${b.rating}]`,
    `[break:: ${b.breakMinutes}]`,
  ]
  const category = b.category ? escapeText(b.category) : ''
  const task = b.task ? escapeLink(b.task) : ''
  const note = b.note ? escapeText(b.note) : ''
  if (category) parts.push(`[category:: ${category}]`)
  if (task) parts.push(`[task:: [[${task}]]]`)
  if (note) parts.push(`[note:: ${note}]`)
  return parts.join(' ')
}

export type ParsedLine =
  | { kind: 'block'; block: Block }
  | { kind: 'invalid' } // looks like a log entry but can't be read
  | { kind: 'other' } // heading, blank line, prose: not a log entry

const ENTRY = /^\s*[-*]\s+(\d{2}:\d{2}:\d{2})\b(.*)$/
const FIELD = /\[([A-Za-z]+)::\s*((?:\[\[[^\]]*\]\]|[^\]])*?)\s*\]/g

const num = (s: string | undefined) => {
  if (s === undefined || s.trim() === '') return NaN
  return Number(s)
}

export function parseLine(line: string, date: string): ParsedLine {
  const m = ENTRY.exec(line)
  if (!m) return { kind: 'other' }
  const time = m[1]
  const fields: Record<string, string> = {}
  for (const f of m[2].matchAll(FIELD)) fields[f[1].toLowerCase()] = f[2]

  const planned = num(fields.planned)
  const actual = num(fields.actual)
  const brk = fields.break === undefined ? 0 : num(fields.break)
  const rating = (fields.rating ?? '').trim()
  const [hh, mm, ss] = time.split(':').map(Number)
  if (
    hh > 23 || mm > 59 || ss > 59 ||
    !(planned > 0) || !(actual >= 0) || !(brk >= 0) || !isRating(rating)
  ) return { kind: 'invalid' }

  const task = fields.task?.replace(/^\[\[|\]\]$/g, '').split('|')[0].trim() || null
  return {
    kind: 'block',
    block: {
      id: `${date}T${time}`,
      date,
      time,
      plannedMinutes: planned,
      actualMinutes: actual,
      rating,
      breakMinutes: brk,
      category: fields.category?.trim() || null,
      task,
      note: fields.note?.trim() || null,
    },
  }
}

export interface ParsedFile { blocks: Block[]; invalid: number }

export function parseFile(content: string, date: string): ParsedFile {
  const lines = content.split(/\r?\n/)
  let i = 0
  // Skip YAML frontmatter.
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((l, j) => j > 0 && l.trim() === '---')
    if (end > 0) i = end + 1
  }
  const blocks: Block[] = []
  let invalid = 0
  for (; i < lines.length; i++) {
    const p = parseLine(lines[i], date)
    if (p.kind === 'block') blocks.push(p.block)
    else if (p.kind === 'invalid') invalid++
  }
  return { blocks, invalid }
}

export function newLogFile(date: string): string {
  return `---\ndate: ${date}\n---\n# Pomodoro log\n\n`
}

/** Append a line to file content, making sure it starts on its own line. */
export function appendLine(content: string, line: string): string {
  if (content.length && !content.endsWith('\n')) content += '\n'
  return content + line + '\n'
}

/**
 * Replace (or with `replacement === null`, remove) the line holding the block with this id.
 * Returns the new content, or null if the block wasn't found.
 */
export function replaceBlockLine(content: string, date: string, id: string, replacement: string | null): string | null {
  const eol = content.includes('\r\n') ? '\r\n' : '\n'
  const lines = content.split(/\r?\n/)
  const idx = lines.findIndex((l) => {
    const p = parseLine(l, date)
    return p.kind === 'block' && p.block.id === id
  })
  if (idx < 0) return null
  if (replacement === null) lines.splice(idx, 1)
  else lines[idx] = replacement
  return lines.join(eol)
}

/** Line number (0-based) of the block with this id, for jumping to it in the editor. */
export function findBlockLine(content: string, date: string, id: string): number {
  return content.split(/\r?\n/).findIndex((l) => {
    const p = parseLine(l, date)
    return p.kind === 'block' && p.block.id === id
  })
}
