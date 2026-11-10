import { useEffect, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { HushAvatar } from '../chat/hush-avatar'
import { TooltipHint } from '../components/ui/tooltip'
import './character.css'

const scenes = ['inspector', 'fishing', 'coffee', 'bugs'] as const
export const characterRotationMs = 12_000
function Owl({ sleeping = false }: { sleeping?: boolean }) {
  return <div className="proposal-owl"><HushAvatar />{sleeping && <svg className="proposal-owl-lids" viewBox="0 0 80 80"><circle cx="30" cy="32" r="8" /><circle cx="50" cy="32" r="8" /><path d="M24 32Q30 36 36 32M44 32Q50 36 56 32" /></svg>}</div>
}
function Bug() {
  return <g className="proposal-bug"><path d="M-5-3-5-7M5-3 5-7M-5 0-10-3M5 0 10-3M-5 5-10 8M5 5 10 8" /><ellipse rx="6" ry="8" /><path d="M0-6V6" /></g>
}

/** Decorative only: no scan state or backend activity is implied by these loops. */
export function ProposalCharacter() {
  const [index, setIndex] = useState(0), [paused, setPaused] = useState(false)
  const [reduced, setReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden')
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const changeMotion = () => setReduced(media?.matches ?? false)
    const changeVisibility = () => setVisible(document.visibilityState !== 'hidden')
    media?.addEventListener('change', changeMotion)
    document.addEventListener('visibilitychange', changeVisibility)
    return () => { media?.removeEventListener('change', changeMotion); document.removeEventListener('visibilitychange', changeVisibility) }
  }, [])
  const stopped = paused || reduced || !visible
  useEffect(() => {
    if (stopped) return
    const timer = setInterval(() => setIndex(value => (value + 1) % scenes.length), characterRotationMs)
    return () => clearInterval(timer)
  }, [stopped])
  const scene = scenes[index]
  return <div className="proposal-character" data-scene={scene} data-paused={stopped}>
    <div className="proposal-character-art" key={scene} aria-hidden="true">
      <svg className="proposal-scene-back" viewBox="0 0 400 250" focusable="false">
        <ellipse className="proposal-scene-shadow" cx="200" cy="216" rx="140" ry="10" /><path className="proposal-scene-ground" d="M34 216H366" />
        {scene === 'inspector' && <>
          <g className="proposal-folder"><path className="proposal-prop" d="M224 155V135H250L261 144H314V205H224Z" /><path className="proposal-prop" d="M214 156H323L313 205H224Z" /><path d="M244 180H291" /></g>
          <g className="proposal-sneaking-bug"><Bug /></g><g className="proposal-question"><text x="287" y="106">?</text></g>
        </>}
        {scene === 'fishing' && <>
          <path className="proposal-prop" d="M240 181H328L344 205V218H224V205Z" /><path d="M224 205H257L264 211H303L310 205H344" />
          <g className="proposal-sock"><path d="M277 142H296V161Q313 163 309 174Q306 181 292 174L279 168Z" /><path d="M278 149H295" /></g>
          <g className="proposal-ripples"><ellipse cx="283" cy="190" rx="20" ry="4" /><ellipse cx="283" cy="190" rx="30" ry="7" /></g>
        </>}
        {scene === 'coffee' && <>
          <path className="proposal-prop" d="M222 166H251V193Q237 201 222 193Z" /><path d="M251 170H259Q268 183 251 184" />
          <path className="proposal-steam" d="M229 154Q220 146 230 136Q240 126 230 120" /><path className="proposal-steam proposal-steam-second" d="M242 154Q233 146 243 136Q253 126 243 120" />
          <circle className="proposal-prop" cx="292" cy="76" r="24" /><path className="proposal-clock-hand" d="M292 76V59" /><path d="M292 76 303 82" /><circle cx="292" cy="76" r="2" />
          <text className="proposal-sleep-z" x="186" y="109">z</text><text className="proposal-sleep-z proposal-sleep-z-second" x="207" y="87">z</text><text className="proposal-sleep-z proposal-sleep-z-third" x="228" y="64">z</text>
        </>}
        {scene === 'bugs' && <><path d="M238 205H316M247 199H306" /><g className="proposal-dodging-bug"><Bug /></g><g className="proposal-miss"><path d="M297 103 308 95M300 114H314M293 92 296 80" /></g></>}
      </svg>
      <Owl sleeping={scene === 'coffee'} />
      <svg className="proposal-scene-front" viewBox="0 0 400 250" focusable="false">
        {scene === 'inspector' && <g className="proposal-magnifier"><path className="proposal-wing" d="M173 162Q191 172 200 151" /><circle className="proposal-lens" cx="218" cy="133" r="24" /><path className="proposal-glass-handle" d="M202 151 183 174" /><path d="M206 125Q212 115 222 120" /></g>}
        {scene === 'fishing' && <g className="proposal-rod"><path className="proposal-wing" d="M148 160 174 141" /><path className="proposal-rod-stick" d="M164 158 239 62" /><path className="proposal-fishing-line" d="M239 62Q277 85 284 139" /><circle className="proposal-bobber" cx="284" cy="144" r="5" /></g>}
        {scene === 'bugs' && <g className="proposal-net"><path className="proposal-wing" d="M167 162 194 151" /><path className="proposal-net-handle" d="M188 168 235 116" /><ellipse className="proposal-net-rim" cx="253" cy="97" rx="29" ry="22" transform="rotate(-24 253 97)" /><path className="proposal-net-mesh" d="M230 99 266 109M234 87 278 100M244 78 276 90M240 80 248 114M252 77 262 111M265 78 274 103" /></g>}
      </svg>
    </div>
    {!reduced && <TooltipHint label={paused ? 'Play character animation' : 'Pause character animation'}><button className="proposal-character-pause" type="button" aria-label={paused ? 'Play character animation' : 'Pause character animation'} aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? <Play size={12} /> : <Pause size={12} />}</button></TooltipHint>}
  </div>
}
