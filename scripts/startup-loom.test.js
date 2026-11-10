// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const script = readFileSync(path.resolve('electron/startup-loom.js'), 'utf8')
const html = readFileSync(path.resolve('electron/startup.html'), 'utf8')
let gl, frames, motion, canvas
beforeEach(() => {
  document.body.innerHTML = html.match(/<body>([\s\S]*)<\/body>/)[1]
  document.documentElement.dataset.appearance = 'dark'
  for (const [name, value] of Object.entries({ ground: '#101014', accent: '#f77c9d', muted: '#a4a2b2' })) document.documentElement.style.setProperty(`--${name}`, value)
  canvas = document.getElementById('startup-loom')
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 38, width: 1280, height: 862 })
  motion = new EventTarget()
  motion.matches = false
  vi.stubGlobal('matchMedia', () => motion)
  frames = new Map()
  let next = 0
  vi.stubGlobal('requestAnimationFrame', callback => { frames.set(++next, callback); return next })
  vi.stubGlobal('cancelAnimationFrame', id => frames.delete(id))
  gl = Object.fromEntries(['shaderSource', 'compileShader', 'attachShader', 'linkProgram', 'useProgram', 'bindBuffer', 'bufferData', 'enableVertexAttribArray', 'vertexAttribPointer', 'uniform3fv', 'uniform2f', 'uniform1f', 'viewport', 'drawArrays', 'deleteShader', 'deleteProgram', 'deleteBuffer'].map(name => [name, vi.fn()]))
  for (const name of ['createProgram', 'createBuffer', 'createShader']) gl[name] = vi.fn(() => ({}))
  gl.getShaderParameter = vi.fn(() => true)
  gl.getProgramParameter = vi.fn(() => true)
  gl.getAttribLocation = vi.fn(() => 0)
  gl.getUniformLocation = vi.fn((_program, name) => name)
  vi.spyOn(canvas, 'getContext').mockReturnValue(gl)
})
afterEach(() => {
  window.dispatchEvent(new Event('pagehide'))
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.documentElement.removeAttribute('style')
})
function run() { new Function(script)() }
function tick(now) {
  const callbacks = [...frames.values()]
  frames.clear()
  for (const callback of callbacks) callback(now)
}

it('adds only decoration and reads the existing application theme', () => {
  const shell = document.querySelector('.startup-shell').outerHTML
  run()
  expect(document.querySelector('.startup-shell').outerHTML).toBe(shell)
  expect(canvas.getAttribute('aria-hidden')).toBe('true')
  expect(gl.uniform3fv).toHaveBeenCalledWith('accent', [247 / 255, 124 / 255, 157 / 255])
  expect(gl.uniform3fv).toHaveBeenCalledWith('ground', [16 / 255, 16 / 255, 20 / 255])
  expect(canvas.width).toBeLessThanOrEqual(1600)
  expect(canvas.height).toBeLessThanOrEqual(1200)
  expect(frames.size).toBe(1)
})

it('responds to pointer movement and hold without capturing startup controls', () => {
  run(); tick(0)
  window.dispatchEvent(new MouseEvent('pointermove', { clientX: 1100, clientY: 200 }))
  document.querySelector('main').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
  tick(100)
  expect(gl.uniform1f).toHaveBeenLastCalledWith('hold', expect.any(Number))
  expect(gl.uniform1f.mock.calls.filter(([name]) => name === 'hold').at(-1)[1]).toBeGreaterThan(0)
  expect(gl.uniform2f.mock.calls.filter(([name]) => name === 'mouse').at(-1)[1]).toBeGreaterThan(.5)
  window.dispatchEvent(new Event('pointerup'))
  tick(200)
  const released = gl.uniform1f.mock.calls.filter(([name]) => name === 'hold').at(-1)[1]
  document.querySelector('[data-control="close"]').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
  tick(300)
  expect(gl.uniform1f.mock.calls.filter(([name]) => name === 'hold').at(-1)[1]).toBeLessThan(released)
})

it('draws a static shader for reduced motion and reacts to preference changes', () => {
  motion.matches = true
  run()
  expect(gl.drawArrays).toHaveBeenCalled()
  expect(frames.size).toBe(0)
  motion.matches = false
  motion.dispatchEvent(new Event('change'))
  expect(frames.size).toBe(1)
  motion.matches = true
  motion.dispatchEvent(new Event('change'))
  expect(frames.size).toBe(0)
})

it('does no background work while hidden and resumes without a time jump', () => {
  run(); tick(100)
  const draws = gl.drawArrays.mock.calls.length
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
  document.dispatchEvent(new Event('visibilitychange'))
  window.dispatchEvent(new Event('resize'))
  expect(frames.size).toBe(0)
  expect(gl.drawArrays).toHaveBeenCalledTimes(draws)
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  document.dispatchEvent(new Event('visibilitychange'))
  tick(100000)
  expect(gl.uniform1f).toHaveBeenCalledWith('time', 18)
})

it('caps drawing at 30 fps', () => {
  run(); tick(0)
  gl.drawArrays.mockClear()
  tick(16); tick(32)
  expect(gl.drawArrays).not.toHaveBeenCalled()
  tick(34)
  expect(gl.drawArrays).toHaveBeenCalledTimes(1)
})

it.each(['unavailable', 'throws', 'compile', 'link', 'buffer'])('keeps startup usable when WebGL fails: %s', failure => {
  if (failure === 'unavailable') canvas.getContext.mockReturnValue(null)
  if (failure === 'throws') canvas.getContext.mockImplementation(() => { throw new Error('GPU unavailable') })
  if (failure === 'compile') gl.getShaderParameter.mockReturnValue(false)
  if (failure === 'link') gl.getProgramParameter.mockReturnValue(false)
  if (failure === 'buffer') gl.createBuffer.mockReturnValue(null)
  expect(run).not.toThrow()
  expect(document.getElementById('startup-loom')).toBeNull()
  expect(document.querySelectorAll('#stages li')).toHaveLength(3)
  expect(document.getElementById('retry')).not.toBeNull()
  expect(frames.size).toBe(0)
})

it.each(['pagehide', 'webglcontextlost'])('releases GPU resources and listeners on %s', event => {
  run()
  const target = event === 'pagehide' ? window : canvas
  target.dispatchEvent(new Event(event))
  expect(frames.size).toBe(0)
  expect(gl.deleteBuffer).toHaveBeenCalledTimes(1)
  expect(gl.deleteProgram).toHaveBeenCalledTimes(1)
  expect(gl.deleteShader).toHaveBeenCalledTimes(2)
  expect(canvas.isConnected).toBe(false)
  const draws = gl.drawArrays.mock.calls.length
  window.dispatchEvent(new Event('resize'))
  motion.dispatchEvent(new Event('change'))
  expect(gl.drawArrays).toHaveBeenCalledTimes(draws)
})

it('ships the external shader with the Windows launcher without relaxing CSP', () => {
  expect(html).toContain('<script src="startup-loom.js" defer></script>')
  expect(html).not.toContain("'unsafe-inline'")
  const launcher = readFileSync(path.resolve('scripts/desktop.mjs'), 'utf8')
  expect(launcher).toContain("copyFile(path.join(root, 'electron/startup-loom.js'), path.join(directory, 'startup-loom.js'))")
})
