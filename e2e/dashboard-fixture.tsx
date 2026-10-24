// Test-only component entry. Preserves standalone wide/narrow dashboard regression
// checks; the production entry and Stream workspace have their own browser tests.
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Dashboard } from '../src/App'
import { useSnapshot } from '../src/hooks/use-snapshot'
import '../src/styles.css'
function Fixture() {
  const { snapshot, transportError } = useSnapshot(), [now, setNow] = useState(Date.now)
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  return <Dashboard snapshot={snapshot} transportError={transportError} now={now} />
}
createRoot(document.getElementById('root')!).render(<Fixture />)
