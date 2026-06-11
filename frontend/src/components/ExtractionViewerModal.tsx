import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown, ChevronUp, Loader2, Pencil, RotateCcw, X } from 'lucide-react'
import { fetchExtractions, updateExtraction } from '../api/client'
import type { ExtractionPage } from '../api/client'

interface Props {
  docId: number | null
  onClose: () => void
}

// ─── Single page section ──────────────────────────────────────────────────────

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

  // Keep draft in sync if parent data refreshes while not editing
  useEffect(() => {
    if (!editing) setDraft(page.text)
  }, [page.text, editing])

  // Auto-focus textarea when edit starts
  useEffect(() => {
    if (editing) textareaRef.current?.focus()
  }, [editing])

  const isDirty    = draft !== page.text
  const corrected  = page.original_text !== null

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

  const label = total === 1
    ? 'Extracted text'
    : `Page ${page.page ?? index + 1}`

  const displayText = showOrig && page.original_text ? page.original_text : page.text

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="text-slate-400 hover:text-slate-600 shrink-0"
          >
            {collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
          </button>
          <span className="text-sm font-medium text-slate-700">{label}</span>
          {corrected && !editing && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium shrink-0">
              corrected
            </span>
          )}
        </div>

        {!collapsed && (
          <div className="flex items-center gap-1.5 shrink-0">
            {corrected && !editing && (
              <button
                onClick={() => setShowOrig((v) => !v)}
                className={`text-xs px-2 py-1 rounded border font-medium transition-colors ${
                  showOrig
                    ? 'bg-amber-50 border-amber-300 text-amber-700'
                    : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {showOrig ? 'Show corrected' : 'Show original'}
              </button>
            )}

            {corrected && !editing && !showOrig && (
              <button
                onClick={handleRevert}
                disabled={saving}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 transition-colors font-medium disabled:opacity-50"
                title="Revert to original OCR text"
              >
                <RotateCcw size={11} />
                Revert
              </button>
            )}

            {!editing && !showOrig && (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 transition-colors font-medium"
              >
                <Pencil size={11} />
                Edit
              </button>
            )}

            {editing && (
              <>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 transition-colors font-medium disabled:opacity-50"
                >
                  {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                  Save
                </button>
                <button
                  onClick={handleCancel}
                  disabled={saving}
                  className="text-xs px-2.5 py-1 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 transition-colors font-medium disabled:opacity-50"
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
        <div className="p-4">
          {error && (
            <p className="text-xs text-red-600 mb-2">{error}</p>
          )}

          {editing ? (
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-full min-h-48 font-mono text-xs text-slate-700 bg-slate-50 border border-slate-300 rounded-lg p-3 resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              spellCheck={false}
            />
          ) : (
            <pre className={`text-xs leading-relaxed whitespace-pre-wrap break-words font-mono text-slate-700 ${showOrig ? 'text-amber-800 bg-amber-50 rounded-lg p-3' : ''}`}>
              {displayText || <span className="text-slate-400 italic">No text extracted</span>}
            </pre>
          )}

          {!editing && (
            <p className="text-xs text-slate-400 mt-2 text-right">
              {displayText.length.toLocaleString()} characters
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export default function ExtractionViewerModal({ docId, onClose }: Props) {
  const queryClient = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['extractions', docId],
    queryFn:  () => fetchExtractions(docId!),
    enabled:  docId !== null,
    staleTime: 0,
  })

  // ESC to close + lock body scroll while open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [onClose])

  if (docId === null) return null

  const filename = data?.path.split('/').pop() ?? ''

  function handleSaved(updated: ExtractionPage) {
    queryClient.setQueryData(
      ['extractions', docId],
      (old: typeof data) => old
        ? { ...old, pages: old.pages.map((p) => p.id === updated.id ? updated : p) }
        : old,
    )
  }

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 50, backgroundColor: 'rgba(0,0,0,0.4)' }}
        onClick={onClose}
      />

      {/* Drawer — top:0 + bottom:0 = definite 100vh height, so overflow-y:auto always works */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: '65vw', maxWidth: '1100px',
        zIndex: 51,
        backgroundColor: 'white',
        boxShadow: '-4px 0 32px rgba(0,0,0,0.18)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header — fixed at top of drawer */}
        <div style={{
          flexShrink: 0,
          borderBottom: '1px solid #e2e8f0',
          padding: '14px 20px',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px',
        }}>
          <div style={{ minWidth: 0, overflow: 'hidden' }}>
            <p className="text-sm font-semibold text-slate-800 truncate">
              Extracted text{filename ? ` — ${filename}` : ''}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              View or correct the OCR output. Corrections update search immediately; the original is always preserved.
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body — flex:1 + minHeight:0 + overflowY:auto on a height-constrained flex child */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {isLoading && (
            <div className="flex items-center justify-center gap-2 text-slate-400 py-20">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm">Loading…</span>
            </div>
          )}

          {isError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
              Failed to load extractions.
            </div>
          )}

          {data && data.pages.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-20">
              No text has been extracted yet.
            </p>
          )}

          {data && data.pages.map((page, i) => (
            <PageSection
              key={page.id}
              page={page}
              index={i}
              total={data.pages.length}
              onSaved={handleSaved}
            />
          ))}
        </div>
      </div>
    </>
  )
}
