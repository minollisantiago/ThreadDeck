import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import type { Proposal } from '../shared/proposals'
import type { Snapshot } from '../shared/model'
import type { Schedule } from '../shared/schedules'

const projectId = '100000000000000010', secondProject = '100000000000000020', threadId = '100000000000000001'
const existingDraftKey = `threaddeck:chat-draft:v1:new:${projectId}`
test('proposal refresh actions expose thread-style tooltips on hover and keyboard focus', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 })
  await fixture(page)
  await page.locator('.chat-manager').getByRole('button', { name: 'Refresh proposals', exact: true }).hover()
  await expect(page.getByRole('tooltip')).toHaveText('Refresh proposals')
  await page.keyboard.press('Escape')
  await page.mouse.move(0, 0)
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await page.locator('.proposal-pane').getByRole('button', { name: 'Refresh proposals', exact: true }).focus()
  await expect(page.getByRole('tooltip')).toHaveText('Refresh proposals')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('tooltip')).toHaveCount(0)
})
function proposal(key: string, project = projectId): Proposal {
  return { id: randomUUID(), revision: randomUUID(), projectId: project, key, title: key === 'drafts' ? 'Keep drafts through reconnects' : 'Explain empty charts', summary: 'Make everyday work more reliable.', rationale: 'Inspect the current behavior before proposing a small improvement.', prompt: 'Investigate this opportunity and verify the evidence first.', kind: 'observed', effort: 'small', evidence: [{ label: 'Starting point', reference: 'src/chat/drafts.ts' }], status: 'inbox', createdAt: Date.now(), updatedAt: Date.now(), reviewedAt: Date.now(), snoozedUntil: null, decisionReason: '', session: null, launch: null }
}
async function fixture(page: Page, unknown = false, empty = false) {
  let proposals = empty ? [] : [proposal('drafts'), proposal('charts', secondProject)]
  const mutations: Record<string, unknown>[] = []
  const snapshot: Snapshot = { health: 'connected', checkedAt: Date.now(), lastSuccessAt: Date.now(), attentionAvailable: true, inventoryLimited: false, message: null, projects: [{ id: projectId, name: 'ThreadDeck', directory: '/fixture/threaddeck', sessions: [] }, { id: secondProject, name: 'BeautifulData', directory: '/fixture/data', sessions: [] }] }
  await page.route('**/api/events', route => route.abort())
  await page.route('**/api/snapshot', route => route.fulfill({ json: snapshot }))
  await page.route('**/api/chat/**', route => {
    const url = route.request().url()
    if (url.endsWith('/info')) return route.fulfill({ json: { protocol: 1, kimakiVersion: 'fixture', capabilities: ['project-catalog'], actor: 'local-operator' } })
    if (url.includes('/catalog')) return route.fulfill({ json: { entries: [] } })
    if (url.includes('/messages')) return route.fulfill({ json: { messages: [], cursor: '', before: null, stale: false } })
    if (url.includes('/changes')) return route.fulfill({ json: { cursor: '', resync: false, stale: false, changes: [] } })
    return route.fulfill({ status: 503, json: { error: 'Unavailable in fixture' } })
  })
  await page.route('**/api/proposals', route => {
    if (route.request().method() === 'POST') {
      const value = route.request().postDataJSON(); mutations.push(value)
      proposals = proposals.map(p => {
        if (p.id !== value.id) return p
        if (value.action === 'decide') return { ...p, revision: randomUUID(), status: value.status, snoozedUntil: value.snoozedUntil || null, decisionReason: value.reason }
        if (value.action === 'launch') return { ...p, revision: randomUUID(), launch: { id: value.requestId, proposalId: p.id, prompt: value.prompt, approach: value.approach, createdAt: Date.now(), resolvedAt: null, receipt: { id: value.requestId, state: unknown ? 'unknown' : 'accepted', messageIds: [], updatedAt: Date.now() } } }
        if (value.action === 'reconcile') return { ...p, revision: randomUUID(), status: 'progress', session: { id: 'ses_created', threadId }, launch: { ...p.launch!, receipt: { id: value.requestId, state: 'submitted', messageIds: [], updatedAt: Date.now(), sessionId: 'ses_created', threadId } } }
        return p
      })
    }
    return route.fulfill({ json: { proposals, reviewedAt: empty ? null : Date.now() } })
  })
  await page.addInitScript(() => localStorage.setItem('threaddeck:appearance', JSON.stringify('dark')))
  await page.goto('/')
  await page.getByRole('button', { name: 'Proposals', exact: true }).click()
  return { mutations, get: () => proposals }
}
for (const width of [430, 1600]) test(`proposal tab reuses project tree, search and persistent status filters at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1100 })
  const { mutations } = await fixture(page)
  await expect(page.getByRole('button', { name: 'Toggle proposals for ThreadDeck' })).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search projects or proposals' }).fill('BeautifulData')
  await expect(page.getByRole('button', { name: 'Toggle proposals for ThreadDeck' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Clear search' }).click()
  await page.locator('.chat-manager').getByRole('button', { name: 'Keep drafts through reconnects', exact: true }).click()
  await expect(page.locator('.proposal-instruction')).toHaveText('Investigate this opportunity and verify the evidence first.')
  await page.screenshot({ path: `artifacts/proposals-implementation-${width}.png` })
  await page.getByRole('textbox', { name: 'Decision note' }).fill('After the release')
  await page.getByRole('button', { name: 'Snooze for 24 hours', exact: true }).click()
  await expect(page.locator('.proposal-state-note')).toContainText('Snoozed until')
  expect(mutations[0]).toMatchObject({ action: 'decide', status: 'snoozed', reason: 'After the release' })
  await page.reload()
  await page.getByRole('button', { name: 'Proposals', exact: true }).click()
  await page.getByRole('button', { name: 'Snoozed', exact: true }).click()
  await page.locator('.chat-manager').getByRole('button', { name: 'Keep drafts through reconnects', exact: true }).click()
  await page.getByRole('button', { name: 'Return to inbox', exact: true }).click()
  await page.getByRole('button', { name: 'Dismiss', exact: true }).click()
  await expect(page.locator('.proposal-state-note')).toContainText('Dismissed')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
test('launch confirms an edited prompt, reconciles once and opens the linked session without changing project drafts', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 })
  const { mutations, get } = await fixture(page)
  await page.evaluate(key => localStorage.setItem(key, JSON.stringify({ text: 'An unrelated unsent prompt', anchor: 0, head: 0, revision: 'existing', files: [] })), existingDraftKey)
  await page.getByRole('button', { name: 'Start session', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Start from this proposal' })
  await dialog.getByRole('combobox', { name: 'Approach' }).selectOption('investigate')
  await dialog.getByRole('textbox', { name: 'Initial prompt' }).fill('Check draft recovery. Report findings only.')
  await dialog.getByRole('button', { name: 'Start session', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Open session', exact: true })).toBeVisible()
  expect(mutations.filter(m => m.action === 'launch')).toHaveLength(1)
  expect(mutations[0]).toMatchObject({ prompt: 'Check draft recovery. Report findings only.', approach: 'investigate' })
  expect(get()[0].status).toBe('progress')
  await page.getByRole('button', { name: 'Open session', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Threads', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(JSON.parse((await page.evaluate(key => localStorage.getItem(key), existingDraftKey))!).text).toBe('An unrelated unsent prompt')
  await page.getByRole('button', { name: 'Proposals', exact: true }).click()
  await page.getByRole('button', { name: 'In progress', exact: true }).click()
  await page.getByRole('button', { name: 'Mark done', exact: true }).click()
  await expect(page.locator('.proposal-state-note')).toContainText('Marked done by you')
})
test('uncertain launch survives reload and never offers a second start before reconciliation', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 })
  const { mutations } = await fixture(page, true)
  await page.getByRole('button', { name: 'Start session', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Start session', exact: true }).click()
  await expect(page.locator('.proposal-delivery')).toContainText('unknown')
  await expect(page.getByRole('button', { name: 'Start session', exact: true })).toBeDisabled()
  await page.reload()
  await page.getByRole('button', { name: 'Proposals', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Start session', exact: true })).toBeDisabled()
  expect(mutations.filter(m => m.action === 'launch')).toHaveLength(1)
  await page.getByRole('button', { name: 'Check delivery status', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Open session', exact: true })).toBeVisible()
  expect(mutations.filter(m => m.action === 'launch')).toHaveLength(1)
})
test('failed refresh retains the last snapshot but disables launches until a successful refresh', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 })
  const { mutations } = await fixture(page)
  await expect(page.getByRole('button', { name: 'Start session', exact: true })).toBeEnabled()
  await page.route('**/api/proposals', route => route.fulfill({ status: 503, json: { error: 'Storage temporarily unavailable' } }))
  await page.locator('.proposal-pane').getByRole('button', { name: 'Refresh proposals' }).click()
  await expect(page.getByRole('button', { name: 'Start session', exact: true })).toBeDisabled()
  await expect(page.getByRole('heading', { name: 'Keep drafts through reconnects', exact: true })).toBeVisible()
  await expect(page.locator('.chat-manager .proposals-error[role=alert]')).toContainText('last successful snapshot')
  expect(mutations).toHaveLength(0)
})
test('empty inbox centers its copy and changes the approved character scene only on reopening', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1050 })
  await page.clock.install()
  await fixture(page, false, true)
  const character = page.locator('.proposal-character')
  await expect(page.getByRole('heading', { name: 'No proposals yet', exact: true })).toBeVisible()
  await expect(character).toHaveAttribute('data-scene', 'inspector')
  await page.clock.fastForward(24_000)
  await expect(character).toHaveAttribute('data-scene', 'inspector')
  for (const selector of ['.proposal-empty-state > h2', '.proposal-empty-state > p']) {
    await expect(page.locator(selector).first()).toHaveCSS('text-align', 'center')
  }
  const stage = await page.locator('.proposal-document').boundingBox(), heading = await page.locator('#proposal-empty-heading').boundingBox()
  expect(Math.abs(heading!.x + heading!.width / 2 - stage!.x - stage!.width / 2)).toBeLessThan(2)
  await page.clock.runFor(300)
  await page.locator('.proposal-character-art').evaluate(element => {
    for (const animation of element.getAnimations()) if (animation instanceof CSSAnimation && animation.animationName === 'proposal-scene-enter') animation.finish()
  })
  await page.screenshot({ path: 'artifacts/proposal-empty-implemented.png' })
  for (const scene of ['fishing', 'coffee', 'bugs', 'inspector']) {
    await page.getByRole('button', { name: 'Threads', exact: true }).click()
    await page.getByRole('button', { name: 'Proposals', exact: true }).click()
    await expect(character).toHaveAttribute('data-scene', scene)
    await page.clock.fastForward(12_000)
    await expect(character).toHaveAttribute('data-scene', scene)
  }
  await page.getByRole('button', { name: 'Pause character animation' }).click()
  await page.clock.fastForward(24_000)
  await expect(character).toHaveAttribute('data-scene', 'inspector')
  await expect(character).toHaveAttribute('data-paused', 'true')
})
test('empty inbox uses static artwork for reduced motion and fits mobile screens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await fixture(page, false, true)
  await page.locator('.chat-manager').getByRole('button', { name: 'Toggle session sidebar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'No proposals yet', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pause character animation' })).toHaveCount(0)
  expect(await page.locator('.proposal-character').evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
test('Scan projects opens the discovery routine without dispatching until its normal confirmation', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1050 })
  const task: Schedule = { id: 6, projectId, status: 'planned', kind: 'cron', expression: '0 12 * * *', timezone: 'UTC', nextRunAt: '2026-11-11T12:00:00Z', prompt: 'Daily proposal discovery\n\nRead routines/daily-proposal-discovery.md and follow its instructions.', preview: 'Daily proposal discovery', threadId: null, notifyOnly: false, agent: 'build', model: null, preRun: null, allowConcurrency: false, lastError: null, revision: 'a'.repeat(64), editable: true }
  const posts: unknown[] = []
  await page.route('**/api/schedules**', route => {
    if (route.request().method() === 'POST') posts.push(route.request().postDataJSON())
    return route.fulfill({ json: { schedules: [task], checkedAt: Date.now() } })
  })
  await fixture(page, false, true)
  await page.getByRole('button', { name: 'Scan details', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Scan details' })).toContainText('Implementation needs a separate approval')
  await page.getByRole('button', { name: 'Close scan details', exact: true }).click()
  await page.getByRole('button', { name: 'Scan projects', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Schedules', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('heading', { name: /^Daily proposal discovery/ })).toBeVisible()
  expect(posts).toHaveLength(0)
  await page.getByRole('button', { name: 'Run now', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Run this schedule now?' })).toBeVisible()
  expect(posts).toHaveLength(0)
})
test('a missing discovery routine is reported instead of starting a different schedule', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1050 })
  await page.route('**/api/schedules**', route => route.fulfill({ json: { schedules: [], checkedAt: Date.now() } }))
  await fixture(page, false, true)
  await page.getByRole('button', { name: 'Scan projects', exact: true }).click()
  await expect(page.locator('.proposal-empty-state [role=alert]')).toContainText('No proposal discovery routine was found')
  await expect(page.getByRole('button', { name: 'Proposals', exact: true })).toHaveAttribute('aria-pressed', 'true')
})
