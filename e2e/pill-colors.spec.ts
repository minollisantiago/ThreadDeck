import { mkdir } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { Session, Snapshot } from '../shared/model'

test('light pills have richer fills and readable text across every accent palette', async ({ page }) => {
  const now = Date.now()
  const statuses: Session['status'][] = ['working', 'permission', 'error', 'idle', 'idle']
  const snapshot: Snapshot = {
    health: 'connected', checkedAt: now, lastSuccessAt: now, attentionAvailable: true, inventoryLimited: false, message: null,
    projects: [{ id: 'example', name: 'Example project', directory: '/example', sessions: statuses.map((status, index) => ({
      id: `${index}`, projectId: 'example', title: ['Implement the feature', 'Approve the next step', 'Review the failed task', 'Previous conversation', 'New reply waiting for you'][index],
      guildId: null, threadId: `${index}`, status, agentCount: status === 'working' ? 1 : 0, updatedAt: now,
      responseAt: index === 4 ? now : null,
    })) }],
  }
  await page.route('**/api/snapshot', route => route.fulfill({ json: { ...snapshot, lastSuccessAt: Date.now() } }))
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('button', { name: 'All sessions', exact: true }).click()
  const working = page.locator('.session-row .status-working').first()
  const dark = await working.evaluate(element => ({ color: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor }))
  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  await expect(working).toHaveCSS('background-color', 'rgb(214, 245, 227)')

  for (const [palette, ink] of [['pink', '#9d174d'], ['lavender', '#5b21b6'], ['blue', '#075985'], ['green', '#166534'], ['peach', '#9a3412']]) {
    await page.getByRole('button', { name: `${palette} accent`, exact: true }).click()
    const expectedInk = await page.evaluate(color => {
      const element = document.createElement('span')
      element.style.color = color; document.body.append(element)
      const result = getComputedStyle(element).color; element.remove()
      return result
    }, ink)
    await expect(page.locator('.project-unread')).toHaveCSS('color', expectedInk)
    const pills = await page.locator('.overview-pill, .project-total, .project-attention, .project-unread, .status').evaluateAll(elements => {
      const context = document.createElement('canvas').getContext('2d')!
      const rgb = (color: string) => {
        context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1)
        return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3)
      }
      const luminance = (color: number[]) => color.map(value => {
        const channel = value / 255
        return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4
      }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0)
      return elements.map(element => {
        const style = getComputedStyle(element)
        const foreground = luminance(rgb(style.color)), background = luminance(rgb(style.backgroundColor))
        return { name: element.className, radius: style.borderRadius, contrast: (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05) }
      })
    })
    for (const pill of pills) {
      expect(pill.contrast, `${palette}: ${pill.name}`).toBeGreaterThanOrEqual(4.5)
      expect(pill.radius, `${palette}: ${pill.name}`).toBe('10px')
    }
  }
  await page.getByRole('button', { name: 'pink accent', exact: true }).click()
  await page.getByRole('button', { name: 'By state', exact: true }).click()
  await expect(page.locator('.session-project').first()).toHaveCSS('border-radius', '10px')
  await expect(page.locator('.state-heading .project-total').first()).toHaveCSS('border-radius', '10px')
  await page.getByRole('button', { name: 'By project', exact: true }).click()
  await page.evaluate(() => document.fonts.ready)
  await mkdir('artifacts', { recursive: true })
  await page.screenshot({ path: 'artifacts/pill-colors-light-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'artifacts/pill-colors-light-mobile.png', fullPage: true })
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.getByRole('button', { name: 'Switch to dark mode' }).click()
  await expect(working).toHaveCSS('color', dark.color)
  await expect(working).toHaveCSS('background-color', dark.background)
})
