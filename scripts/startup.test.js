import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
const { serviceArguments } = createRequire(import.meta.url)('../electron/startup.cjs')
const config = { distro: 'Ubuntu-24.04', root: "/home/O'Brien/Thread Deck", node: '/usr/bin/node', nodePath: '/usr/bin:/bin', port: 43127 }

describe('native client service bootstrap', () => {
  it('launches only the service supervisor, with its client lease and captured environment', () => {
    const args = serviceArguments(config, '/mnt/c/Users/Some User/startup.lease')
    expect(args.slice(0, 7)).toEqual(['--distribution', 'Ubuntu-24.04', '--cd', config.root, '--exec', '/bin/sh', '-c'])
    expect(args[7]).toContain("THREADDECK_STARTUP_LEASE='/mnt/c/Users/Some User/startup.lease'")
    expect(args[7]).toContain("'/home/O'\\''Brien/Thread Deck/scripts/services.mjs'")
    expect(args[7]).toContain('PORT=43127')
    expect(args[7]).not.toContain('desktop.mjs')
  })
  it('rejects malformed startup settings', () => {
    expect(() => serviceArguments({ ...config, port: 0 }, '/lease')).toThrow('port')
    expect(() => serviceArguments({ ...config, root: 'bad\nroot' }, '/lease')).toThrow('configuration')
    expect(() => serviceArguments(config, '')).toThrow('configuration')
  })
})
