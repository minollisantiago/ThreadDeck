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
  const app = await electron.launch({ executablePath: path.join(directory, 'electron.exe'), args: [entry, `--dashboard-port=${process.argv[3]}`], env, timeout: 60_000 })
  log('Electron launched')
  try {
    const page = await app.firstWindow({ timeout: 20_000 })
    page.setDefaultTimeout(20_000)
    log('First window connected')
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    log(`URL: ${page.url()}`)
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
