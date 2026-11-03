import { expect, test } from '@playwright/test'
import type { Snapshot } from '../shared/model'

test('completion runway tracks 20 seconds smoothly across dashboard clock ticks', async ({ page }) => {
  const now = Date.now()
  const snapshot: Snapshot = {
    health: 'connected', checkedAt: now, lastSuccessAt: now, attentionAvailable: true,
    inventoryLimited: false, message: null,
    projects: [{ id: 'project', name: 'Project', directory: '/project', sessions: [
      { id: 'finished', projectId: 'project', threadId: '1561737719133114458', guildId: null,
        title: 'Finished session', status: 'idle', agentCount: 0, updatedAt: now, responseAt: now },
    ] }],
  }
  await page.clock.install({ time: now })
  await page.clock.pauseAt(now)
  await page.route('**/api/snapshot', route => route.fulfill({ json: snapshot }))
  await page.route('**/api/events', route => route.abort())
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const pill = page.locator('.status-just-finished')
  const runway = page.locator('.finished-runway')
  await expect(pill).toHaveText('Just finished')

  // Control CSS time independently of the dashboard's JS clock. A clock tick
  // must not seek the animation again and double-count already elapsed time.
  await runway.evaluate(node => { const animation = node.getAnimations()[0]; animation.pause(); animation.currentTime = 5000 })
  const scale = () => runway.evaluate(node => new DOMMatrixReadOnly(getComputedStyle(node).transform).a)
  const before = await scale()
  await page.clock.runFor(5000)
  expect(await scale()).toBeCloseTo(before, 2)
  expect(await scale()).toBeCloseTo(.75, 2)

  await runway.evaluate(node => { node.getAnimations()[0].currentTime = 10_000 })
  await page.clock.runFor(5000)
  expect(await scale()).toBeCloseTo(.5, 2)
  await expect(pill).toHaveText('Just finished')
  await runway.evaluate(node => { node.getAnimations()[0].currentTime = 19_000 })
  await page.clock.runFor(9000)
  expect(await scale()).toBeCloseTo(.05, 2)
  await expect(pill).toHaveText('Just finished')
  await page.clock.runFor(1000)
  await expect(page.getByRole('button', { name: 'Mark Finished session as read', exact: true })).toHaveText('Unread')
  await expect(runway).toHaveCount(0)
})
