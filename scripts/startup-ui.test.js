// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'

const html = readFileSync(path.resolve('electron/startup.html'), 'utf8')
const script = readFileSync(path.resolve('electron/startup-ui.js'), 'utf8')
const stages = {
  wsl: { state: 'ready', detail: 'Linux is ready' },
  backend: { state: 'working', detail: 'Building your dashboard' },
  kimaki: { state: 'pending', detail: 'Waiting for the backend' },
}
let update
beforeEach(async () => {
  document.body.innerHTML = html.match(/<body>([\s\S]*)<\/body>/)[1]
  window.threaddeckDesktop = {
    onStartup: callback => { update = callback },
    startupState: async () => ({ stages }),
    control() {}, startupAction() {}, onMaximized() {},
  }
  new Function(script)()
  await Promise.resolve()
})

describe('drafting-frame startup screen', () => {
  it('counts real ready services and preserves accessible stage statuses', () => {
    expect(document.getElementById('ready-count').textContent).toBe('01 / 03 READY')
    expect(document.getElementById('ready-count').getAttribute('aria-label')).toBe('1 of 3 services ready')
    expect(document.querySelector('[data-phase="backend"] .sr-only').textContent).toBe('Starting')
    expect(document.querySelectorAll('.registration-corners span')).toHaveLength(4)
  })

  it('excludes hidden stages for client-only launches', () => {
    update({ stages: { wsl: { ...stages.wsl, hidden: true }, backend: { state: 'ready', detail: 'Ready' }, kimaki: { ...stages.kimaki, hidden: true } }, connecting: true })
    expect(document.getElementById('ready-count').textContent).toBe('01 / 01 READY')
    expect(document.querySelector('[data-phase="wsl"]').hidden).toBe(true)
    expect(document.getElementById('status').textContent).toBe('Connecting your dashboard…')
  })

  it('keeps retry and log controls when startup fails', () => {
    update({ stages, error: 'Build failed' })
    expect(document.getElementById('error').hidden).toBe(false)
    expect(document.getElementById('error-message').textContent).toBe('Build failed')
    expect(document.getElementById('retry').textContent).toBe('Retry startup')
    expect(document.getElementById('logs').textContent).toBe('Open startup log')
  })
})
