import { useEffect, useState } from 'react'
import { Download, Loader2, Maximize2, Minimize2, X } from 'lucide-react'
import { downloadFile, encPath, viewUrl } from '../api/client'

// ─── Extension helpers ────────────────────────────────────────────────────────

const IMAGE_EXTS  = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff', '.tif'])
const TEXT_EXTS   = new Set(['.txt', '.md', '.rst', '.log', '.csv', '.tsv', '.nfo'])
const OFFICE_EXTS = new Set(['.xlsx', '.xls', '.ods', '.docx'])

function fileExt(path: string) {
  const i = path.lastIndexOf('.')
  return i >= 0 ? path.slice(i).toLowerCase() : ''
}

// ─── Viewer variants ──────────────────────────────────────────────────────────

function PdfViewer({ path }: { path: string }) {
  return <iframe src={viewUrl(path)} className="w-full h-full border-0" title={path} />
}

function ImageViewer({ path }: { path: string }) {
  return (
    <div className="w-full h-full flex items-center justify-center bg-slate-950 p-4">
      <img src={viewUrl(path)} alt={path} className="max-w-full max-h-full object-contain" />
    </div>
  )
}

function TextViewer({ path }: { path: string }) {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError]     = useState(false)

  useEffect(() => {
    setContent(null)
    setError(false)
    const token = localStorage.getItem('token') ?? ''
    fetch(`/api/files/view/${encPath(path)}?token=${encodeURIComponent(token)}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.text() })
      .then(setContent)
      .catch(() => setError(true))
  }, [path])

  if (error) return (
    <div className="flex items-center justify-center h-full text-red-500 text-sm">
      Failed to load file.
    </div>
  )
  if (content === null) return (
    <div className="flex items-center justify-center h-full gap-2 text-slate-400 text-sm">
      <Loader2 size={16} className="animate-spin" /> Loading…
    </div>
  )
  return (
    <pre className="w-full h-full overflow-auto p-5 text-sm font-mono leading-relaxed text-slate-800 bg-white whitespace-pre-wrap break-words">
      {content}
    </pre>
  )
}

function OfficeViewer({ path }: { path: string }) {
  const name = path.split('/').pop() ?? path
  const label = fileExt(path).slice(1).toUpperCase()
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500 text-sm">
      <p>In-browser preview is not available for {label} files.</p>
      <button
        onClick={() => downloadFile(path, name)}
        className="flex items-center gap-1.5 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg font-medium hover:bg-indigo-100 transition-colors"
      >
        <Download size={14} /> Download {name}
      </button>
    </div>
  )
}

function ViewerContent({ path }: { path: string }) {
  const e = fileExt(path)
  if (e === '.pdf')          return <PdfViewer   path={path} />
  if (IMAGE_EXTS.has(e))     return <ImageViewer path={path} />
  if (TEXT_EXTS.has(e))      return <TextViewer  path={path} />
  if (OFFICE_EXTS.has(e))    return <OfficeViewer path={path} />
  return (
    <div className="flex items-center justify-center h-full text-slate-400 text-sm">
      Preview not available.
    </div>
  )
}

// ─── Modal shell ──────────────────────────────────────────────────────────────

interface Props {
  path: string | null
  onClose: () => void
}

export default function FileViewerModal({ path, onClose }: Props) {
  const [maximized, setMaximized] = useState(false)

  // Reset maximize state each time a new file opens.
  useEffect(() => { if (path) setMaximized(false) }, [path])

  // ESC closes the modal.
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  if (!path) return null

  const name = path.split('/').pop() ?? path

  return (
    // Backdrop — click outside to close
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Modal panel */}
      <div
        className={`bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden transition-all duration-200 ${
          maximized ? 'w-[96vw] h-[96vh]' : 'w-[70vw] h-[72vh]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-1 px-4 py-2.5 border-b border-slate-200 bg-slate-50 shrink-0">
          <span className="text-sm font-medium text-slate-800 truncate flex-1 mr-2" title={path}>
            {name}
          </span>
          <button
            onClick={() => downloadFile(path, name)}
            className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
            title="Download"
          >
            <Download size={15} />
          </button>
          <button
            onClick={() => setMaximized((m) => !m)}
            className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
            title={maximized ? 'Restore' : 'Maximize'}
          >
            {maximized ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-slate-200 transition-colors"
            title="Close (Esc)"
          >
            <X size={15} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0">
          <ViewerContent path={path} />
        </div>
      </div>
    </div>
  )
}
