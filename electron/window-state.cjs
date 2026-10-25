const fs = require('node:fs')
const path = require('node:path')

function parseWindowState(value) {
  const bounds = value?.bounds
  if (value?.version !== 1 || !bounds || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(bounds[key])) || bounds.width < 1 || bounds.height < 1) return null
  return { bounds: Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, Math.round(bounds[key])])), maximized: value.maximized === true }
}
function readWindowState(filename) {
  try { return parseWindowState(JSON.parse(fs.readFileSync(filename, 'utf8'))) } catch { return null }
}
function fitWindowBounds(bounds, area) {
  const width = Math.min(area.width, Math.max(Math.min(430, area.width), bounds.width))
  const height = Math.min(area.height, Math.max(Math.min(400, area.height), bounds.height))
  return { x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)), y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)), width, height }
}
function saveWindowState(filename, bounds, maximized) {
  const state = parseWindowState({ version: 1, bounds, maximized })
  if (!state) throw new Error('Invalid window bounds')
  const temporary = `${filename}.${process.pid}.tmp`
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  try { fs.writeFileSync(temporary, JSON.stringify({ version: 1, ...state })); fs.renameSync(temporary, filename) }
  catch (error) { try { fs.unlinkSync(temporary) } catch { /* no partial file */ } throw error }
}
module.exports = { readWindowState, fitWindowBounds, saveWindowState }
