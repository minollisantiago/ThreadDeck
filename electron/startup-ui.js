const desktop = window.threaddeckDesktop
function render(state) {
  for (const [phase, value] of Object.entries(state.stages)) {
    const row = document.querySelector(`[data-phase="${phase}"]`)
    row.hidden = value.hidden === true
    row.dataset.state = value.state
    row.querySelector('p').textContent = value.detail
    row.querySelector('.sr-only').textContent = { pending: 'Waiting', working: 'Starting', ready: 'Ready' }[value.state]
  }
  const visible = Object.values(state.stages).filter(stage => !stage.hidden)
  const ready = visible.filter(stage => stage.state === 'ready').length
  const count = document.getElementById('ready-count')
  count.textContent = `${String(ready).padStart(2, '0')} / ${String(visible.length).padStart(2, '0')} READY`
  count.setAttribute('aria-label', `${ready} of ${visible.length} services ready`)
  document.getElementById('status').textContent = state.error ? 'Startup paused. Your existing services are safe.' : state.connecting ? 'Connecting your dashboard…' : 'Your workspace will open automatically.'
  document.getElementById('error').hidden = !state.error
  document.getElementById('error-message').textContent = state.error ?? ''
  document.getElementById('intro').textContent = state.error ? 'Your workspace could not start.' : 'Getting your workspace ready.'
}
for (const button of document.querySelectorAll('[data-control]')) button.addEventListener('click', () => desktop.control(button.dataset.control))
document.getElementById('retry').addEventListener('click', () => desktop.startupAction('retry'))
document.getElementById('logs').addEventListener('click', () => desktop.startupAction('logs'))
desktop.onStartup(render)
desktop.startupState().then(render)
desktop.onMaximized(maximized => {
  const button = document.querySelector('[data-control="maximize"]')
  button.setAttribute('aria-label', maximized ? 'Restore narrow window' : 'Maximize window')
  button.textContent = maximized ? '▣' : '□'
})
