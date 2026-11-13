// THROWAWAY: export a self-contained, fixture-only design study. No server or bot.
import { readFile, mkdir, writeFile } from 'node:fs/promises'
const root = new URL('../', import.meta.url)
let html = await readFile(new URL('src/chat/schedules.prototype.html', root), 'utf8')
const font = await readFile(new URL('public/fonts/JetBrainsMono-Regular.woff2', root))
html = html.replace('../../public/fonts/JetBrainsMono-Regular.woff2', `data:font/woff2;base64,${font.toString('base64')}`)
const directory = new URL('artifacts/schedules-prototype/', root)
await mkdir(directory, { recursive: true })
await writeFile(new URL('ThreadDeck-schedules.html', directory), html)
console.log(`Standalone HTML: ${new URL('ThreadDeck-schedules.html', directory).pathname}`)
