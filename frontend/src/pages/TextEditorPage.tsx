import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Check, ChevronDown, ChevronUp,
  Loader2, Pencil, RotateCcw,
} from 'lucide-react'
import { fetchExtractions, updateExtraction } from '../api/client'
import type { ExtractionPage } from '../api/client'

// ─── Single page section ──────────────────────────────────────────────────────

function PageSection({
  page, index, total, onSaved,
}: {
  page: ExtractionPage
  index: number
  total: number
  onSaved: (updated: ExtractionPage) => void
}) {
  const [editing, setEditing]     = useState(false)
  const [draft, setDraft]         = useState(page.text)
  const [showOrig, setShowOrig]   = useState(false)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const textareaRef               = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { if (!editing) setDraft(page.text) }, [page.text, editing])
  useEffect(() => { if (editing) textareaRef.current?.focus() }, [editing])

  const corrected = page.original_text !== null
  const display   = showOrig && page.original_text ? page.original_text : page.text
  const label     = total === 1 ? 'Extracted text' : `Page ${page.page ?? index + 1}`

  async function save() {
    if (draft === page.text) { setEditing(false); return }
    setSaving(true); setError(null)
    try {
      onSaved(await updateExtraction(page.id, draft))
      setEditing(false)
    } catch {
      setError('Save failed — please try again.')
    } finally {
      setSaving(false)
    }
  }

  function cancel() { setDraft(page.text); setEditing(false); setError(null) }

  async function revert() {
    if (!page.original_text) return
    setSaving(true); setError(null)
    try { onSaved(await updateExtraction(page.id, page.original_text)) }
    catch { setError('Revert failed — please try again.') }
    finally { setSaving(false) }
  }

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      {/* Section header */}
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => setCollapsed(c => !c)} className="text-slate-400 hover:text-slate-600 shrink-0">
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
                onClick={() => setShowOrig(v => !v)}
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
                onClick={revert} disabled={saving}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 transition-colors font-medium disabled:opacity-50"
              >
                <RotateCcw size={11} /> Revert
              </button>
            )}
            {!editing && !showOrig && (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 transition-colors font-medium"
              >
                <Pencil size={11} /> Edit
              </button>
            )}
            {editing && (
              <>
                <button
                  onClick={save} disabled={saving}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 transition-colors font-medium disabled:opacity-50"
                >
                  {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Save
                </button>
                <button
                  onClick={cancel} disabled={saving}
                  className="text-xs px-2.5 py-1 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 transition-colors font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Section body */}
      {!collapsed && (
        <div className="p-4">
          {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
          {editing ? (
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              className="w-full min-h-48 font-mono text-xs text-slate-700 bg-slate-50 border border-slate-300 rounded-lg p-3 resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              spellCheck={false}
            />
          ) : (
            <pre className={`text-xs leading-relaxed whitespace-pre-wrap break-words font-mono text-slate-700 ${showOrig ? 'text-amber-800 bg-amber-50 rounded-lg p-3' : ''}`}>
              {display || <span className="text-slate-400 italic">No text extracted</span>}
            </pre>
          )}
          {!editing && (
            <p className="text-xs text-slate-400 mt-2 text-right">
              {display.length.toLocaleString()} characters
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TextEditorPage() {
  const { docId } = useParams<{ docId: string }>()
  const navigate  = useNavigate()
  const queryClient = useQueryClient()
  const id = Number(docId)

  const { data, isLoading, isError } = useQuery({
    queryKey:  ['extractions', id],
    queryFn:   () => fetchExtractions(id),
    enabled:   !isNaN(id),
    staleTime: 0,
  })

  const filename = data?.path.split('/').pop() ?? ''

  function handleSaved(updated: ExtractionPage) {
    queryClient.setQueryData(
      ['extractions', id],
      (old: typeof data) => old
        ? { ...old, pages: old.pages.map(p => p.id === updated.id ? updated : p) }
        : old,
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => navigate(-1)}
          className="shrink-0 flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors mt-0.5"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-slate-800 break-all">
            {filename || 'Extracted text'}
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            View or correct the OCR output per page. Corrections update search immediately; the original is always preserved.
          </p>
        </div>
      </div>

      {/* States */}
      {isLoading && (
        <div className="flex items-center justify-center gap-2 text-slate-400 py-24">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Loading…</span>
        </div>
      )}

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          Failed to load extracted text.
        </div>
      )}

      {data && data.pages.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-24">
          No text has been extracted yet.
        </p>
      )}

      {/* Pages */}
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
  )
}
