import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { EventEmitter } from 'node:events'
const require = createRequire(import.meta.url)
const { externalLink, chatExternalLink, mobileBounds } = require('../electron/policy.cjs')
const { appId, taskbarDetails } = require('../electron/taskbar.cjs')
const { colors, parseAppearance } = require('../electron/appearance.cjs')
const { readWindowState, fitWindowBounds, saveWindowState } = require('../electron/window-state.cjs')
const { agentStatus } = require('../electron/agent-status.cjs')

const agent = (extra = {}) => ({ id: 'ses_a', projectId: 'project', threadId: 'thread', title: 'Test agent', status: 'idle', agentCount: 0, responseAt: 100, ...extra })
const snapshot = (sessions, extra = {}) => ({ health: 'connected', attentionAvailable: true, projects: [{ name: 'Project', sessions }], ...extra })

test('tray baselines startup and reconnect without replaying old responses or requests', () => {
  const model = agentStatus()
  assert.deepEqual(model.update(snapshot([agent()])), [])
  assert.equal(model.summary().unread.length, 1)
  model.update({ health: 'stale' })
  assert.deepEqual(model.update(snapshot([agent({ responseAt: 200, status: 'input' })])), [])
  assert.equal(model.summary().attention.length, 1)
  assert.deepEqual(model.update(snapshot([agent(), agent({ id: 'new', status: 'permission' })])), [])
})
test('tray notifies once for completed responses, never mere idle transitions or renames', () => {
  const model = agentStatus()
  model.update(snapshot([agent({ status: 'working', agentCount: 2 })]))
  assert.deepEqual(model.update(snapshot([agent()])), [])
  const next = snapshot([agent({ responseAt: 200 })])
  assert.equal(model.update(next)[0].kind, 'response')
  assert.deepEqual(model.update(next), [])
  assert.deepEqual(model.update(snapshot([agent({ responseAt: 200, title: 'Renamed' })])), [])
})
test('tray prioritizes requests and failures over responses and suppresses the focused thread', () => {
  for (const kind of ['input', 'permission', 'error']) {
    const model = agentStatus()
    model.update(snapshot([agent()]))
    const next = snapshot([agent({ status: kind, responseAt: 200 })])
    assert.equal(model.update(next)[0].kind, kind)
    assert.deepEqual(model.update(next), [])
    model.update(snapshot([agent()]))
    assert.deepEqual(model.update(next, 'ses_a'), [])
    assert.deepEqual(model.update(next), [])
  }
})
test('tray shares monotonic validated read receipts with the workspace', () => {
  const model = agentStatus()
  model.update(snapshot([agent()]))
  model.receipts({ 'project:thread': 200, bad: -1, invalid: '200', infinite: Infinity })
  model.receipts({ 'project:thread': 50 })
  assert.equal(model.summary().unread.length, 0)
  assert.deepEqual(model.update(snapshot([agent({ responseAt: 200 })])), [])
  assert.equal(model.update(snapshot([agent({ responseAt: 300 })]))[0].kind, 'response')
  model.update(snapshot([agent({ responseAt: 300, agentCount: 3, status: 'working' })]))
  assert.equal(model.summary().working, 3)
  assert.equal(model.summary().unread.length, 0)
})
test('unavailable attention inventory cannot announce an approval request', () => {
  const model = agentStatus()
  model.update(snapshot([agent()]))
  assert.deepEqual(model.update(snapshot([agent({ status: 'permission' })], { attentionAvailable: false })), [])
})
test('tray remembers response watermarks across work and does not mistake old responses for completions', () => {
  const model = agentStatus()
  model.update(snapshot([agent()]))
  model.update(snapshot([agent({ status: 'working', agentCount: 1, responseAt: undefined })]))
  assert.deepEqual(model.update(snapshot([agent()])), [])
  const startup = agentStatus()
  startup.update(snapshot([agent({ status: 'working', agentCount: 1, responseAt: undefined })], { checkedAt: 200 }))
  assert.deepEqual(startup.update(snapshot([agent()])), [])
  assert.equal(startup.update(snapshot([agent({ responseAt: 300 })]))[0].kind, 'response')
})

test('native tray groups notifications, navigates, persists settings, and stops polling on exit', async () => {
  const timers = new Map(), notices = [], saved = []
  let menu, tray, next = snapshot([agent()]), focused = false, hidden = false, quit = false
  class FakeTray extends EventEmitter {
    constructor() { super(); tray = this }
    setImage() {}
    setToolTip(value) { this.tooltip = value }
    setContextMenu(value) { menu = value }
    destroy() { this.destroyed = true }
  }
  class FakeNotification extends EventEmitter {
    static isSupported() { return true }
    constructor(options) { super(); this.options = options; notices.push(this) }
    show() {}
    close() { this.closed = true }
  }
  const module = { exports: {} }
  vm.runInNewContext(readFileSync(new URL('../electron/tray.cjs', import.meta.url), 'utf8'), {
    module, __dirname: '/desktop', Buffer, console, AbortController,
    require: name => name === 'electron' ? { Tray: FakeTray, Notification: FakeNotification, Menu: { buildFromTemplate: items => items }, nativeImage: { createFromPath: () => ({}), createFromBitmap: () => ({}) } }
      : name === 'node:fs' ? { readFileSync: () => '{}', writeFileSync: (_file, text) => saved.push(JSON.parse(text)) }
        : name === './agent-status.cjs' ? { agentStatus } : require(name),
    setTimeout: (fn, ms) => { const id = {}; timers.set(id, { fn, ms }); return id },
    clearTimeout: id => timers.delete(id),
    fetch: async () => ({ ok: true, json: async () => next }),
  })
  const opened = [], calls = []
  const controller = module.exports.trayController({
    app: { getPath: () => '/settings', quit: () => { quit = true } },
    window: { isMinimized: () => true, restore: () => calls.push('restore'), show: () => { hidden = false }, focus: () => calls.push('focus'), hide: () => { hidden = true }, isFocused: () => focused, isVisible: () => !hidden },
    origin: 'http://127.0.0.1:43127', openSession: id => opened.push(id),
  })
  const settle = () => new Promise(resolve => setImmediate(resolve))
  const poll = async () => {
    const [id, timer] = [...timers].find(([, timer]) => timer.ms === 3000)
    timers.delete(id); timer.fn(); await settle()
  }
  await settle()
  assert.equal(notices.length, 0)
  assert.match(tray.tooltip, /1 unread/)
  controller.receipts({ 'project:thread': 100 })
  assert.match(tray.tooltip, /0 unread/)
  next = snapshot([agent({ responseAt: 200 }), agent({ id: 'ses_b', threadId: 'b' })])
  await poll()
  assert.equal(notices[0].options.title, 'Project · Finished responding')
  notices[0].emit('click')
  assert.deepEqual(opened, ['ses_a'])
  assert.deepEqual(calls, ['restore', 'focus'])
  next = snapshot([agent({ status: 'input', responseAt: 200 }), agent({ id: 'ses_b', threadId: 'b', status: 'permission' })])
  await poll()
  assert.equal(notices[1].options.title, '2 agents have updates')
  menu.find(item => item.label?.startsWith('Close to tray')).click({ checked: true })
  assert.equal(controller.closeToTray(), true)
  assert.equal(saved.at(-1).closeToTray, true)
  controller.hide(); assert.equal(hidden, true)
  menu.find(item => item.label === 'Pause notifications').click({ checked: true })
  next = snapshot([agent({ responseAt: 300 })]); await poll()
  assert.equal(notices.length, 2)
  menu.find(item => item.label === 'Pause notifications').click({ checked: false })
  controller.viewing('ses_a'); focused = true; hidden = false
  next = snapshot([agent({ responseAt: 400 })]); await poll()
  assert.equal(notices.length, 2)
  menu.find(item => item.label === 'Quit ThreadDeck').click()
  assert.equal(quit, true)
  controller.stop()
  assert.equal(tray.destroyed, true)
  assert.equal(timers.size, 0)
  assert.ok(notices.every(notice => notice.closed))
})

test('window dimensions survive relaunch without turning the saved width into the minimum width', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'threaddeck-window-')), filename = path.join(directory, 'window-state.json')
  try {
    assert.equal(readWindowState(filename), null)
    const bounds = { x: 120, y: 60, width: 1380, height: 900 }
    saveWindowState(filename, bounds, true)
    assert.deepEqual(readWindowState(filename), { bounds, maximized: true })
    assert.deepEqual(fitWindowBounds(readWindowState(filename).bounds, { x: 0, y: 0, width: 1920, height: 1040 }), bounds)
    saveWindowState(filename, { ...bounds, width: 620 }, false)
    assert.equal(readWindowState(filename).bounds.width, 620)
    assert.equal(readWindowState(filename).maximized, false)
    writeFileSync(filename, 'corrupted JSON')
    assert.equal(readWindowState(filename), null)
    writeFileSync(filename, JSON.stringify({ version: 1, bounds: { ...bounds, width: -1 } }))
    assert.equal(readWindowState(filename), null)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
test('saved window bounds stay reachable after display removal or a smaller screen', () => {
  assert.deepEqual(fitWindowBounds({ x: 2400, y: 200, width: 1500, height: 1200 }, { x: 0, y: 0, width: 1280, height: 800 }), { x: 0, y: 0, width: 1280, height: 800 })
  assert.deepEqual(fitWindowBounds({ x: -1800, y: 20, width: 700, height: 900 }, { x: -1920, y: 0, width: 1920, height: 1040 }), { x: -1800, y: 20, width: 700, height: 900 })
  assert.deepEqual(fitWindowBounds({ x: 200, y: 20, width: 200, height: 200 }, { x: 0, y: 0, width: 360, height: 350 }), { x: 0, y: 0, width: 360, height: 350 })
})

test('startup appearance follows saved dashboard mode and falls back safely', () => {
  assert.equal(parseAppearance('"light"', 'dark'), 'light')
  assert.equal(parseAppearance('"dark"', 'light'), 'dark')
  for (const value of [null, 'null', '{}', '"system"', 'bad json']) assert.equal(parseAppearance(value, 'light'), 'light')
  assert.equal(colors.light, '#f4f3f6')
  assert.equal(colors.dark, '#101014')
})

test('taskbar icon and relaunch metadata share the shortcut app identity', () => {
  const details = taskbarDetails('C:\\Apps\\Thread Deck\\runtime', 43127, { exists: () => true, windowsDirectory: 'C:\\Windows' })
  assert.equal(details.appId, appId)
  assert.equal(details.appIconPath, 'C:\\Apps\\Thread Deck\\runtime\\ThreadDeck.ico')
  assert.equal(details.relaunchDisplayName, 'ThreadDeck')
  assert.equal(details.relaunchCommand, '"C:\\Windows\\System32\\wscript.exe" "C:\\Apps\\Thread Deck\\launch.vbs"')
  const fallback = taskbarDetails('C:\\Apps\\runtime', 43127, { exists: () => false, executable: 'C:\\Apps\\runtime\\electron.exe' })
  assert.ok(fallback.relaunchCommand.includes('main.cjs'))
  assert.ok(!fallback.relaunchCommand.includes('supervisor-lease'))
})

test('Windows app icon includes small and high-DPI versions of the favicon', () => {
  const icon = readFileSync(new URL('../electron/ThreadDeck.ico', import.meta.url))
  assert.equal(icon.readUInt16LE(2), 1)
  assert.equal(icon.readUInt16LE(4), 7)
  assert.deepEqual(Array.from({ length: 7 }, (_, index) => icon[6 + index * 16] || 256), [16, 24, 32, 48, 64, 128, 256])
})

test('narrow default fills available height without covering the taskbar', () => {
  assert.deepEqual(mobileBounds({ x: -1920, y: 20, width: 1920, height: 1040 }), { x: -1920, y: 20, width: 430, height: 1040 })
  assert.equal(mobileBounds({ x: 0, y: 0, width: 360, height: 800 }).width, 360)
})
test('only Discord thread links can leave the desktop shell', () => {
  for (const url of ['https://discord.com/channels/123/456', 'discord://-/channels/123/456']) assert.equal(externalLink(url), true)
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'https://discord.com.evil.test/channels/123', 'https://example.com', 'http://discord.com/channels/123', 'discord://settings', 'not a URL']) assert.equal(externalLink(url), false, url)
})
test('explicit chat links open only credential-free HTTPS in the external browser', () => {
  for (const url of ['https://github.com/example/project', 'https://opencode.ai/v2/docs/']) assert.equal(chatExternalLink(url), true)
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'http://localhost', 'https://user:secret@example.com', 'discord://settings', 'not a URL']) assert.equal(chatExternalLink(url), false)
})
