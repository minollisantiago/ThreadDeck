const { contextBridge, ipcRenderer } = require('electron')
// Custom schemes do not reliably emit will-navigate. Cancel their default
// navigation in the isolated preload and let the main process validate handoffs.
function openLink(event) {
  if (event.button !== 0 && event.button !== 1) return
  const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
  if (!anchor) return
  const url = new URL(anchor.href)
  if (url.origin === location.origin) return
  event.preventDefault()
  ipcRenderer.send(anchor.hasAttribute('data-chat-external') ? 'open-chat-link' : 'open-discord', url.href)
}
window.addEventListener('click', openLink, true)
window.addEventListener('auxclick', openLink, true)
window.addEventListener('DOMContentLoaded', () => {
  if (location.protocol !== 'http:') return
  const syncAppearance = () => {
    const mode = document.documentElement.dataset.appearance
    if (mode === 'dark' || mode === 'light') ipcRenderer.send('appearance-changed', mode)
  }
  syncAppearance()
  new MutationObserver(syncAppearance).observe(document.documentElement, { attributes: true, attributeFilter: ['data-appearance'] })
})
contextBridge.exposeInMainWorld('threaddeckDesktop', {
  startupState: () => ipcRenderer.invoke('startup-state'),
  startupAction: action => { if (['retry', 'logs'].includes(action)) ipcRenderer.send('startup-action', action) },
  onStartup: callback => {
    const listener = (_event, state) => callback(state)
    ipcRenderer.on('startup-progress', listener)
    return () => ipcRenderer.removeListener('startup-progress', listener)
  },
  control: action => { if (['minimize', 'maximize', 'close'].includes(action)) ipcRenderer.send('window-control', action) },
  onMaximized: callback => {
    const listener = (_event, maximized) => callback(maximized)
    ipcRenderer.on('window-maximized', listener)
    return () => ipcRenderer.removeListener('window-maximized', listener)
  },
})
