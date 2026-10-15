import { describe, expect, it } from 'vitest'
import {
  countParagraphs,
  insertParagraphBreak,
  insertTextAtCursor,
  prefixLinesAsBullets,
  prefixLinesAsNumbers,
  wrapSelection,
} from './textEditorInsert'

describe('textEditorInsert', () => {
  it('insertTextAtCursor splices at selection', () => {
    const { next, selection } = insertTextAtCursor('hello world', { start: 5, end: 5 }, ',')
    expect(next).toBe('hello, world')
    expect(selection).toEqual({ start: 6, end: 6 })
  })

  it('wrapSelection wraps selected text', () => {
    const { next } = wrapSelection('say hi', { start: 4, end: 6 }, '**')
    expect(next).toBe('say **hi**')
  })

  it('prefixLinesAsBullets adds bullets', () => {
    const { next } = prefixLinesAsBullets('one\ntwo', { start: 0, end: 7 })
    expect(next).toBe('• one\n• two')
  })

  it('prefixLinesAsNumbers renumbers lines', () => {
    const { next } = prefixLinesAsNumbers('a\nb', { start: 0, end: 3 })
    expect(next).toBe('1. a\n2. b')
  })

  it('insertParagraphBreak adds blank line', () => {
    const { next } = insertParagraphBreak('Hello', { start: 5, end: 5 })
    expect(next).toBe('Hello\n\n')
  })

  it('countParagraphs splits on blank lines', () => {
    expect(countParagraphs('a\n\nb')).toBe(2)
    expect(countParagraphs('')).toBe(0)
  })
})
