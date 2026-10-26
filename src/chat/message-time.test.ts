import { expect, it } from 'vitest'
import { formatMessageTime } from './message-time'

const time = (date: Date) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
it('labels the local clock time for messages from today', () => {
  const sent = new Date(2026, 9, 26, 10, 15), now = new Date(2026, 9, 26, 18, 30)
  expect(formatMessageTime(sent.toISOString(), now)).toBe(`Today · ${time(sent)}`)
})
it('adds a zero-padded dd/mm/yy date for any other calendar day', () => {
  const sent = new Date(2026, 0, 4, 8, 5), now = new Date(2026, 9, 26)
  expect(formatMessageTime(sent.toISOString(), now)).toBe(`04/01/26 · ${time(sent)}`)
})
it('compares the month and year as well as the day number', () => {
  const now = new Date(2026, 9, 26)
  for (const sent of [new Date(2026, 8, 26, 10, 15), new Date(2025, 9, 26, 10, 15)]) {
    expect(formatMessageTime(sent.toISOString(), now)).not.toBe(time(sent))
  }
})
it('uses local calendar boundaries across midnight and updates when today changes', () => {
  const sent = new Date(2026, 9, 25, 23, 59)
  expect(formatMessageTime(sent.toISOString(), new Date(2026, 9, 25, 23, 59))).toBe(`Today · ${time(sent)}`)
  expect(formatMessageTime(sent.toISOString(), new Date(2026, 9, 26, 0, 1))).toBe(`25/10/26 · ${time(sent)}`)
})
it('handles malformed timestamps without displaying a NaN date', () => {
  expect(formatMessageTime('not a timestamp')).toBe('Unknown time')
})
