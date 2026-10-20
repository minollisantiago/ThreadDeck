// Exercise the native Windows entry point with a deliberately slow, failing-once
// synthetic WSL service supervisor. No real Kimaki or dashboard is started.
process.argv.push('--startup')
await import('./desktop.e2e.mjs')
