import css from '../styles.css?raw'

// Keep one source for dashboard styling. A sidebar gets those existing mobile
// rules based on its own container, not the width of the entire chat workspace.
export const mobileManagerStyle = (() => {
  const blocks: string[] = []
  for (const match of css.matchAll(/@media\s*\(max-width:\s*(\d+)px\)\s*\{/g)) {
    let depth = 1, end = match.index! + match[0].length
    const start = end
    while (depth && end < css.length) { if (css[end] === '{') depth++; if (css[end] === '}') depth--; end++ }
    blocks.push(`@container threaddeck-manager (${Number(match[1]) >= 600 ? 'min-width:0px' : `max-width:${match[1]}px`}) {${css.slice(start, end - 1).replace(/(\d+)vw/g, '$1cqw')}}`)
  }
  return blocks.join('\n')
})()
