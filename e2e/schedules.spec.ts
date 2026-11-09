import { expect, test, type Page } from '@playwright/test'
import type { Schedule } from '../shared/schedules'
import type { Snapshot } from '../shared/model'

const projectId = '100000000000000010'
const fixtureTask: Schedule = { id: 3, projectId, status: 'planned', kind: 'cron', expression: '0 12 * * 1', timezone: 'UTC', nextRunAt: '2027-01-04T12:00:00Z', prompt: 'Weekly backtests\n\nRead routines/daily-ng-backtests.md and follow all instructions. Summarize material changes and attach the report.', preview: 'Weekly backtests...', threadId: null, notifyOnly: false, agent: 'build', model: null, preRun: null, allowConcurrency: false, lastError: null, revision: 'a'.repeat(64), editable: true }
async function fixture(page: Page, unavailable = false, losePostResponse = false) {
  const mutations: Record<string, unknown>[] = []
  let tasks = [structuredClone(fixtureTask)], state = 'succeeded'
  await page.route('**/api/events', route => route.abort())
  const snapshot: Snapshot = { health: 'connected', checkedAt: Date.now(), lastSuccessAt: Date.now(), attentionAvailable: true, inventoryLimited: false, message: null, projects: [{ id: projectId, name: 'NaturalGas', directory: '/fixture/naturalgas', sessions: [] }] }
  await page.route('**/api/snapshot', route => route.fulfill({ json: snapshot }))
  await page.route('**/api/chat/**', route => route.fulfill({ status: 503, json: { error: 'Chat deliberately unavailable in schedules fixture' } }))
  await page.route('**/api/schedules**', route => {
    if (route.request().method() === 'POST') {
      const input = route.request().postDataJSON(); mutations.push(input)
      if (input.action === 'edit') tasks = tasks.map(task => ({ ...task, ...input.changes, revision: 'b'.repeat(64) }))
      if (input.action === 'create') tasks.push({ ...fixtureTask, id: 4, prompt: input.prompt })
      if (input.action === 'delete') tasks = tasks.filter(task => task.id !== input.id)
      if (losePostResponse) return route.abort('failed')
      return route.fulfill({ status: 202, json: { id: input.requestId, action: input.action, state: 'accepted', updatedAt: Date.now() } })
    }
    if (route.request().url().includes('/operations/')) {
      const id = route.request().url().split('/').at(-1), input = mutations.find(mutation => mutation.requestId === id)
      if (!input) return route.fulfill({ status: 404, json: { error: 'Operation has not been accepted yet' } })
      return route.fulfill({ json: { id, action: input.action, state, updatedAt: Date.now(), ...(state === 'succeeded' && { result: { routineId: input.action === 'create' ? 4 : 3 } }) } })
    }
    return route.fulfill({ status: unavailable ? 503 : 200, json: unavailable ? { code: 'unsupported', error: 'Schedules need the updated local Kimaki bridge' } : { schedules: tasks, checkedAt: Date.now() } })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Schedules', exact: true }).click()
  return { mutations, setState(value: string) { state = value } }
}
for (const width of [430, 1600]) test(`project sidebar opens tasks and edits in a focused dialog at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1050 })
  const { mutations } = await fixture(page)
  await page.getByRole('button', { name: /^Weekly backtests/ }).click()
  await expect(page.locator('.schedule-instruction')).toHaveText(fixtureTask.prompt!)
  await expect(page.getByRole('heading', { name: /^Weekly backtests/ })).toBeVisible()
  await page.getByRole('button', { name: 'Edit schedule', exact: true }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Edit schedule' })
  await expect(dialog.getByRole('textbox', { name: 'Instruction' })).toHaveValue(fixtureTask.prompt!)
  await dialog.getByRole('textbox', { name: 'Instruction' }).fill('Updated full instruction\n\nSecond paragraph stays intact.')
  await dialog.getByRole('button', { name: 'Save changes' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('.schedule-instruction')).toHaveText('Updated full instruction\n\nSecond paragraph stays intact.')
  expect(mutations).toHaveLength(1)
  expect(mutations[0].changes).toEqual({ prompt: 'Updated full instruction\n\nSecond paragraph stays intact.' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
test('project add creates in the selected channel and delete requires confirmation', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1050 })
  const { mutations } = await fixture(page)
  await page.getByRole('button', { name: 'Add schedule in NaturalGas' }).click()
  const editor = page.getByRole('dialog', { name: 'New project schedule' })
  await expect(editor.getByRole('combobox', { name: 'Project', exact: true })).toHaveValue(projectId)
  await editor.getByRole('textbox', { name: 'Instruction' }).fill('New project instruction')
  await editor.getByRole('button', { name: 'Create schedule' }).click()
  await expect(editor).toHaveCount(0)
  expect(mutations[0]).toMatchObject({ action: 'create', projectId })
  await page.getByRole('button', { name: 'Delete schedule…' }).click()
  expect(mutations).toHaveLength(1)
  await page.getByRole('dialog', { name: 'Delete this schedule?' }).getByRole('button', { name: 'Delete schedule', exact: true }).click()
  await expect.poll(() => mutations.length).toBe(2)
})
test('unsupported bridges show a real error and do not allow mutations', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1050 })
  const { mutations } = await fixture(page, true)
  await expect(page.getByText('Schedules need the updated local Kimaki bridge').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'New schedule', exact: true })).toBeDisabled()
  await expect(page.getByText('No schedules yet', { exact: true })).toHaveCount(0)
  expect(mutations).toHaveLength(0)
})
test('a pending run stays locked across reload and is never reposted', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1050 })
  const fixtureState = await fixture(page); fixtureState.setState('running')
  await page.getByRole('button', { name: 'Run now', exact: true }).click()
  await page.getByRole('dialog', { name: 'Run this schedule now?' }).getByRole('button', { name: 'Run now', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Run this schedule now?' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Run now', exact: true })).toBeDisabled()
  await page.reload()
  await page.getByRole('button', { name: 'Schedules', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Run now', exact: true })).toBeDisabled()
  expect(fixtureState.mutations).toHaveLength(1)
})
test('a lost creation response resolves through its receipt without offering a duplicate save', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1050 })
  const { mutations } = await fixture(page, false, true)
  await page.getByRole('button', { name: 'Add schedule in NaturalGas' }).click()
  const dialog = page.getByRole('dialog', { name: 'New project schedule' })
  await dialog.getByRole('textbox', { name: 'Instruction' }).fill('Created despite a lost HTTP response')
  await dialog.getByRole('button', { name: 'Create schedule' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('.schedule-instruction')).toHaveText('Created despite a lost HTTP response')
  expect(mutations).toHaveLength(1)
  await expect(page.getByText('Schedule operation confirmed')).toBeVisible()
})
