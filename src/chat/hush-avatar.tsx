// The approved Hush silhouette: one ink, transparent eye/beak cutouts, and pupils.
// Inherit the chat avatar's theme color rather than the study's fixed blue.
export function HushAvatar() {
  return <svg viewBox="0 0 80 80" aria-hidden="true" focusable="false" className="chat-hush-avatar">
    <path fill="currentColor" fillRule="evenodd" d="M8 68C18 62 17 43 22 31Q20 21 23 15Q25 13 33 19Q40 15 47 19Q55 13 57 15Q60 21 58 31C63 43 62 62 72 68Q40 77 8 68Z
      M37 32a7 7 0 1 0-14 0a7 7 0 1 0 14 0Z
      M57 32a7 7 0 1 0-14 0a7 7 0 1 0 14 0Z
      M35 43Q40 41 45 43L41 50Q40 52 39 50Z" />
    <g fill="currentColor"><circle cx="31" cy="33" r="3" /><circle cx="49" cy="33" r="3" /></g>
  </svg>
}
