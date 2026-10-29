// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { ProjectActivity } from './project-activity'

afterEach(cleanup)

it('shows an animated matrix icon and an accessible working count in a fixed slot', async () => {
  const { container } = render(<ProjectActivity count={2} verified projectName="ThreadDeck" />)
  const indicator = screen.getByRole('img', { name: '2 working sessions in ThreadDeck' })
  expect(container.querySelector('.project-activity-slot')?.getAttribute('data-state')).toBe('working')
  expect(container.querySelectorAll('.project-activity-loader i')).toHaveLength(9)
  expect(container.querySelector('.project-activity-loader')?.getAttribute('aria-hidden')).toBe('true')
  expect(screen.getByText('2')).toBeTruthy()
  await act(async () => { indicator.focus() })
  expect((await screen.findByRole('tooltip')).textContent).toBe('2 working sessions in ThreadDeck')
})

it('reserves the same idle slot without animating or announcing zero working sessions', () => {
  const { container, rerender } = render(<ProjectActivity count={1} verified projectName="ThreadDeck" />)
  const slot = container.querySelector('.project-activity-slot')
  rerender(<ProjectActivity count={0} verified projectName="ThreadDeck" />)
  expect(container.querySelector('.project-activity-slot')).toBe(slot)
  expect(slot?.getAttribute('data-state')).toBe('idle')
  expect(slot?.getAttribute('aria-hidden')).toBe('true')
  expect(container.querySelector('.project-activity-loader')).toBeNull()
  expect(screen.queryByRole('img')).toBeNull()
})

it('never animates stale activity or misrepresents it as verified idle', () => {
  const { container } = render(<ProjectActivity count={3} verified={false} projectName="ThreadDeck" />)
  expect(screen.getByRole('img', { name: 'Working status unavailable in ThreadDeck' })).toBeTruthy()
  expect(container.querySelector('.project-activity-loader')).toBeNull()
  expect(screen.getByText('—')).toBeTruthy()
  expect(container.querySelector('.project-activity-slot')?.getAttribute('data-state')).toBe('unknown')
})

it('caps the visual counter without hiding the full count from assistive technology', () => {
  render(<ProjectActivity count={123} verified projectName="ThreadDeck" />)
  expect(screen.getByText('99+')).toBeTruthy()
  expect(screen.getByRole('img', { name: '123 working sessions in ThreadDeck' })).toBeTruthy()
})
