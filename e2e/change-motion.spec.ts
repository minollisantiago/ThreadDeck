import { expect, test, type Page } from '@playwright/test'
import type { Snapshot } from '../shared/model'

declare global {
  interface Window { changeMotionEvents: string[] }
}

async function setup(page: Page) {
  const now = Date.now()
  let snapshot: Snapshot = { health: 'connected', checkedAt: now, lastSuccessAt: now,
    attentionAvailable: true, inventoryLimited: false, message: null,
    projects: [{ id: 'alpha', name: 'Alpha', directory: '/alpha', sessions: [
      { id: 'request', projectId: 'alpha', title: 'Review the transition', status: 'permission', agentCount: 0,
        updatedAt: now, threadId: '1561737719133114458', guildId: '1526236793048141935' },
    ] }] }
  await page.addInitScript(() => {
    window.changeMotionEvents = []
    const animate = Element.prototype.animate
    Element.prototype.animate = function (...args) {
      window.changeMotionEvents.push(String(this.className))
      return animate.apply(this, args)
    }
  })
  await page.route('**/api/snapshot', route => route.fulfill({ json: snapshot }))
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'dark' })
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Review the transition', exact: true })).toBeVisible()
  return async (change: (previous: Snapshot) => Snapshot = value => value) => {
    snapshot = change(snapshot)
    const response = page.waitForResponse('**/api/snapshot')
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await response
    // Flush rendering after the source response, not a hard-coded animation delay.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  }
}

async function events(page: Page) { return page.evaluate(() => window.changeMotionEvents) }

test('explicit view and filter changes animate only results; search and identical polls do not', async ({ page }) => {
  const refresh = await setup(page)
  expect(await events(page)).toEqual([])
  await page.getByRole('button', { name: 'By state', exact: true }).click()
  await expect(page.getByRole('button', { name: 'By state', exact: true })).toBeFocused()
  await expect(page.locator('.state-panel')).toHaveCount(1)
  expect(await events(page)).toEqual(['project-list'])
  await page.getByRole('button', { name: 'Switch to islands view', exact: true }).click()
  expect(await events(page)).toEqual(['project-list', 'project-list'])
  await page.getByRole('button', { name: 'All sessions', exact: true }).click()
  expect(await events(page)).toEqual(['project-list', 'project-list', 'project-list'])
  await page.getByRole('searchbox').fill('Review')
  await refresh()
  expect(await events(page)).toHaveLength(3)
  await expect(page.getByRole('searchbox')).toBeFocused()
  await expect(page.getByRole('searchbox')).toHaveValue('Review')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await page.locator('.project-list').evaluate(node => node.getAnimations().length)).toBe(0)
  await page.getByRole('button', { name: 'By project', exact: true }).click()
  await page.getByRole('button', { name: 'Switch to list view', exact: true }).click()
  expect(await events(page)).toHaveLength(3)
})

test('status and unread changes animate only changed flags and acknowledge immediately', async ({ page }) => {
  const refresh = await setup(page)
  await refresh(previous => ({ ...previous, projects: previous.projects.map(project => ({ ...project,
    sessions: project.sessions.map(session => ({ ...session, status: 'working', agentCount: 1 })),
  })) }))
  await expect(page.locator('.status-working')).toHaveText('Working')
  expect(await events(page)).toEqual(['session-flags'])
  await refresh()
  expect(await events(page)).toHaveLength(1)
  await refresh(previous => ({ ...previous, projects: previous.projects.map(project => ({ ...project,
    sessions: project.sessions.map(session => ({ ...session, status: 'permission', agentCount: 0, responseAt: session.updatedAt + 1 })),
  })) }))
  await expect(page.getByRole('button', { name: 'Mark Review the transition as read', exact: true })).toBeVisible()
  expect(await events(page)).toHaveLength(2)
  await page.getByRole('button', { name: 'Mark Review the transition as read', exact: true }).click()
  await expect(page.locator('.status-unread')).toHaveCount(0)
  expect(await events(page)).toHaveLength(3)
  await refresh(previous => ({ ...previous, projects: previous.projects.map(project => ({ ...project,
    sessions: project.sessions.map(session => ({ ...session, status: 'idle', agentCount: 0 })),
  })) }))
  // Active filtering removes the row now; no outgoing clickable copy is retained.
  await expect(page.getByRole('link', { name: 'Review the transition', exact: true })).toHaveCount(0)
  await expect(page.getByText('No active sessions', { exact: true })).toBeVisible()
  expect(await page.locator('.project-list').evaluate(node => node.getAnimations().length)).toBe(0)
})

test('connection notice enters and exits while alert semantics and stale labels update immediately', async ({ page }) => {
  const refresh = await setup(page)
  const notice = page.locator('.connection-notice-region')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await refresh(previous => ({ ...previous, health: 'disconnected' }))
  await expect(page.getByRole('alert')).toContainText('Showing your last snapshot')
  await expect(page.locator('.status-unknown')).toHaveText('Unknown')
  expect(await notice.evaluate(node => node.getAnimations().some(animation => animation instanceof CSSTransition && animation.transitionProperty === 'grid-template-rows'))).toBe(true)
  await notice.evaluate(async node => Promise.all(node.getAnimations().map(animation => animation.finished)))
  await refresh(previous => ({ ...previous, health: 'connected' }))
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.locator('.status-permission')).toHaveText('Permission needed')
  await expect(notice).toHaveAttribute('aria-hidden', 'true')
  await notice.evaluate(async node => Promise.all(node.getAnimations().map(animation => animation.finished)))
  expect(await notice.evaluate(node => node.getBoundingClientRect().height)).toBe(0)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await refresh(previous => ({ ...previous, health: 'disconnected' }))
  await expect(page.getByRole('alert')).toBeVisible()
  expect(await notice.evaluate(node => node.getAnimations().length)).toBe(0)
  expect(await page.locator('.session-flags').evaluate(node => node.getAnimations().length)).toBe(0)
})
