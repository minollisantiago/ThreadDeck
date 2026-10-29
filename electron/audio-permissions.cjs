// Only the trusted app's main frame may use the microphone. Never grant camera,
// preview-frame, file://, external-origin or unrelated permission requests.
function trusted(contents, expected, origin, requestingUrl, isMainFrame) {
  if (!contents || contents !== expected || !isMainFrame) return false
  try { return new URL(contents.getURL()).origin === origin && new URL(requestingUrl).origin === origin }
  catch { return false }
}
function installAudioPermissions(window, origin) {
  const session = window.webContents.session
  session.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(permission === 'media' && trusted(contents, window.webContents, origin, details.requestingUrl, details.isMainFrame)
      && details.mediaTypes?.length === 1 && details.mediaTypes[0] === 'audio')
  })
  session.setPermissionCheckHandler((contents, permission, requestingOrigin, details) => permission === 'media'
    && trusted(contents, window.webContents, origin, requestingOrigin, details.isMainFrame) && details.mediaType === 'audio')
}
module.exports = { installAudioPermissions }
