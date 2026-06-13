import { useEffect, useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Loader2, Maximize2, Minimize2, X, ChevronDown, ChevronUp, Pencil, Check, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import { downloadFile, encPath, viewUrl, fetchExtractions, updateExtraction, api } from '../api/client'
import type { ExtractionPage } from '../api/client'
import * as pdfjsLib from 'pdfjs-dist'
// @ts-ignore
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url'

// Set worker source path
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

// ─── Extension helpers ────────────────────────────────────────────────────────

const IMAGE_EXTS  = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff', '.tif'])
const TEXT_EXTS   = new Set(['.txt', '.md', '.rst', '.log', '.csv', '.tsv', '.nfo'])
const OFFICE_EXTS = new Set(['.xlsx', '.xls', '.ods', '.docx'])

function fileExt(path: string) {
  const i = path.lastIndexOf('.')
  return i >= 0 ? path.slice(i).toLowerCase() : ''
}

// ─── Responsive hook ──────────────────────────────────────────────────────────

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(
        window.innerWidth < 768 ||
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      )
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])
  return isMobile
}

// ─── Viewer variants ──────────────────────────────────────────────────────────


function PdfJsPage({ pdf, pageNum, scale }: { pdf: any; pageNum: number; scale: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const renderTaskRef = useRef<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)

    const renderPage = async () => {
      try {
        const page = await pdf.getPage(pageNum)
        if (!active) return

        const canvas = canvasRef.current
        if (!canvas) return

        const context = canvas.getContext('2d')
        if (!context) return

        const viewport = page.getViewport({ scale })
        canvas.height = viewport.height
        canvas.width = viewport.width

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        }

        const renderTask = page.render(renderContext)
        renderTaskRef.current = renderTask
        await renderTask.promise
        setLoading(false)
        renderTaskRef.current = null
      } catch (err: any) {
        if (err.name === 'RenderingCancelledException') return
        console.error(err)
      }
    }

    renderPage()

    return () => {
      active = false
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel()
      }
    }
  }, [pdf, pageNum, scale])

  return (
    <div className="flex flex-col items-center justify-center p-2 border-b border-slate-700 last:border-b-0 w-full min-h-[300px] relative bg-slate-800">
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-800 text-slate-400 text-xs">
          <Loader2 size={16} className="animate-spin text-indigo-500" />
          <span>Loading Page {pageNum}…</span>
        </div>
      )}
      <canvas ref={canvasRef} className="max-w-full shadow-lg bg-white object-contain" />
      <span className="text-[10px] text-slate-400 mt-1">Page {pageNum}</span>
    </div>
  )
}

function PdfJsViewer({ path }: { path: string }) {
  const [pdf, setPdf] = useState<any>(null)
  const [numPages, setNumPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const isMobile = useIsMobile()
  const [scale, setScale] = useState(2.0)

  useEffect(() => {
    setScale(isMobile ? 1.0 : 2.0)
  }, [isMobile])

  // Load PDF
  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    setPdf(null)

    api.get(`/files/${encPath(path)}`, { responseType: 'arraybuffer' })
      .then(async (res) => {
        if (!active) return
        try {
          const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(res.data) })
          const pdfDoc = await loadingTask.promise
          if (!active) return
          setPdf(pdfDoc)
          setNumPages(pdfDoc.numPages)
          setLoading(false)
        } catch (err: any) {
          if (!active) return
          console.error(err)
          setError('Failed to render PDF document.')
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!active) return
        console.error(err)
        setError('Failed to load PDF file from server.')
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [path])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-2 text-slate-400 text-sm">
        <Loader2 size={20} className="animate-spin text-indigo-600" />
        <span>Loading PDF document…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center p-6 gap-3 max-w-sm mx-auto">
        <div className="text-red-500 text-sm font-semibold">{error}</div>
        <p className="text-xs text-slate-400">You can download the original file to view it using your system viewer.</p>
        <button
          onClick={() => downloadFile(path, path.split('/').pop() ?? 'file.pdf')}
          className="flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg font-medium text-xs hover:bg-indigo-100 transition-colors"
        >
          <Download size={14} /> Download PDF
        </button>
      </div>
    )
  }

  const pages = []
  for (let i = 1; i <= numPages; i++) {
    pages.push(<PdfJsPage key={i} pdf={pdf} pageNum={i} scale={scale} />)
  }

  return (
    <div className="relative flex flex-col h-full bg-slate-800 overflow-hidden">
      {/* Scrollable list of pages */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col items-center gap-4 py-4 w-full">
          {pages}
        </div>
      </div>

      {/* Floating Zoom Control Bar (desktop only) */}
      {!isMobile && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur border border-slate-700 text-white rounded-full px-4 py-1.5 flex items-center gap-3 shadow-lg select-none z-10">
          <button
            onClick={() => setScale(s => Math.max(0.5, s - 0.2))}
            className="p-1 rounded-full hover:bg-slate-800 disabled:opacity-35 transition-colors"
            disabled={scale <= 0.5}
            title="Zoom Out"
          >
            <ZoomOut size={16} />
          </button>
          <span className="text-xs font-semibold min-w-[3.5rem] text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => setScale(s => Math.min(3.0, s + 0.2))}
            className="p-1 rounded-full hover:bg-slate-800 disabled:opacity-35 transition-colors"
            disabled={scale >= 3.0}
            title="Zoom In"
          >
            <ZoomIn size={16} />
          </button>
          <div className="w-[1px] h-4 bg-slate-700 mx-0.5" />
          <button
            onClick={() => setScale(2.0)}
            className="text-xs px-2 py-0.5 rounded hover:bg-slate-800 transition-colors font-medium"
            title="Reset Zoom"
          >
            Reset
          </button>
        </div>
      )}
    </div>
  )
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
    <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-3 text-slate-500 text-sm">
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

function ViewerContent({
  path,
}: {
  path: string
}) {
  const e = fileExt(path)
  if (e === '.pdf') {
    return <PdfJsViewer path={path} />
  }
  if (IMAGE_EXTS.has(e))     return <ImageViewer path={path} />
  if (TEXT_EXTS.has(e))      return <TextViewer  path={path} />
  if (OFFICE_EXTS.has(e))    return <OfficeViewer path={path} />
  return (
    <div className="flex items-center justify-center h-full text-slate-400 text-sm p-8 text-center">
      Preview not available.
    </div>
  )
}

// ─── Extraction Single Page Component ─────────────────────────────────────────

interface PageSectionProps {
  page: ExtractionPage
  index: number
  total: number
  onSaved: (updated: ExtractionPage) => void
}

function PageSection({ page, index, total, onSaved }: PageSectionProps) {
  const [editing, setEditing]         = useState(false)
  const [draft, setDraft]             = useState(page.text)
  const [showOrig, setShowOrig]       = useState(false)
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [collapsed, setCollapsed]     = useState(false)
  const textareaRef                   = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!editing) setDraft(page.text)
  }, [page.text, editing])

  useEffect(() => {
    if (editing) textareaRef.current?.focus()
  }, [editing])

  const isDirty    = draft !== page.text
  const corrected  = page.original_text !== null
  const display     = showOrig && page.original_text ? page.original_text : page.text
  const label = total === 1 ? 'Extracted text' : `Page ${page.page ?? index + 1}`

  async function handleSave() {
    if (!isDirty) { setEditing(false); return }
    setSaving(true)
    setError(null)
    try {
      const updated = await updateExtraction(page.id, draft)
      onSaved(updated)
      setEditing(false)
    } catch {
      setError('Save failed — please try again.')
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setDraft(page.text)
    setEditing(false)
    setError(null)
  }

  async function handleRevert() {
    if (!page.original_text) return
    setSaving(true)
    setError(null)
    try {
      const updated = await updateExtraction(page.id, page.original_text)
      onSaved(updated)
    } catch {
      setError('Revert failed — please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-2 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="text-slate-400 hover:text-slate-600 shrink-0"
          >
            {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
          <span className="text-sm font-medium text-slate-700">{label}</span>
          {corrected && !editing && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium shrink-0">
              corrected
            </span>
          )}
        </div>

        {!collapsed && (
          <div className="flex items-center gap-1 shrink-0">
            {corrected && !editing && (
              <button
                onClick={() => setShowOrig((v) => !v)}
                className={`text-[11px] px-1.5 py-0.5 rounded border font-medium transition-colors ${
                  showOrig
                    ? 'bg-amber-50 border-amber-300 text-amber-700'
                    : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {showOrig ? 'Corrected' : 'Original'}
              </button>
            )}

            {corrected && !editing && !showOrig && (
              <button
                onClick={handleRevert}
                disabled={saving}
                className="flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 transition-colors font-medium disabled:opacity-50"
                title="Revert to original OCR text"
              >
                <RotateCcw size={10} />
                Revert
              </button>
            )}

            {!editing && !showOrig && (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 transition-colors font-medium"
              >
                <Pencil size={10} />
                Edit
              </button>
            )}

            {editing && (
              <>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-0.5 text-[11px] px-2 py-0.5 rounded bg-indigo-600 text-white hover:bg-indigo-700 transition-colors font-medium disabled:opacity-50"
                >
                  {saving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                  Save
                </button>
                <button
                  onClick={handleCancel}
                  disabled={saving}
                  className="text-[11px] px-2 py-0.5 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 transition-colors font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      {!collapsed && (
        <div className="p-3">
          {error && (
            <p className="text-xs text-red-600 mb-1.5">{error}</p>
          )}

          {editing ? (
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-full min-h-[160px] font-mono text-xs text-slate-700 bg-slate-50 border border-slate-300 rounded-lg p-2.5 resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              spellCheck={false}
            />
          ) : (
            <pre className={`text-xs leading-relaxed whitespace-pre-wrap break-words font-mono text-slate-700 ${showOrig ? 'text-amber-800 bg-amber-50 rounded-lg p-2.5' : ''}`}>
              {display || <span className="text-slate-400 italic">No text extracted</span>}
            </pre>
          )}

          {!editing && (
            <p className="text-[10px] text-slate-400 mt-1.5 text-right">
              {display.length.toLocaleString()} characters
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Extraction Tab Container ──────────────────────────────────────────────────

function ExtractionTabContent({
  extractionData,
  loadingExtractions,
  extractionError,
  onSaved,
}: {
  extractionData: any
  loadingExtractions: boolean
  extractionError: boolean
  onSaved: (updated: ExtractionPage) => void
}) {
  if (loadingExtractions) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 text-slate-400 py-20 h-full">
        <Loader2 size={20} className="animate-spin" />
        <span className="text-sm">Loading OCR text…</span>
      </div>
    )
  }

  if (extractionError) {
    return (
      <div className="p-6 text-center text-red-500 text-sm h-full flex items-center justify-center">
        Failed to load extracted text.
      </div>
    )
  }

  if (!extractionData || extractionData.pages.length === 0) {
    return (
      <div className="text-center py-20 text-slate-400 text-sm h-full flex items-center justify-center">
        No text has been extracted yet.
      </div>
    )
  }

  return (
    <div className="p-4 flex flex-col gap-3 overflow-y-auto max-h-full">
      {extractionData.pages.map((page: any, i: number) => (
        <PageSection
          key={page.id}
          page={page}
          index={i}
          total={extractionData.pages.length}
          onSaved={onSaved}
        />
      ))}
    </div>
  )
}

// ─── Modal shell ──────────────────────────────────────────────────────────────

interface Props {
  path: string | null
  docId?: number | null
  onClose: () => void
}

export default function FileViewerModal({ path, docId, onClose }: Props) {
  const [maximized, setMaximized] = useState(false)
  const [activeTab, setActiveTab] = useState<'preview' | 'text'>('preview')
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()

  // Reset maximize and tab states each time a new file opens.
  useEffect(() => {
    if (path) {
      setMaximized(false)
      setActiveTab('preview')
    }
  }, [path])

  // ESC closes the modal.
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  // Query for extractions
  const { data: extractionData, isLoading: loadingExtractions, isError: extractionError } = useQuery({
    queryKey: ['extractions', docId],
    queryFn: () => fetchExtractions(docId!),
    enabled: !!docId && activeTab === 'text',
    staleTime: 60_000,
  })

  function handleSaved(updated: ExtractionPage) {
    queryClient.setQueryData(
      ['extractions', docId],
      (old: any) => old
        ? { ...old, pages: old.pages.map((p: any) => p.id === updated.id ? updated : p) }
        : old,
    )
  }

  if (!path) return null

  const name = path.split('/').pop() ?? path

  return (
    // Backdrop — click outside to close
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      {/* Modal panel */}
      <div
        className={`bg-white shadow-2xl flex flex-col overflow-hidden transition-all duration-200 ${
          maximized
            ? 'w-[98vw] h-[98vh] sm:w-[96vw] sm:h-[96vh] rounded-none sm:rounded-xl'
            : 'w-full h-full sm:w-[85vw] sm:h-[90vh] md:w-[75vw] md:h-[88vh] rounded-none sm:rounded-xl'
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
          {!isMobile && (
            <button
              onClick={() => setMaximized((m) => !m)}
              className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
              title={maximized ? 'Restore' : 'Maximize'}
            >
              {maximized ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-slate-200 transition-colors"
            title="Close (Esc)"
          >
            <X size={15} />
          </button>
        </div>

        {/* Tab switcher (only if docId is available) */}
        {docId && (
          <div className="flex border-b border-slate-200 bg-slate-50 shrink-0">
            <button
              onClick={() => setActiveTab('preview')}
              className={`flex-1 sm:flex-none px-6 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === 'preview'
                  ? 'border-indigo-600 text-indigo-600 bg-white font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100/50'
              }`}
            >
              Document Preview
            </button>
            <button
              onClick={() => setActiveTab('text')}
              className={`flex-1 sm:flex-none px-6 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === 'text'
                  ? 'border-indigo-600 text-indigo-600 bg-white font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100/50'
              }`}
            >
              Extracted OCR Text
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {activeTab === 'preview' ? (
            <ViewerContent
              path={path}
            />
          ) : docId ? (
            <ExtractionTabContent
              extractionData={extractionData}
              loadingExtractions={loadingExtractions}
              extractionError={extractionError}
              onSaved={handleSaved}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
