import { test, expect } from '@playwright/test'
import type { Snapshot } from '../shared/model'

for (const width of [320, 430, 1440]) test(`sidebar summary actions and full-width search at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1080 })
  await page.route('**/api/snapshot', route => route.fulfill({ json: activitySnapshot(1) }))
  await page.route('**/api/events', route => route.abort())
  await page.goto('/')
  const sidebar = page.locator('.chat-manager')
  const overview = sidebar.locator('.overview')
  await expect(overview).toHaveCSS('border-bottom-width', '0px')
  await expect(overview.locator('.sidebar-actions > button')).toHaveCount(3)
  const bounds = await overview.evaluate(node => {
    const counts = node.querySelector('.overview-counts')!.getBoundingClientRect()
    const actions = node.querySelector('.sidebar-actions')!.getBoundingClientRect()
    return { countsRight: counts.right, actionsLeft: actions.left, countsCenter: counts.y + counts.height / 2, actionsCenter: actions.y + actions.height / 2, right: node.getBoundingClientRect().right, actionsRight: actions.right }
  })
  expect(bounds.actionsLeft).toBeGreaterThanOrEqual(bounds.countsRight)
  expect(bounds.actionsRight).toBeLessThanOrEqual(bounds.right)
  expect(Math.abs(bounds.countsCenter - bounds.actionsCenter)).toBeLessThan(1)
  const search = await sidebar.locator('.search-field').boundingBox()
  const toolbar = await sidebar.locator('.toolbar').boundingBox()
  expect(search!.width).toBeCloseTo(toolbar!.width, 0)
  expect(search!.x).toBeCloseTo(toolbar!.x, 0)
  await expect(sidebar.locator('footer')).toHaveCSS('border-top-width', '0px')
  const card = await sidebar.locator('.project-panel').first().boundingBox()
  expect(card!.x).toBeCloseTo(search!.x, 0)
  expect(card!.x + card!.width).toBeCloseTo(search!.x + search!.width, 0)
})

for (const theme of ['dark', 'light']) for (const design of ['classic', 'islands']) test(`unread thread badge matches its project counter in ${theme} ${design}`, async ({ page }) => {
  await page.addInitScript(({ theme, design }) => {
    localStorage.setItem('threaddeck:appearance', JSON.stringify(theme))
    localStorage.setItem('threaddeck:design', JSON.stringify(design))
  }, { theme, design })
  await page.route('**/api/snapshot', route => {
    const now = Date.now(), projectId = '100000000000000010'
    return route.fulfill({ json: { health: 'connected', checkedAt: now, lastSuccessAt: now, attentionAvailable: true, inventoryLimited: false, message: null, projects: [{ id: projectId, name: 'ThreadDeck', directory: '/fixture', sessions: [
      { id: 'unread', threadId: '100000000000000001', guildId: null, projectId, title: 'Unread response', status: 'idle', agentCount: 0, updatedAt: now, responseAt: now },
      { id: 'idle', threadId: '100000000000000002', guildId: null, projectId, title: 'Read idle response', status: 'idle', agentCount: 0, updatedAt: now },
    ] }] } })
  })
  await page.route('**/api/events', route => route.abort())
  await page.goto('/')
  await page.getByRole('button', { name: 'All sessions', exact: true }).click()
  const badge = page.locator('.session-row[data-session-id="unread"] .status-unread')
  const counter = page.locator('.project-unread-action')
  const idle = page.locator('.session-row[data-session-id="idle"] .status-idle')
  await expect(badge).toBeVisible()
  await expect(counter).toBeVisible()
  await expect(idle).toBeVisible()
  const colors = async (selector: typeof badge) => selector.evaluate(node => ({ background: getComputedStyle(node).backgroundColor, color: getComputedStyle(node).color }))
  const unreadColors = await colors(badge)
  expect(unreadColors).toEqual(await colors(counter))
  expect(unreadColors).not.toEqual(await colors(idle))
  await expect(badge).toHaveCSS('font-weight', '600')
})

function activitySnapshot(count: number, health: Snapshot['health'] = 'connected'): Snapshot {
  const now = Date.now(), first = '100000000000000010', second = '100000000000000020'
  return { health, checkedAt: now, lastSuccessAt: now, attentionAvailable: true, inventoryLimited: false, message: null, projects: [
    { id: first, name: 'ThreadDeck', directory: '/fixture/first', sessions: [0, 1].map(index => ({ id: `activity-${index}`, threadId: `10000000000000000${index + 1}`, guildId: null, projectId: first, title: index ? 'Review the generated layout' : 'Implement the selected project activity indicator', status: index < count ? 'working' : 'idle', agentCount: index < count ? 1 : 0, updatedAt: now - index * 1000, responseAt: index ? null : 42 })) },
    { id: second, name: 'A-very-long-project-channel-name-for-layout-coverage', directory: '/fixture/second', sessions: [{ id: 'attention', threadId: '100000000000000003', guildId: null, projectId: second, title: 'Needs a decision', status: 'input', agentCount: 0, updatedAt: now }] },
  ] }
}

for (const width of [320, 430, 768, 1440]) for (const theme of ['dark', 'light']) for (const design of ['classic', 'islands']) test(`activity icon keeps header geometry at ${width}px in ${theme} ${design}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1080 })
  await page.addInitScript(({ theme, design, snapshot }) => {
    localStorage.setItem('threaddeck:appearance', JSON.stringify(theme))
    localStorage.setItem('threaddeck:design', JSON.stringify(design))
    class SnapshotStream extends EventTarget {
      constructor() { super(); Reflect.set(window, 'sidebarSnapshotStream', this); queueMicrotask(() => this.dispatchEvent(new MessageEvent('snapshot', { data: JSON.stringify(snapshot) }))) }
      close() {}
    }
    Object.defineProperty(window, 'EventSource', { value: SnapshotStream })
  }, { theme, design, snapshot: activitySnapshot(1) })
  await page.goto('/')
  await page.getByRole('button', { name: 'All sessions', exact: true }).click()
  const cards = page.locator(design === 'classic' ? '.project-panel' : '.visual-project')
  const card = cards.filter({ has: page.locator('.project-name', { hasText: /^ThreadDeck$/ }) })
  const slot = card.locator('.project-activity-slot')
  await expect(slot).toHaveAttribute('data-state', 'working')
  await expect(slot.getByRole('img', { name: '1 working session in ThreadDeck', exact: true })).toBeVisible()
  await expect(slot.locator('.project-activity-loader i')).toHaveCount(9)
  await expect(slot.locator('i').first()).toHaveCSS('animation-name', 'project-activity-matrix')
  await page.evaluate(() => document.fonts.ready)
  const geometry = () => cards.evaluateAll(nodes => nodes.map(node => {
    const header = node.querySelector('.project-heading,.island-header')!, h = header.getBoundingClientRect(), s = node.querySelector('.project-activity-slot')!.getBoundingClientRect(), title = node.querySelector('.project-name')!.getBoundingClientRect()
    if (title.width <= 8) throw new Error('Project title has no readable space')
    return { headerHeight: h.height, slotWidth: s.width, slotHeight: s.height }
  }))
  const initial = await geometry()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const publish = (snapshot: Snapshot) => page.evaluate(snapshot => Reflect.get(window, 'sidebarSnapshotStream').dispatchEvent(new MessageEvent('snapshot', { data: JSON.stringify(snapshot) })), snapshot)
  await publish(activitySnapshot(0))
  await expect(slot).toHaveAttribute('data-state', 'idle')
  await expect(slot.getByRole('img')).toHaveCount(0)
  await expect(slot.locator('.project-activity-loader')).toHaveCount(0)
  expect(await geometry()).toEqual(initial)
  await publish(activitySnapshot(2))
  await expect(slot.getByRole('img', { name: '2 working sessions in ThreadDeck', exact: true })).toBeVisible()
  expect(await geometry()).toEqual(initial)
  if (design === 'classic') {
    await expect(card.locator('.project-summary')).toHaveCount(0)
    const bounds = await slot.boundingBox(), name = await card.locator('.project-name').boundingBox()
    expect(Math.abs(bounds!.y - name!.y)).toBeLessThan(8)
  }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(slot.locator('i').first()).toHaveCSS('animation-name', 'none')
  await expect(slot.locator('i').first()).toHaveCSS('opacity', '0.8')
  await publish(activitySnapshot(2, 'stale'))
  await expect(slot).toHaveAttribute('data-state', 'unknown')
  await expect(slot.getByRole('img', { name: 'Working status unavailable in ThreadDeck', exact: true })).toBeVisible()
  await expect(slot.locator('.project-activity-loader')).toHaveCount(0)
  expect(await geometry()).toEqual(initial)
})
