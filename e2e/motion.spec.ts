import { expect, test, type Locator } from './fixtures'
import type { Snapshot } from '../shared/model'

test.beforeEach(async ({ page }) => {
  const now = Date.now()
  const snapshot: Snapshot = { health: 'connected', checkedAt: now, lastSuccessAt: now,
    attentionAvailable: true, inventoryLimited: false, message: null,
    projects: [{ id: 'alpha', name: 'Alpha', directory: '/alpha', sessions: [
      { id: 'request', projectId: 'alpha', title: 'Review the motion', status: 'permission', agentCount: 0,
        updatedAt: now, threadId: '1561737719133114458', guildId: '1526236793048141935' },
    ] }] }
  await page.route('**/api/snapshot', route => route.fulfill({ json: snapshot }))
  await page.setViewportSize({ width: 430, height: 900 })
  await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'dark' })
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Review the motion', exact: true })).toBeVisible()
})

async function finishMotion(element: Locator) {
  await element.evaluate(async node => {
    await Promise.all(node.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {})))
  })
}

for (const design of ['classic', 'islands']) test(`${design} collapse animates both ways and disables closed content`, async ({ page }) => {
  if (design === 'islands') {
    await page.getByRole('button', { name: 'App controls', exact: true }).click()
    await page.getByRole('button', { name: 'Switch to islands view', exact: true }).click()
    await page.keyboard.press('Escape')
  }
  const heading = page.getByRole('button', { name: /Alpha/ })
  const content = page.locator('.project-collapse')
  const openHeight = await content.evaluate(node => node.getBoundingClientRect().height)
  expect(openHeight).toBeGreaterThan(0)
  for (const collapsed of [true, false]) {
    await heading.click()
    await expect(heading).toHaveAttribute('aria-expanded', String(!collapsed))
    await expect(content).toHaveAttribute('aria-hidden', String(collapsed))
    expect(await content.evaluate(node => node.hasAttribute('inert'))).toBe(collapsed)
    expect(await content.evaluate(node => node.getAnimations().some(animation => animation instanceof CSSTransition && animation.transitionProperty === 'grid-template-rows'))).toBe(true)
    await finishMotion(content)
    expect(await content.evaluate(node => node.getBoundingClientRect().height)).toBeCloseTo(collapsed ? 0 : openHeight, 0)
    if (collapsed) {
      await expect(page.getByRole('link', { name: 'Review the motion', exact: true })).toHaveCount(0)
      expect(await content.locator('a').first().evaluate(node => { node.focus(); return document.activeElement === node })).toBe(false)
    }
  }
  // Reverse an in-flight transition without an unmount or stale completion timer.
  await heading.evaluate(async node => {
    if (!(node instanceof HTMLElement)) throw new Error('Expected a project button')
    for (let i = 0; i < 3; i++) {
      node.click()
      await new Promise(resolve => requestAnimationFrame(resolve))
    }
  })
  await expect(heading).toHaveAttribute('aria-expanded', 'false')
  await finishMotion(content)
  expect(await content.evaluate(node => node.getBoundingClientRect().height)).toBe(0)
  await heading.click()
  await finishMotion(content)
  // Neither relative-time ticks nor identical API polling restart motion.
  await page.waitForTimeout(5500)
  expect(await content.evaluate(node => node.getAnimations({ subtree: true }).length)).toBe(0)
})

test('compact popovers animate entry and exit without losing native dismissal or breakpoint behavior', async ({ page }) => {
  for (const [name, selector] of [['App controls', '#header-controls'], ['Thread list options', '#thread-list-options']] as const) {
    const trigger = page.getByRole('button', { name, exact: true })
    const panel = page.locator(selector)
    await trigger.click()
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(await panel.evaluate(node => node.getAnimations().some(animation => animation instanceof CSSTransition && animation.transitionProperty === 'transform'))).toBe(true)
    await finishMotion(panel)
    await page.keyboard.press('Escape')
    await expect(trigger).toBeFocused()
    expect(await panel.evaluate(node => node.getAnimations().some(animation => animation instanceof CSSTransition && animation.transitionProperty === 'opacity'))).toBe(true)
    await finishMotion(panel)
    await expect(panel).not.toBeVisible()
    await trigger.click()
    // The fixed-size appearance picker can cover the search field. Click an
    // actually exposed area to exercise native outside-click dismissal.
    await page.getByRole('heading', { name: 'ThreadDeck LIVE' }).click()
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await finishMotion(panel)
    await trigger.click()
    await page.setViewportSize({ width: 1280, height: 900 })
    await expect(panel).not.toHaveAttribute('popover')
    await expect(panel).toBeVisible()
    await expect(panel).toHaveCSS('opacity', '1')
    await page.setViewportSize({ width: 430, height: 900 })
    await expect(panel).not.toBeVisible()
  }
})

test('tooltip fades for focus and hover, and reduced motion applies immediately', async ({ page }) => {
  const connection = page.getByRole('button', { name: 'Connected', exact: true })
  const tooltip = page.getByRole('tooltip')
  await connection.focus()
  await expect(tooltip).toBeVisible()
  expect(await tooltip.evaluate(node => node.getAnimations().length)).toBeGreaterThan(0)
  await finishMotion(tooltip)
  await page.getByRole('searchbox').focus()
  await finishMotion(tooltip)
  await expect(tooltip).not.toBeVisible()
  await connection.hover()
  await expect(tooltip).toBeVisible()
  await page.getByRole('heading', { name: /ThreadDeck/ }).hover()
  await finishMotion(tooltip)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const content = page.locator('.project-collapse')
  await page.getByRole('button', { name: /Alpha/ }).click()
  expect(await content.evaluate(node => node.getBoundingClientRect().height)).toBe(0)
  expect(await content.evaluate(node => node.getAnimations({ subtree: true }).length)).toBe(0)
  await page.getByRole('button', { name: /Alpha/ }).click()
  await page.getByRole('button', { name: 'App controls', exact: true }).click()
  const panel = page.locator('#header-controls')
  expect(await panel.evaluate(node => node.getAnimations().length)).toBe(0)
  await page.keyboard.press('Escape')
  await expect(panel).not.toBeVisible()
  await connection.focus()
  await expect(tooltip).toBeVisible()
  expect(await tooltip.evaluate(node => node.getAnimations().length)).toBe(0)
})

test('changing motion preference mid-collapse settles immediately; icon press feedback stays local', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const theme = page.locator('.appearance-controls button[aria-label$=" mode"]')
  await theme.hover()
  await page.mouse.down()
  await finishMotion(theme)
  expect(await theme.evaluate(node => getComputedStyle(node).transform)).not.toBe('none')
  await page.mouse.up()
  await finishMotion(theme)
  const content = page.locator('.project-collapse')
  await page.getByRole('button', { name: /Alpha/ }).click()
  expect(await content.evaluate(node => node.getAnimations().length)).toBeGreaterThan(0)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(content).toHaveCSS('visibility', 'hidden')
  expect(await content.evaluate(node => node.getBoundingClientRect().height)).toBe(0)
  expect(await content.evaluate(node => node.getAnimations().length)).toBe(0)
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).hover()
  await page.mouse.down()
  expect(await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).evaluate(node => getComputedStyle(node).transform)).toBe('none')
  await page.mouse.up()
})
