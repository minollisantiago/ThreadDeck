const { readFileSync, writeFileSync } = require('node:fs')
const { createHash } = require('node:crypto')
const path = require('node:path')

// Explorer caches icons by file path, even when the ICO contents change.
function appIcon(directory) {
  const source = readFileSync(path.join(directory, 'ThreadDeck.ico'))
  const revision = createHash('sha256').update(source).digest('hex').slice(0, 16)
  const filename = path.join(directory, `ThreadDeck-${revision}.ico`)
  try { writeFileSync(filename, source, { flag: 'wx' }) }
  catch (error) { if (error.code !== 'EEXIST') throw error }
  return filename
}

module.exports = { appIcon }
