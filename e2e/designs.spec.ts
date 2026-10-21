import { mkdir } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { Snapshot } from '../shared/model'

test('list and islands toggle before theme, persist, and fit desktop and mobile', async ({ page }) => {
  const now = Date.now()
  const snapshot: Snapshot = {
    health: 'connected', checkedAt: now, lastSuccessAt: now, attentionAvailable: true, inventoryLimited: false, message: null,
    projects: ['WeekTrace', 'NaturalGas', 'ThreadDeck', 'Website'].map((name, index) => ({ id: name, name, directory: `/${name}`, sessions: [
      { id: `${name}-work`, projectId: name, title: ['Native Windows support', 'Compare saved backtesting results', 'Shape the live session switchboard', 'Polish the checkout flow'][index], threadId: '1561737719133114458', guildId: '1526236793048141935', status: 'working', agentCount: 2, updatedAt: now - 10_000 },
      { id: `${name}-review`, projectId: name, title: 'Review the configuration and permissions before continuing with the next iteration', threadId: '1561737719133114459', guildId: '1526236793048141935', status: 'permission', agentCount: 0, updatedAt: now },
      { id: `${name}-reply`, projectId: name, title: 'Latest response waiting for you', threadId: '1561737719133114460', guildId: '1526236793048141935', status: 'idle', agentCount: 0, updatedAt: now, responseAt: now },
    ] })),
  }
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/api/snapshot', route => route.fulfill({ json: { ...snapshot, lastSuccessAt: Date.now() } }))
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' })
  await page.goto('/')
  const toggle = page.getByRole('button', { name: /Switch to (islands|list) view/ })
  async function expectPillRadius() {
    const radii = await page.locator('.overview-pill, .project-total, .project-attention, .project-unread, .status, [data-slot=badge], .live-label, .session-project').evaluateAll(elements => elements.map(element => getComputedStyle(element).borderRadius))
    expect(radii.length).toBeGreaterThan(0)
    expect([...new Set(radii)]).toEqual(['10px'])
  }
  async function expectStateBorders() {
    const working = page.locator('.session-tile[data-state=working]').first()
    const unread = page.locator('.session-tile.session-unread').first()
    const workingColor = await working.locator('.glyph-working').evaluate(element => getComputedStyle(element).color)
    const unreadColor = await unread.locator('.status-unread').evaluate(element => getComputedStyle(element).color)
    for (const side of ['top', 'right', 'bottom', 'left']) {
      await expect(working).toHaveCSS(`border-${side}-color`, workingColor)
      await expect(unread).toHaveCSS(`border-${side}-color`, unreadColor)
    }
    await expect(unread).toHaveCSS('box-shadow', 'none')
  }
  await expect(toggle).toHaveAttribute('aria-label', 'Switch to islands view')
  await expect(page.getByRole('combobox')).toHaveCount(0)
  expect(await toggle.evaluate(element => element.nextElementSibling?.getAttribute('aria-label'))).toBe('Switch to light mode')
  await mkdir('artifacts', { recursive: true })
  for (const design of ['classic', 'islands']) {
    await page.setViewportSize({ width: 1440, height: 1100 })
    if (design === 'islands') await toggle.click()
    await expect(page.locator('.app-shell')).toHaveAttribute('data-design', design)
    await expectPillRadius()
    await expect(page.getByRole('link', { name: 'Native Windows support', exact: true })).toBeVisible()
    if (design === 'islands') {
      await expect(page.locator('.emblem-signal').first()).toHaveCSS('width', '18px')
      for (const pill of ['.visual-project-stats .status-working', '.visual-project-stats .status-unread', '.session-tile .status-working', '.session-tile .status-unread']) {
        await expect(page.locator(pill).first()).toHaveCSS('font-size', '12px')
        await expect(page.locator(pill).first()).toHaveCSS('border-radius', '10px')
      }
      await expectStateBorders()
    }
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: `artifacts/design-${design}-desktop.png`, fullPage: true })
    await page.reload()
    await expect(page.locator('.app-shell')).toHaveAttribute('data-design', design)
    await page.getByRole('searchbox').fill('backtesting')
    await expect(page.locator('.session-title')).toHaveCount(1)
    await page.getByRole('searchbox').fill('')
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 })
      // Responsive controls move into a native popover on the media-query event.
      await expect(page.locator('#header-controls')).toHaveAttribute('popover', 'auto')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.getByRole('button', { name: 'App controls', exact: true }).click()
      await expect(toggle).toBeVisible()
      await toggle.click()
      await expect(page.locator('.app-shell')).toHaveAttribute('data-design', design === 'classic' ? 'islands' : 'classic')
      await toggle.click()
      await expect(page.locator('.app-shell')).toHaveAttribute('data-design', design)
      await page.keyboard.press('Escape')
      await expectPillRadius()
      if (design === 'classic') {
        const panel = page.locator('.project-panel').first()
        for (const pill of ['.project-total', '.project-attention', '.project-unread']) {
          await expect(panel.locator(pill)).toHaveCSS('font-size', '11px')
          await expect(panel.locator(pill)).toHaveCSS('line-height', '20px')
        }
        const connection = await panel.evaluate(element => {
          const heading = element.querySelector('.project-heading')!
          const icon = element.querySelector('.project-channel-icon')!.getBoundingClientRect()
          const name = element.querySelector('.project-name')!.getBoundingClientRect()
          const pills = element.querySelector('.project-pills')!.getBoundingClientRect()
          const row = element.querySelector('.session-row')!
          const rail = getComputedStyle(row, '::before')
          const stem = getComputedStyle(heading, '::after')
          return {
            iconCenter: icon.left + icon.width / 2,
            railCenter: row.getBoundingClientRect().left + parseFloat(rail.left) + parseFloat(rail.borderLeftWidth) / 2,
            stemCenter: heading.getBoundingClientRect().left + parseFloat(stem.left) + parseFloat(stem.width) / 2,
            stemGap: heading.getBoundingClientRect().top + parseFloat(stem.top) - icon.bottom,
            nameTop: name.top, nameRight: name.right, pillsTop: pills.top, pillsLeft: pills.left,
          }
        })
        expect(Math.abs(connection.iconCenter - connection.railCenter)).toBeLessThan(1)
        expect(Math.abs(connection.iconCenter - connection.stemCenter)).toBeLessThan(1)
        expect(connection.stemGap).toBeGreaterThanOrEqual(2)
        expect(connection.stemGap).toBeLessThanOrEqual(6)
        expect(Math.abs(connection.nameTop - connection.pillsTop)).toBeLessThan(1)
        expect(connection.pillsLeft).toBeGreaterThan(connection.nameRight)
        await expect(panel.locator('.session-row').first()).toHaveCSS('min-height', '42px')
        await expect(panel.locator('.session-attention-marker').first()).not.toBeVisible()
        await panel.locator('.project-heading').click()
        expect(await panel.locator('.project-heading').evaluate(element => getComputedStyle(element, '::after').content)).toBe('none')
        await panel.locator('.project-heading').click()
      }
      if (design === 'islands') {
        const header = page.locator('.island-header').first()
        const connection = await header.evaluate(element => {
          const bounds = element.getBoundingClientRect()
          const emblem = element.querySelector('.project-emblem')!.getBoundingClientRect()
          const grid = element.nextElementSibling!
          const tile = grid.querySelector('.session-tile')!
          const spine = getComputedStyle(tile, '::after')
          const border = parseFloat(getComputedStyle(tile).borderLeftWidth)
          const line = getComputedStyle(element, '::before')
          return {
            startY: bounds.top + parseFloat(line.top), emblemCenterY: emblem.top + emblem.height / 2,
            endY: bounds.bottom - parseFloat(line.bottom), gridTop: tile.getBoundingClientRect().top + border + parseFloat(spine.top),
            railX: bounds.left + parseFloat(line.left), spineX: tile.getBoundingClientRect().left + border + parseFloat(spine.left),
            lineEndX: bounds.left + parseFloat(line.width), emblemRingX: emblem.left - 8,
          }
        })
        expect(Math.abs(connection.startY - connection.emblemCenterY)).toBeLessThan(1)
        expect(Math.abs(connection.endY - connection.gridTop)).toBeLessThan(1)
        expect(Math.abs(connection.railX - connection.spineX)).toBeLessThan(1)
        expect(Math.abs(connection.lineEndX - connection.emblemRingX)).toBeLessThan(1)
        const rails = await page.locator('.visual-project').first().locator('.session-tile').evaluateAll(tiles => tiles.map(tile => {
          const bounds = tile.getBoundingClientRect()
          const border = parseFloat(getComputedStyle(tile).borderTopWidth)
          const horizontal = getComputedStyle(tile, '::before')
          const vertical = getComputedStyle(tile, '::after')
          return {
            center: bounds.top + bounds.height / 2,
            branch: bounds.top + border + parseFloat(horizontal.top),
            start: bounds.top + border + parseFloat(vertical.top),
            end: bounds.bottom - border - parseFloat(vertical.bottom),
          }
        }))
        for (const [index, rail] of rails.entries()) {
          expect(Math.abs(rail.branch - rail.center)).toBeLessThan(1)
          if (index < rails.length - 1) expect(Math.abs(rail.end - rails[index + 1].start)).toBeLessThan(1)
          else expect(Math.abs(rail.end - rail.center)).toBeLessThan(1)
        }
        await header.locator('button').click()
        await expect(header).toHaveAttribute('data-connected', 'false')
        expect(await header.evaluate(element => getComputedStyle(element, '::before').content)).toBe('none')
        await header.locator('button').click()
      }
      await page.mouse.move(0, 0)
      if (width === 390) await page.screenshot({ path: `artifacts/design-${design}-mobile.png`, fullPage: true })
      if (width === 390 && design === 'islands') await page.locator('.visual-project').first().screenshot({ path: 'artifacts/island-mobile-connector.png' })
      if (width === 390 && design === 'classic') await page.locator('.project-panel').first().screenshot({ path: 'artifacts/list-mobile-connectors.png' })
    }
  }
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  await expectStateBorders()
  await expectPillRadius()
  await page.screenshot({ path: 'artifacts/design-islands-light.png', fullPage: true })
  expect(errors).toEqual([])
})
