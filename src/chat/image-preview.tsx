import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { Image } from 'lucide-react'

export function ImagePreview({ src, name, lazy = false, width, height }: { src: string; name: string; lazy?: boolean; width?: number | null; height?: number | null }) {
  const image = useRef<HTMLImageElement>(null), [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  useLayoutEffect(() => { setState(image.current?.complete && image.current.naturalWidth > 0 ? 'ready' : 'loading') }, [src])
  return <span className={`chat-image-preview ${state}`} aria-busy={state === 'loading'} style={width && height && width > 0 && height > 0 ? { '--preview-ratio': `${width} / ${height}` } as CSSProperties : undefined}>
    {state === 'loading' && <span className="chat-image-skeleton skeleton-shape" role="status" aria-label={`Loading ${name}`}><Image size={28} strokeWidth={1} aria-hidden="true" /><span className="sr-only">Loading image preview…</span></span>}
    {state === 'failed' && <span className="chat-image-unavailable" role="status">Image preview unavailable</span>}
    <img ref={image} src={src} alt={name} loading={lazy ? 'lazy' : 'eager'} referrerPolicy="no-referrer" onLoad={() => setState('ready')} onError={() => setState('failed')} hidden={state === 'failed'} />
  </span>
}
