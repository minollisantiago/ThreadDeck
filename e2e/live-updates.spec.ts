import { expect, test } from '@playwright/test'

test('renders an SSE snapshot even when the polling endpoint is unavailable', async ({ page }) => {
  await page.route('**/api/snapshot', route => route.abort())
  await page.route('**/api/events', route => route.fulfill({
    contentType: 'text/event-stream',
    body: `event: snapshot\ndata: ${JSON.stringify({
      projects: [{ id: 'live', name: 'Live project', directory: '/live', sessions: [{
        id: 'ses_live', projectId: 'live', title: 'Pushed conversation', threadId: '1561737719133114458',
        guildId: '1526236793048141935', status: 'working', agentCount: 1, updatedAt: Date.now(),
      }] }],
      health: 'connected', checkedAt: Date.now(), lastSuccessAt: Date.now(),
      attentionAvailable: true, inventoryLimited: false, message: null,
    })}\n\n`,
  }))
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Pushed conversation', exact: true })).toBeVisible()
})
