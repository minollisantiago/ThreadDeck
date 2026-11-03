import { useEffect, useRef, useState } from 'react'
import { modelCatalogSchema, type ModelCatalog } from '../../shared/chat'
import { chatRequest } from './api'
import './slash.css'

export function ModelPicker({ threadId, command, arguments: args, close, apply }: { threadId: string; command: string; arguments: string; close: () => void; apply: (text: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const variantsOnly = !['models', 'model'].includes(command)
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null), [error, setError] = useState(''), [retry, setRetry] = useState(0)
  const [query, setQuery] = useState(''), [selected, setSelected] = useState(''), [variant, setVariant] = useState('default')
  useEffect(() => {
    const previous = document.activeElement
    dialog.current?.showModal()
    return () => { dialog.current?.close(); if (previous instanceof HTMLElement) previous.focus() }
  }, [])
  useEffect(() => {
    const abort = new AbortController(); setCatalog(null); setError('')
    void chatRequest(`threads/${threadId}/models`, modelCatalogSchema, { signal: abort.signal }).then(value => {
      if (abort.signal.aborted) return
      setCatalog(value)
      const [name, requestedVariant] = args.trim().split(/\s+/)
      const current = value.current ? `${value.current.providerID}/${value.current.id}` : ''
      const model = value.models.find(model => `${model.providerID}/${model.id}` === (variantsOnly ? current : name || current))
      setSelected(model ? `${model.providerID}/${model.id}` : '')
      const wanted = variantsOnly ? name || value.current?.variant : requestedVariant || (name ? undefined : value.current?.variant)
      setVariant(wanted && model?.variants.includes(wanted) ? wanted : 'default')
    }).catch(error => { if (!abort.signal.aborted) setError(error.message) })
    return () => abort.abort()
  }, [threadId, retry])
  const model = catalog?.models.find(model => `${model.providerID}/${model.id}` === selected)
  const matches = catalog?.models.filter(model => `${model.name} ${model.providerID}/${model.id}`.toLowerCase().includes(query.toLowerCase())) || []
  return <dialog className="model-picker" ref={dialog} onCancel={event => { event.preventDefault(); close() }} aria-label={variantsOnly ? 'Switch model variant' : 'Switch session model'}>
    <header><strong>{variantsOnly ? 'Switch model variant' : 'Switch session model'}</strong><button aria-label="Close model picker" onClick={close}>×</button></header>
    <p>Applies to this session from its next step. Does not send a prompt or interrupt the agent.</p>
    {error ? <p role="alert">{error} <button onClick={() => setRetry(value => value + 1)}>Retry</button></p> : !catalog ? <p role="status">Loading available models…</p> : <>
      {!variantsOnly && <><input autoFocus type="search" aria-label="Find a model" placeholder="Search models and providers…" value={query} onChange={event => setQuery(event.target.value)} /><div className="model-picker-options" role="group" aria-label="Models">{matches.map(model => <button key={`${model.providerID}/${model.id}`} aria-pressed={selected === `${model.providerID}/${model.id}`} onClick={() => { setSelected(`${model.providerID}/${model.id}`); setVariant('default') }}><strong>{model.name}</strong><small>{model.providerID}/{model.id}</small></button>)}{!matches.length && <p>No matching enabled models.</p>}</div></>}
      {model ? <><strong>{model.providerID}/{model.id}</strong><div className="model-picker-options" role="group" aria-label="Thinking effort">{['default', ...model.variants.filter(variant => variant !== 'default')].map(value => <button key={value} aria-pressed={variant === value} onClick={() => setVariant(value)}>{value === 'default' ? 'Default variant' : value}</button>)}</div>{!model.variants.length && <p>This model has no named variants.</p>}</> : variantsOnly && <p role="status">The current session model is unavailable. Use /models to choose one.</p>}
    </>}
    <footer><button onClick={close}>Cancel</button><button disabled={!model || Boolean(error)} onClick={() => apply(`${selected}${variant !== 'default' ? ` ${variant}` : ''}`)}>Apply to session</button></footer>
  </dialog>
}
