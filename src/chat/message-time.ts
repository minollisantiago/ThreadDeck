export function formatMessageTime(timestamp: string, now = new Date()) {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return 'Unknown time'
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const today = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
  if (today) return time
  const day = String(date.getDate()).padStart(2, '0'), month = String(date.getMonth() + 1).padStart(2, '0'), year = String(date.getFullYear()).slice(-2).padStart(2, '0')
  return `${day}/${month}/${year} · ${time}`
}
