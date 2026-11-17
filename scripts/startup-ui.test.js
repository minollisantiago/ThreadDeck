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
  summary: { state: 'pending', detail: 'Waiting for sessions' },
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
  it('counts completed startup tasks and preserves accessible stage statuses', () => {
    expect(document.getElementById('ready-count').textContent).toBe('01 / 04 COMPLETE')
    expect(document.getElementById('ready-count').getAttribute('aria-label')).toBe('1 of 4 startup tasks complete')
    expect(document.querySelector('[data-phase="backend"] .sr-only').textContent).toBe('Starting')
    expect(document.querySelectorAll('.registration-corners span')).toHaveLength(4)
  })

  it('excludes hidden stages for client-only launches', () => {
    update({ stages: { wsl: { ...stages.wsl, hidden: true }, backend: { state: 'ready', detail: 'Ready' }, kimaki: { ...stages.kimaki, hidden: true }, summary: { state: 'skipped', detail: 'No unseen activity to review' } }, connecting: true })
    expect(document.getElementById('ready-count').textContent).toBe('02 / 02 COMPLETE')
    expect(document.querySelector('[data-phase="wsl"]').hidden).toBe(true)
    expect(document.getElementById('status').textContent).toBe('Connecting your dashboard…')
  })

  it('shows summary preparation progress and treats optional failure as completed, not a startup error', () => {
    update({ stages: { ...stages, summary: { state: 'working', detail: 'Preparing review summary · 2/3 threads' } } })
    expect(document.querySelector('[data-phase="summary"] p').textContent).toBe('Preparing review summary · 2/3 threads')
    expect(document.querySelector('[data-phase="summary"] .sr-only').textContent).toBe('Preparing')
    update({ stages: { ...stages, summary: { state: 'failed', detail: 'Summary unavailable · retry in summary' } } })
    expect(document.getElementById('error').hidden).toBe(true)
    expect(document.getElementById('ready-count').textContent).toBe('02 / 04 COMPLETE')
    expect(document.querySelector('[data-phase="summary"] .sr-only').textContent).toBe('Unavailable; continuing startup')
  })

  it('keeps retry and log controls when startup fails', () => {
    update({ stages, error: 'Build failed' })
    expect(document.getElementById('error').hidden).toBe(false)
    expect(document.getElementById('error-message').textContent).toBe('Build failed')
    expect(document.getElementById('retry').textContent).toBe('Retry startup')
    expect(document.getElementById('logs').textContent).toBe('Open startup log')
  })
})
