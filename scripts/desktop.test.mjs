import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { externalLink, mobileBounds } = require('../electron/policy.cjs')

test('narrow default fills available height without covering the taskbar', () => {
  assert.deepEqual(mobileBounds({ x: -1920, y: 20, width: 1920, height: 1040 }), { x: -1920, y: 20, width: 430, height: 1040 })
  assert.equal(mobileBounds({ x: 0, y: 0, width: 360, height: 800 }).width, 360)
})
test('only Discord thread links can leave the desktop shell', () => {
  for (const url of ['https://discord.com/channels/123/456', 'discord://-/channels/123/456']) assert.equal(externalLink(url), true)
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'https://discord.com.evil.test/channels/123', 'https://example.com', 'http://discord.com/channels/123', 'discord://settings', 'not a URL']) assert.equal(externalLink(url), false, url)
})
