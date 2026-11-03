const { test } = require('node:test')
const assert = require('node:assert/strict')
const { openDiscordLink } = require('../electron/discord.cjs')

const browser = 'https://discord.com/channels/123/456'
const desktop = 'discord://-/channels/123/456'
test('opens installed Discord without also opening the browser', async () => {
  const opened = []
  await openDiscordLink(browser, { app: { getApplicationNameForProtocol: () => 'Discord' }, shell: { openExternal: async url => opened.push(url) } })
  assert.deepEqual(opened, [desktop])
})
test('opens the browser when Discord is not installed', async () => {
  const opened = []
  await openDiscordLink(browser, { app: { getApplicationNameForProtocol: () => '' }, shell: { openExternal: async url => opened.push(url) } })
  assert.deepEqual(opened, [browser])
})
test('falls back when launching Discord fails', async () => {
  const opened = []
  await openDiscordLink(desktop, { app: { getApplicationNameForProtocol: () => 'Discord' }, shell: { openExternal: async url => { opened.push(url); if (url === desktop) throw new Error('Unavailable') } } })
  assert.deepEqual(opened, [desktop, browser])
})
test('falls back when protocol lookup fails and rejects unsafe links', async () => {
  const opened = []
  const dependencies = { app: { getApplicationNameForProtocol: () => { throw new Error('Unavailable') } }, shell: { openExternal: async url => opened.push(url) } }
  await openDiscordLink(browser, dependencies)
  await openDiscordLink('discord://settings', dependencies)
  await openDiscordLink('https://discord.com.evil.test/channels/123/456', dependencies)
  assert.deepEqual(opened, [browser])
})
