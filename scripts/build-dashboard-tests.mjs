import { build } from 'vite'
import path from 'node:path'
await build({ base: '/dashboard-fixture/', build: { outDir: 'artifacts/dashboard-fixture', emptyOutDir: false, rollupOptions: { input: path.resolve('e2e/dashboard-fixture.html') } } })
