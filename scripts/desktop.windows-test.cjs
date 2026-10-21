const { _electron: electron } = require(process.argv[2])
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs/promises')

async function main() {
  const log = message => { require('node:fs').appendFileSync(path.join(__dirname, 'test.log'), `${message}\n`); console.log(message) }
  log('Starting Windows driver')
  const directory = __dirname
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  // Keep synthetic fixtures and cleared preferences out of the real app profile.
  const entry = path.join(directory, 'test-main.cjs')
  await fs.writeFile(entry, `require('electron').app.setPath('userData', ${JSON.stringify(path.join(directory, 'test-profile'))}); require('./main.cjs')`)
  const app = await electron.launch({ executablePath: path.join(directory, 'electron.exe'), args: [entry, `--dashboard-port=${process.argv[3]}`, ...(process.argv[4] ? [`--launch-services=${process.argv[4]}`] : [])], env, timeout: 60_000 })
  log('Electron launched')
  try {
    const page = await app.firstWindow({ timeout: 20_000 })
    page.setDefaultTimeout(20_000)
    log('First window connected')
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    log(`URL: ${page.url()}`)
    if (process.argv[4]) {
      await page.waitForURL(url => url.protocol === 'file:' && url.pathname.endsWith('/startup.html'))
      await page.getByRole('heading', { name: 'ThreadDeck', exact: true }).waitFor()
      const typeSizes = await page.evaluate(() => Object.fromEntries(['.eyebrow', '.sequence-heading', '.stage-copy strong', '.stage-copy p', '#status', 'footer'].map(selector => [selector, parseFloat(getComputedStyle(document.querySelector(selector)).fontSize)])))
      assert.ok(Object.values(typeSizes).every(size => size >= 10))
      assert.equal(typeSizes['.stage-copy strong'], 12)
      assert.equal(typeSizes['.stage-copy p'], 11)
      assert.equal(await page.locator('.scan-band').evaluate(element => getComputedStyle(element).animationName), 'scan')
      await page.locator('#error').waitFor({ state: 'visible' })
      await page.screenshot({ path: path.join(directory, 'electron-windows-startup-error.png') })
      const narrowFrameWidth = await page.locator('.stages-frame').evaluate(element => element.getBoundingClientRect().width)
      await page.getByRole('button', { name: 'Maximize window', exact: true }).click()
      await page.getByRole('button', { name: 'Restore narrow window' }).waitFor()
      assert.equal(await page.locator('.startup-shell').evaluate(element => element.getBoundingClientRect().width), 430)
      assert.equal(await page.locator('.stages-frame').evaluate(element => element.getBoundingClientRect().width), narrowFrameWidth)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      await app.evaluate(({ shell }) => { shell.openPath = async file => { globalThis.startupLog = file; return '' } })
      await page.getByRole('button', { name: 'Open startup log' }).click()
      assert.ok((await app.evaluate(() => globalThis.startupLog)).endsWith('startup-test.log'))
      await page.getByRole('button', { name: 'Retry startup' }).click()
      await page.waitForFunction(() => document.getElementById('error').hidden)
      await page.waitForFunction(() => document.querySelector('[data-phase="backend"]').dataset.state === 'working')
      assert.equal(await page.locator('#ready-count').textContent(), '01 / 03 READY')
      assert.equal(await page.locator('.registration-corners span').count(), 4)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      await page.screenshot({ path: path.join(directory, 'electron-windows-startup-wide.png') })
      await page.getByRole('button', { name: 'Restore narrow window' }).click()
      await page.getByRole('button', { name: 'Maximize window', exact: true }).waitFor()
      await page.screenshot({ path: path.join(directory, 'electron-windows-startup.png') })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      assert.equal(await page.locator('.scan-band').evaluate(element => getComputedStyle(element).animationName), 'none')
      await page.emulateMedia({ reducedMotion: 'no-preference' })
    }
    await page.waitForURL(`http://127.0.0.1:${process.argv[3]}/`, { waitUntil: 'load', timeout: 30_000 })
    await page.waitForLoadState('domcontentloaded', { timeout: 20_000 })
    log('DOM ready')
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('threaddeck:appearance', '"dark"') })
    log('Preferences set')
    await page.reload()
    log(`Page loaded: ${await page.title()}`)
    await page.getByRole('link', { name: 'Native Windows desktop wrapper', exact: true }).waitFor()
    assert.equal(await page.evaluate(() => typeof window.require), 'undefined')
    assert.equal(await app.evaluate(({ app, nativeImage }) => nativeImage.createFromPath(`${app.getAppPath()}\\ThreadDeck.ico`).isEmpty()), false)
    const handle = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getNativeWindowHandle().readBigUInt64LE().toString())
    const taskbar = JSON.parse(require('node:child_process').execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(directory, 'windows-taskbar-probe.ps1'), '-WindowHandle', handle, '-RequireThreadDeck'], { encoding: 'utf8' }))
    assert.equal(taskbar.appId, 'ThreadDeck')
    assert.ok(taskbar.relaunchIcon.includes('ThreadDeck.ico'))
    assert.equal(taskbar.relaunchName, 'ThreadDeck')
    const bounds = await app.evaluate(({ BrowserWindow, screen }) => ({ bounds: BrowserWindow.getAllWindows()[0].getBounds(), area: screen.getPrimaryDisplay().workArea }))
    assert.equal(bounds.bounds.width, 430)
    assert.equal(bounds.bounds.height, bounds.area.height)
    const minimumWidth = await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]
      const minimum = window.getMinimumSize()[0]
      window.setSize(320, window.getBounds().height)
      return { minimum, actual: window.getBounds().width }
    })
    assert.deepEqual(minimumWidth, { minimum: 430, actual: 430 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    log('Initial window sizing passed')
    await page.screenshot({ path: path.join(directory, 'electron-windows-narrow-dark.png') })
    await page.getByRole('button', { name: 'Maximize window', exact: true }).click()
    await page.getByRole('button', { name: 'Restore narrow window' }).waitFor()
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized()), true)
    await page.screenshot({ path: path.join(directory, 'electron-windows-maximized.png') })
    await page.getByRole('button', { name: 'Restore narrow window' }).click()
    await page.getByRole('button', { name: 'Maximize window', exact: true }).waitFor()
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds().width), 430)
    await page.evaluate(() => localStorage.setItem('threaddeck:appearance', '"light"'))
    await page.reload()
    await page.waitForFunction(() => document.documentElement.dataset.appearance === 'light')
    await page.screenshot({ path: path.join(directory, 'electron-windows-narrow-light.png') })
    await page.getByRole('button', { name: 'Minimize window', exact: true }).click()
    // Window-manager transitions are asynchronous.
    for (let attempt = 0; attempt < 50; attempt++) {
      if (await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized())) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized()), true)
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].restore())
    await app.evaluate(({ shell }) => {
      globalThis.openedLinks = []
      shell.openExternal = async url => { globalThis.openedLinks.push(url) }
    })
    await page.getByRole('link', { name: 'Native Windows desktop wrapper', exact: true }).click()
    await page.getByRole('link', { name: 'Open Native Windows desktop wrapper in browser', exact: true }).click()
    const links = await app.evaluate(() => globalThis.openedLinks)
    assert.equal(links.length, 2)
    assert.ok(links[0].startsWith('discord://-/channels/'))
    assert.ok(links[1].startsWith('https://discord.com/channels/'))
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1)
    assert.deepEqual(errors, [])
    await page.getByRole('button', { name: 'Close window', exact: true }).click()
    console.log('Windows Electron sizing, maximize/restore, minimize, themes, isolation and close passed.')
  } finally { await app.close().catch(() => {}) }
  if (process.argv[4]) {
    // Reopen the same profile: the loader must read the actual dashboard's saved
    // light preference without a running backend, not rely on file localStorage.
    const lightApp = await electron.launch({ executablePath: path.join(directory, 'electron.exe'), args: [entry, `--launch-services=${process.argv[4]}`], env, timeout: 60_000 })
    try {
      const splash = await lightApp.firstWindow()
      await splash.waitForURL(url => url.protocol === 'file:' && url.pathname.endsWith('/startup.html'))
      assert.equal(await splash.locator('html').getAttribute('data-appearance'), 'light')
      assert.equal(await splash.locator('body').evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(244, 243, 246)')
      assert.match(await lightApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBackgroundColor()), /f4f3f6/i)
      await splash.waitForFunction(() => document.querySelector('[data-phase="backend"]')?.dataset.state === 'working')
      await splash.screenshot({ path: path.join(directory, 'electron-windows-startup-light.png') })
      await splash.waitForURL(`http://127.0.0.1:${process.argv[3]}/`, { waitUntil: 'load', timeout: 30_000 })
      await splash.evaluate(() => localStorage.setItem('threaddeck:appearance', '"dark"'))
      await splash.reload()
      await splash.waitForFunction(() => document.documentElement.dataset.appearance === 'dark')
      await splash.getByRole('button', { name: 'Close window', exact: true }).click()
    } finally { await lightApp.close().catch(() => {}) }
    const cancelEntry = path.join(directory, 'test-startup-cancel.cjs')
    await fs.writeFile(cancelEntry, `require('electron').app.setPath('userData', ${JSON.stringify(path.join(directory, 'test-profile'))}); require('./main.cjs')`)
    const cancelApp = await electron.launch({ executablePath: path.join(directory, 'electron.exe'), args: [cancelEntry, `--launch-services=${process.argv[4]}`], env, timeout: 60_000 })
    try {
      const splash = await cancelApp.firstWindow()
      await splash.waitForURL(url => url.protocol === 'file:' && url.pathname.endsWith('/startup.html'))
      assert.equal(await splash.locator('html').getAttribute('data-appearance'), 'dark')
      assert.equal(await splash.locator('body').evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(16, 16, 20)')
      await splash.waitForFunction(() => document.querySelector('[data-phase="backend"]')?.dataset.state === 'working')
      await splash.screenshot({ path: path.join(directory, 'electron-windows-startup-dark.png') })
      await splash.getByRole('button', { name: 'Close window', exact: true }).click()
    } finally { await cancelApp.close().catch(() => {}) }
    console.log('Closing the client during startup cancels its owned WSL attempt.')
    console.log('Saved light/dark appearance persists into the next native loading screen before WSL readiness.')
  }
  // Verify the cross-OS lease contract: removing the lease quits the native app.
  const supervisedEntry = path.join(directory, 'test-supervised.cjs')
  await fs.writeFile(supervisedEntry, `require('electron').app.setPath('userData', ${JSON.stringify(path.join(directory, 'supervised-test-profile'))}); require('./main.cjs')`)
  const lease = path.join(directory, 'test-supervisor.lease')
  await fs.writeFile(lease, '')
  const child = require('node:child_process').spawn(path.join(directory, 'electron.exe'), [supervisedEntry, `--dashboard-port=${process.argv[3]}`, `--supervisor-lease=${lease}`], { cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.pipe(process.stdout)
  child.stderr.pipe(process.stderr)
  const exited = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve) })
  await new Promise(resolve => setTimeout(resolve, 2000))
  assert.equal(child.exitCode, null)
  await fs.unlink(lease)
  const timeout = setTimeout(() => child.kill(), 10_000)
  try { assert.equal(await exited, 0) } finally { clearTimeout(timeout) }
  console.log('Native supervisor lease shutdown passed.')
}
main().catch(error => { require('node:fs').appendFileSync(path.join(__dirname, 'test.log'), `${error.stack}\n`); console.error(error); process.exitCode = 1 })
