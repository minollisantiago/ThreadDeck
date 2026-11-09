import { createHash, randomUUID } from 'node:crypto'
import { readFile, writeFile, stat, rename, unlink, access } from 'node:fs/promises'
import path from 'node:path'
import { NtExecutable, NtExecutableResource, Data, Resource } from 'resedit'

export function brandExecutable(source, icon) {
  // Electron's upstream signature cannot cover a locally modified executable.
  // Keep the downloaded original intact and emit a separate, unsigned app copy.
  const executable = NtExecutable.from(source, { ignoreCert: true })
  const resources = NtExecutableResource.from(executable)
  const images = Data.IconFile.from(icon).icons.map(item => item.data)
  const groups = Resource.IconGroupEntry.fromEntries(resources.entries)
  if (!groups.length) throw new Error('Electron executable has no icon group to replace')
  for (const group of groups) Resource.IconGroupEntry.replaceIconsForResource(resources.entries, group.id, group.lang, images)
  for (const version of Resource.VersionInfo.fromEntries(resources.entries)) {
    for (const language of version.getAvailableLanguages()) version.setStringValues(language, { FileDescription: 'ThreadDeck', ProductName: 'ThreadDeck', OriginalFilename: 'ThreadDeck.exe', InternalName: 'ThreadDeck' })
    version.outputToResourceEntries(resources.entries)
  }
  resources.outputResource(executable)
  return Buffer.from(executable.generate())
}

export async function brandedWindowsExecutable(directory) {
  const source = path.join(directory, 'electron.exe'), target = path.join(directory, 'ThreadDeck.exe')
  const icon = await readFile(path.join(directory, 'ThreadDeck.ico'))
  const original = await stat(source)
  const fingerprint = createHash('sha256').update(`v1:${original.size}:${original.mtimeMs}:`).update(icon).digest('hex')
  const stamp = path.join(directory, 'threaddeck-branding.sha256')
  try { if (await readFile(stamp, 'utf8') === fingerprint) { await access(target); return target } } catch { /* First install or changed icon. */ }
  const temporary = path.join(directory, `.ThreadDeck-${randomUUID()}.exe`)
  try {
    await writeFile(temporary, brandExecutable(await readFile(source), icon))
    await rename(temporary, target)
    await writeFile(stamp, fingerprint)
  } catch (error) {
    if (['EACCES', 'EPERM', 'EBUSY'].includes(error.code)) throw new Error('Close the ThreadDeck desktop app, then retry updating its executable icon.', { cause: error })
    throw error
  } finally { await unlink(temporary).catch(() => {}) }
  return target
}
