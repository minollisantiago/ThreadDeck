// THROWAWAY: standalone fixture-only mock. Never starts a bot, server or agent.
import { build } from 'vite'
import { readFile, mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const output = await mkdtemp('/tmp/opencode/threaddeck-proposals-sidebar-')
await build({ root, mode: 'prototype', build: { outDir: output, rollupOptions: { input: path.join(root, 'src/chat/proposals-sidebar.prototype.html'), output: { inlineDynamicImports: true } } } })
let html = await readFile(path.join(output, 'src/chat/proposals-sidebar.prototype.html'), 'utf8')
for (const match of [...html.matchAll(/<script[^>]*src="([^"]+)"[^>]*><\/script>/g)]) {
  const js = await readFile(path.join(output, match[1]), 'utf8')
  html = html.replace(match[0], () => `<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>`)
}
for (const match of [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)]) {
  const font = await readFile(path.join(root, 'public/fonts/JetBrainsMono-Regular.woff2'))
  const css = (await readFile(path.join(output, match[1]), 'utf8')).replace(/url\([^)]*JetBrainsMono-Regular\.woff2[^)]*\)/g, `url(data:font/woff2;base64,${font.toString('base64')})`)
  html = html.replace(match[0], () => `<style>${css}</style>`)
}
const destination = path.join(root, 'artifacts/proposals-sidebar-prototype/ThreadDeck-project-proposals.html')
await mkdir(path.dirname(destination), { recursive: true })
await writeFile(destination, html)
console.log(`Standalone mock: ${destination}`)
