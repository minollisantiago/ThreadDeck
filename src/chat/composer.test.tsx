// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PromptComposer } from './composer'

afterEach(() => { cleanup(); localStorage.clear() })

const props = {
  draft: { text: 'Hello', anchor: 5, head: 5, files: [] }, change: vi.fn(), expanded: false, toggle: vi.fn(),
  enabled: true, busy: false, pending: false, catalog: { entries: [] }, submit: vi.fn(), stop: vi.fn(),
}

it('explains the expand composer button and keyboard shortcut on focus', async () => {
  render(<PromptComposer {...props} />)
  await act(async () => { screen.getByRole('button', { name: 'Expand composer' }).focus() })
  const tooltip = await screen.findByRole('tooltip')
  expect(tooltip.textContent).toContain('Expand composer')
  expect(tooltip.textContent).toContain('Ctrl P · P')
})
