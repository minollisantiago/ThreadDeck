// THROWAWAY: three structures for non-preview attachments inside a fixture chat workspace.
// ?variant=A|B|C&case=reports|types|mixed|draft|edge|all&theme=dark|light&width=fit|430
// Screenshots use the existing image-preview component and thumbnail markup; not a redesign.
import { useEffect, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowLeft, ArrowRight, ArrowUp, Check, ChevronDown, Download, Eye, File, FileArchive, FileCode2, FileSpreadsheet, FileText, Hash, Image, Layers2, LoaderCircle, Maximize2, MoreHorizontal, Paperclip, RefreshCw, Search, Settings2, X } from 'lucide-react'
import { TooltipHint, TooltipProvider } from '../components/ui/tooltip'
import { Button } from '../components/ui/button'
import { ImagePreview } from './image-preview'
import '../styles.css'
import './workspace.css'
import './attachments.prototype.css'

const variants = ['A', 'B', 'C'] as const
type Variant = typeof variants[number]
const names = { A: 'Quiet rows', B: 'Shared file list', C: 'Compact strips' }
const descriptions = { A: 'One lightly outlined row per file. Clear separation, generous click targets.', B: 'One shared surface with aligned size and action columns. Best for report bundles.', C: 'Content-width strips that sit side by side when space allows. The densest option.' }
type Attachment = { id: string; name: string; size: string; kind?: 'html' | 'zip' | 'data' | 'text' | 'file'; state?: 'uploading' | 'failed' | 'unavailable'; staged?: boolean }
const reports: Attachment[] = [
  { id: 'r1', name: 'October_FOMC_Preview_-_Hiking_at_a_Slower_Pace.pdf', size: '577 KiB' },
  { id: 'r2', name: 'Global_Macro_Weekly_23_October_2026.pdf', size: '2.4 MiB' },
  { id: 'r3', name: 'Global_Markets_Daily_-_G3_Inflation_Pricing_Common_Shocks_Different_Paths.pdf', size: '535 KiB' },
  { id: 'r4', name: 'GS_Macro_cuRated_23Oct26.pdf', size: '1.9 MiB' },
]
const types: Attachment[] = [
  { id: 'html', name: 'interactive_market_dashboard.html', size: '92 KiB', kind: 'html' },
  { id: 'csv', name: 'inflation_forecast_2026.csv', size: '18 KiB', kind: 'data' },
  { id: 'zip', name: 'charts_and_source_data.zip', size: '8.6 MiB', kind: 'zip' },
  { id: 'json', name: 'threaddeck-settings.json', size: '2 KiB', kind: 'text' },
  { id: 'md', name: 'meeting-notes.md', size: '4 KiB', kind: 'text' },
  { id: 'video', name: 'screen-recording.mov', size: '9.1 MiB', kind: 'file' },
]
const draft: Attachment[] = [
  { id: 'ready', name: 'October_FOMC_Preview.pdf', size: '577 KiB', staged: true },
  { id: 'readyhtml', name: 'market_dashboard.html', size: '92 KiB', kind: 'html', staged: true },
  { id: 'upload', name: 'charts_and_source_data.zip', size: '8.6 MiB', kind: 'zip', state: 'uploading', staged: true },
  { id: 'failed', name: 'global_macro_forecast.csv', size: '18 KiB', kind: 'data', state: 'failed', staged: true },
  { id: 'stale', name: 'session_notes.txt', size: '4 KiB', kind: 'text', state: 'unavailable', staged: true },
]
const edges: Attachment[] = [
  { id: 'short', name: 'a.txt', size: '0 B', kind: 'text' },
  { id: 'unknown', name: 'export.bin', size: '—', kind: 'file' },
  { id: 'unicode', name: 'Prévisions_économiques_日本語_2026.xlsx', size: '1.2 MiB', kind: 'data' },
  { id: 'long', name: 'A_very_long_filename_with_no_spaces_that_must_never_push_the_download_button_off_the_screen_final_v12.pdf', size: '9.9 MiB' },
]
const cases = [ ['reports', 'Report bundle'], ['types', 'All file types'], ['mixed', 'Files + screenshots'], ['draft', 'Composer & upload states'], ['edge', 'Long names & edge cases'], ['all', 'All use cases'] ]
const chart = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="840" height="380" viewBox="0 0 840 380"><rect width="840" height="380" fill="#202027"/><text x="42" y="52" fill="#e6e6ef" font-family="monospace" font-size="20">Inflation outlook · October 2026</text><g stroke="#373741"><path d="M42 110H800M42 170H800M42 230H800M42 290H800"/></g><path d="M42 110L160 155L280 144L400 215L520 230L650 263L800 282" stroke="#ed8caa" fill="none" stroke-width="4"/><path d="M42 160L160 172L280 190L400 224L520 249L650 255L800 274" stroke="#b1a0e7" fill="none" stroke-width="3"/><text x="42" y="345" fill="#91909e" font-family="monospace" font-size="14">2023            2024            2025            2026</text></svg>')

function Action({ label, children, disabled = false, action }: { label: string; children: ReactNode; disabled?: boolean; action: () => void }) {
  return <TooltipHint label={label}><span className="attachment-action"><Button variant="ghost" size="icon" aria-label={label} disabled={disabled} onClick={action}>{children}</Button></span></TooltipHint>
}
function FileRow({ file, notify }: { file: Attachment; notify: (value: string) => void }) {
  const Icon = file.state === 'uploading' ? LoaderCircle : file.kind === 'html' ? FileCode2 : file.kind === 'zip' ? FileArchive : file.kind === 'data' ? FileSpreadsheet : file.kind === 'file' ? File : FileText
  return <div className="attachment-row" data-status={file.state || 'ready'}>
    <Icon className={`attachment-kind ${file.state === 'uploading' ? 'spinning' : ''}`} size={17} aria-hidden="true" />
    <TooltipHint label={file.name}><span className="attachment-filename" tabIndex={0}>{file.name}</span></TooltipHint>
    <span className="attachment-weight">{file.size}</span>
    <div className="attachment-actions">
      {file.state === 'failed' || file.state === 'unavailable' ? <Action label={file.state === 'failed' ? 'Retry upload' : 'Reattach file'} action={() => notify('Demo only: choose the file again; no upload happens.')}><RefreshCw /></Action>
        : file.state === 'uploading' ? <span className="attachment-progress" aria-label="Uploading 63%">63%</span>
          : file.staged ? <span className="attachment-ready" aria-label="Ready to send"><Check size={14} /></span>
            : <>{file.kind === 'html' && <Action label="Preview HTML" action={() => notify('Demo only: the existing HTML safety dialog opens here.')}><Eye /></Action>}<Action label="Download file" action={() => notify(`Demo only: download ${file.name}`)}><Download /></Action></>}
      {file.staged && <Action label={file.state === 'uploading' ? 'Cancel upload' : 'Remove attachment'} action={() => notify('Demo only: this attachment would be removed from your draft.')}><X /></Action>}
    </div>
  </div>
}
type ListProps = { files: Attachment[]; notify: (value: string) => void }
function VariantA({ files, notify }: ListProps) { return <div className="attachment-list rows-a">{files.map(file => <FileRow key={file.id} file={file} notify={notify} />)}</div> }
function VariantB({ files, notify }: ListProps) { return <div className="attachment-list rows-b"><div className="attachment-table-heading"><span>{files.length} FILES</span><span>SIZE</span><span>ACTIONS</span></div>{files.map(file => <FileRow key={file.id} file={file} notify={notify} />)}</div> }
function VariantC({ files, notify }: ListProps) { return <div className="attachment-list rows-c">{files.map(file => <FileRow key={file.id} file={file} notify={notify} />)}</div> }
function Screenshot({ notify }: { notify: (value: string) => void }) {
  return <div className="chat-attachments"><div className="chat-image"><button aria-label="Enlarge inflation-chart.png" onClick={() => notify('Existing screenshot viewer is unchanged.')}><ImagePreview src={chart} name="inflation-chart.png" width={840} height={380} /></button><span>inflation-chart.png<a href={chart} download="inflation-chart.svg">Download</a></span></div></div>
}
function Prototype() {
  const params = new URLSearchParams(location.search)
  const [variant, setVariant] = useState<Variant>(variants.includes(params.get('variant') as Variant) ? params.get('variant') as Variant : 'A')
  const [scenario, setScenario] = useState(params.get('case') || 'reports')
  const [theme, setTheme] = useState(params.get('theme') || 'dark')
  const [width, setWidth] = useState(params.get('width') || 'fit')
  const [notice, setNotice] = useState('')
  const List = variant === 'B' ? VariantB : variant === 'C' ? VariantC : VariantA
  const update = (key: string, value: string) => { const url = new URL(location.href); url.searchParams.set(key, value); history.replaceState(null, '', url); setNotice('') }
  const choose = (next: Variant) => { setVariant(next); update('variant', next) }
  useEffect(() => { document.documentElement.dataset.appearance = theme; console.info('Attachment prototype state', { variant, scenario, theme, width, fixtureOnly: true }) }, [variant, scenario, theme, width])
  useEffect(() => { const key = (event: KeyboardEvent) => { if ((event.target as HTMLElement).closest('input,textarea,select,[contenteditable],dialog') || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return; event.preventDefault(); choose(variants[(variants.indexOf(variant) + (event.key === 'ArrowRight' ? 1 : 2)) % 3]) }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key) }, [variant])
  const show = (value: string) => scenario === value || scenario === 'all'
  return <TooltipProvider delayDuration={150}><div className="attachment-study">
    <header className="attachment-study-toolbar"><div><Layers2 size={18} /><strong>Attachment studies</strong><span>FIXTURE ONLY · NOT LIVE CHAT</span></div><nav><select aria-label="Use case" value={scenario} onChange={event => { setScenario(event.target.value); update('case', event.target.value) }}>{cases.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select aria-label="Viewport width" value={width} onChange={event => { setWidth(event.target.value); update('width', event.target.value) }}>{['fit', '320', '390', '430', '768', '1024', '1440', '1920'].map(value => <option key={value} value={value}>{value === 'fit' ? 'Fit screen' : `${value}px`}</option>)}</select><button onClick={() => { const value = theme === 'dark' ? 'light' : 'dark'; setTheme(value); update('theme', value) }}>{theme === 'dark' ? 'Light' : 'Dark'}</button></nav></header>
    <section className="attachment-study-caption"><h1>{variant} · {names[variant]}</h1><p>{descriptions[variant]}</p><small>Icon → ellipsized name → size → ghost actions. Screenshot thumbnails stay as they are.</small></section>
    <div className="attachment-device-scroll"><div className="attachment-device" style={width === 'fit' ? undefined : { width: Number(width) }} data-variant={variant}>
      <div className="attachment-windowbar"><Layers2 size={13} /><span>ThreadDeck</span><small>LOCAL WORKSPACE</small></div>
      <div className="attachment-workspace"><aside className="attachment-sidebar"><header><Layers2 size={21} /><b>ThreadDeck</b><Settings2 size={15} /></header><div className="attachment-sidebar-search"><Search size={13} />Search sessions…</div><small>PROJECTS · 03</small>{['ThreadDeck', 'Research', 'TSCanvas'].map((project, index) => <section key={project}><strong><ChevronDown size={13} /><Hash size={15} />{project}</strong><span className={index === 0 ? 'selected' : ''}>{index === 0 ? 'FOMC reports & forecasts' : index === 1 ? 'Audio tooling' : 'Canvas performance'}</span></section>)}<footer><i />Kimaki connected</footer></aside>
      <main className="attachment-chat chat-pane"><header className="attachment-chat-heading"><div><span><Hash size={14} /> ThreadDeck</span><strong>FOMC reports & forecasts</strong></div><MoreHorizontal size={19} /></header>
      <div className="attachment-transcript">
        {(show('reports') || show('types') || show('mixed')) && <article className="attachment-message"><span className="attachment-avatar">Y</span><div className="attachment-message-body"><div className="attachment-author">You <time>Today · 10:42 AM</time></div><p className="attachment-prompt">Take a look at these reports and summarize the main points. Keep the focus on inflation, terminal rates, and tomorrow’s FOMC meeting.</p>{show('reports') && <List files={reports} notify={setNotice} />}{show('types') && <><List files={types} notify={setNotice} /><p className="attachment-case-note">HTML keeps its preview action. Other files offer download; no new PDF/video preview is implied.</p></>}{show('mixed') && <><List files={[reports[0], types[0], types[1]]} notify={setNotice} /><Screenshot notify={setNotice} /><p className="attachment-case-note"><Image size={13} /> Existing screenshot thumbnail, caption and viewer remain unchanged.</p></>}</div></article>}
        {show('edge') && <article className="attachment-message"><span className="attachment-avatar">Y</span><div className="attachment-message-body"><div className="attachment-author">You <time>Today · 10:43 AM</time></div><p className="attachment-prompt">Short names, missing size, Unicode, and a very long filename:</p><List files={edges} notify={setNotice} /><p className="attachment-case-note">Full filenames on hover/focus. Zero bytes stays 0 B; unknown size stays —.</p></div></article>}
        {show('draft') && <article className="attachment-message"><span className="attachment-avatar">Y</span><div className="attachment-message-body"><div className="attachment-author">You <time>Sending…</time></div><p className="attachment-prompt">Published rows use the same layout as staged and outgoing attachments.</p><div className="attachment-optimistic"><List files={reports.slice(0, 2)} notify={setNotice} /></div><p className="attachment-case-note">Dimmed outgoing state · no duplicate file cards</p></div></article>}
        {show('all') && <article className="attachment-message"><span className="attachment-avatar">Y</span><div className="attachment-message-body"><div className="attachment-author">You <time>Today · 10:44 AM</time></div><p className="attachment-prompt">A single file uses the same one-line layout:</p><List files={[types[2]]} notify={setNotice} /></div></article>}
      </div>
      <div className="attachment-composer"><div className="attachment-composer-box">{show('draft') && <><List files={draft} notify={setNotice} /><div className="attachment-upload-notes"><span><i />63% uploading</span><span className="error">CSV failed — retry</span><span>TXT needs reattach</span></div></>}<textarea aria-label="Demo prompt" placeholder="Ask anything, / for commands, or attach files…" /><div className="attachment-composer-tools"><Action label="Attach files (demo)" action={() => setNotice('Fixture only — no files are read or uploaded.')}><Paperclip /></Action><span>gpt-6.1-sol · high</span><div /><Action label="Expand composer (demo)" action={() => setNotice('Fixture only — expanded editor is not part of this study.')}><Maximize2 /></Action><Button variant="ghost" size="icon" aria-label="Send (demo)" onClick={() => setNotice('Fixture only — nothing was sent to Discord.')}><ArrowUp size={16} /></Button></div></div><small>All actions are simulated. No files, prompts or settings are saved.</small></div>
      </main></div></div></div>
    {notice && <div className="attachment-demo-notice" role="status">{notice}<button aria-label="Dismiss demo message" onClick={() => setNotice('')}><X size={14} /></button></div>}
    {import.meta.env.MODE === 'prototype' && <div className="attachment-switcher"><button aria-label="Previous variant" onClick={() => choose(variants[(variants.indexOf(variant) + 2) % 3])}><ArrowLeft size={15} /></button><span><b>{variant}</b> {names[variant]}</span><button aria-label="Next variant" onClick={() => choose(variants[(variants.indexOf(variant) + 1) % 3])}><ArrowRight size={15} /></button><small>← → to compare</small></div>}
  </div></TooltipProvider>
}
createRoot(document.getElementById('root')!).render(<Prototype />)
