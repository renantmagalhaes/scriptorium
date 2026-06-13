import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle, FileX, Loader2, RefreshCw, ScanSearch, ShieldCheck, ShieldOff, Trash2,
} from 'lucide-react'
import { fetchAdminSettings, fetchOrphans, purgeOrphans, triggerScan, retryFailedJobs } from '../api/client'
import type { OrphanDoc } from '../api/client'

// ─── Confirm dialog (two-step) ────────────────────────────────────────────────

function ConfirmDelete({
  count,
  onConfirmed,
  onCancel,
}: {
  count: number
  onConfirmed: () => void
  onCancel: () => void
}) {
  const [step, setStep]   = useState<1 | 2>(1)
  const [typed, setTyped] = useState('')

  if (step === 1) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5 flex flex-col gap-4">
        <div className="flex gap-3">
          <AlertTriangle size={20} className="text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-800 text-sm">
              Delete {count} document{count !== 1 ? 's' : ''} from the search index?
            </p>
            <p className="text-sm text-red-700 mt-1">
              This removes the catalog entry and all extracted text for each file.
              The original files on disk are <strong>not affected</strong>.
              This cannot be undone.
            </p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-sm border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={() => setStep(2)}
            className="px-3 py-1.5 rounded-lg text-sm bg-red-600 text-white hover:bg-red-700 transition-colors font-medium"
          >
            Continue
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-red-300 bg-red-50 p-5 flex flex-col gap-4">
      <div className="flex gap-3">
        <AlertTriangle size={20} className="text-red-500 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-red-800 text-sm">Final confirmation</p>
          <p className="text-sm text-red-700 mt-1">
            Type <span className="font-mono font-bold">DELETE</span> to permanently
            remove {count} document{count !== 1 ? 's' : ''} from the index.
          </p>
        </div>
      </div>
      <input
        type="text"
        value={typed}
        onChange={e => setTyped(e.target.value)}
        placeholder="Type DELETE"
        className="w-full px-3 py-2 rounded-lg border border-red-300 bg-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
        autoFocus
      />
      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-sm border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 transition-colors font-medium"
        >
          Cancel
        </button>
        <button
          disabled={typed !== 'DELETE'}
          onClick={onConfirmed}
          className="px-3 py-1.5 rounded-lg text-sm bg-red-600 text-white hover:bg-red-700 transition-colors font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Confirm delete
        </button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [syncing, setSyncing]       = useState(false)
  const [syncDone, setSyncDone]     = useState(false)
  const [orphans, setOrphans]       = useState<OrphanDoc[] | null>(null)
  const [scanning, setScanning]     = useState(false)
  const [scanError, setScanError]   = useState<string | null>(null)
  const [selected, setSelected]     = useState<Set<number>>(new Set())
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const [deleted, setDeleted]       = useState<number | null>(null)
  const [retrying, setRetrying]     = useState(false)
  const [retryResult, setRetryResult] = useState<number | null>(null)

  async function handleRetryFailed() {
    setRetrying(true)
    setRetryResult(null)
    try {
      const result = await retryFailedJobs()
      setRetryResult(result.retried)
      setTimeout(() => setRetryResult(null), 5000)
    } catch {
      // Fail silently or fallback
    } finally {
      setRetrying(false)
    }
  }

  async function handleSync() {
    setSyncing(true)
    setSyncDone(false)
    try {
      await triggerScan()
      setSyncDone(true)
      setTimeout(() => setSyncDone(false), 4000)
    } finally {
      setSyncing(false)
    }
  }

  const { data: settings } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: fetchAdminSettings,
  })

  async function handleScan() {
    setScanning(true)
    setScanError(null)
    setOrphans(null)
    setSelected(new Set())
    setConfirming(false)
    setDeleted(null)
    try {
      const result = await fetchOrphans()
      setOrphans(result.orphans)
    } catch {
      setScanError('Scan failed — check that the corpus is mounted and try again.')
    } finally {
      setScanning(false)
    }
  }

  function toggleAll() {
    if (!orphans) return
    if (selected.size === orphans.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(orphans.map(o => o.id)))
    }
  }

  function toggle(id: number) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleConfirmed() {
    setDeleting(true)
    try {
      const result = await purgeOrphans([...selected])
      setDeleted(result.deleted)
      setOrphans(prev => prev?.filter(o => !selected.has(o.id)) ?? null)
      setSelected(new Set())
      setConfirming(false)
    } catch {
      setScanError('Delete failed — please try again.')
      setConfirming(false)
    } finally {
      setDeleting(false)
    }
  }

  const allSelected = !!orphans && orphans.length > 0 && selected.size === orphans.length

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Admin</h1>
        <p className="text-sm text-slate-400 mt-0.5">Catalog maintenance and cleanup tools.</p>
      </div>

      {/* Preserve catalog status banner */}
      {settings && (
        <div className={`flex items-start gap-3 rounded-xl border p-4 ${
          settings.preserve_catalog
            ? 'bg-emerald-50 border-emerald-200'
            : 'bg-amber-50 border-amber-200'
        }`}>
          {settings.preserve_catalog
            ? <ShieldCheck size={18} className="text-emerald-600 shrink-0 mt-0.5" />
            : <ShieldOff   size={18} className="text-amber-600  shrink-0 mt-0.5" />
          }
          <div>
            <p className={`text-sm font-semibold ${settings.preserve_catalog ? 'text-emerald-800' : 'text-amber-800'}`}>
              {settings.preserve_catalog
                ? 'Preserve catalog is ON'
                : 'Preserve catalog is OFF'}
            </p>
            <p className={`text-xs mt-0.5 ${settings.preserve_catalog ? 'text-emerald-700' : 'text-amber-700'}`}>
              {settings.preserve_catalog
                ? 'The scanner never removes documents automatically, even if source files are deleted or the NAS goes offline. Use the tool below to manually clean up orphaned entries.'
                : 'The scanner will automatically remove documents from the index after they have been absent for the configured MISS_THRESHOLD scans. Set PRESERVE_CATALOG=true in .env to disable this.'}
            </p>
          </div>
        </div>
      )}

      {/* Force sync */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-slate-800 text-sm flex items-center gap-2">
              <ScanSearch size={15} className="text-slate-400" />
              Force sync
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              Trigger an immediate corpus scan without waiting for the next scheduled interval.
            </p>
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-700 transition-colors font-medium disabled:opacity-50 shrink-0"
          >
            {syncing
              ? <Loader2 size={14} className="animate-spin" />
              : <RefreshCw size={14} />}
            {syncing ? 'Triggering…' : 'Sync now'}
          </button>
        </div>
        {syncDone && (
          <div className="px-5 pb-4">
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              Scan triggered — the scanner will pick up new and changed files within seconds.
            </p>
          </div>
        )}
      </div>

      {/* Retry failed jobs */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-slate-800 text-sm flex items-center gap-2">
              <RefreshCw size={15} className="text-slate-400" />
              Retry failed jobs
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              Re-queue all documents currently in the 'error' state to retry text extraction and OCR.
            </p>
          </div>
          <button
            onClick={handleRetryFailed}
            disabled={retrying}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-slate-800 text-white hover:bg-slate-700 transition-colors font-medium disabled:opacity-50 shrink-0"
          >
            {retrying
              ? <Loader2 size={14} className="animate-spin" />
              : <RefreshCw size={14} />}
            {retrying ? 'Retrying…' : 'Retry failed'}
          </button>
        </div>
        {retryResult !== null && (
          <div className="px-5 pb-4">
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              Re-queued {retryResult} failed job{retryResult !== 1 ? 's' : ''} successfully.
            </p>
          </div>
        )}
      </div>

      {/* Orphan cleaner */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="px-5 py-4 border-b border-slate-200">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                <FileX size={15} className="text-slate-400" />
                Orphaned files
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Files present in the search index but no longer found on disk.
              </p>
            </div>
            <button
              onClick={handleScan}
              disabled={scanning}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-slate-800 text-white hover:bg-slate-700 transition-colors font-medium disabled:opacity-50 shrink-0"
            >
              {scanning
                ? <Loader2 size={14} className="animate-spin" />
                : <RefreshCw size={14} />}
              {scanning ? 'Checking…' : orphans !== null ? 'Re-check' : 'Check for orphans'}
            </button>
          </div>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {scanError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {scanError}
            </div>
          )}

          {deleted !== null && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700 font-medium">
              Deleted {deleted} document{deleted !== 1 ? 's' : ''} from the index.
            </div>
          )}

          {orphans === null && !scanning && (
            <p className="text-sm text-slate-400 text-center py-6">
              Click <strong>Scan now</strong> to check for orphaned catalog entries.
            </p>
          )}

          {orphans !== null && orphans.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-6 flex flex-col items-center gap-2">
              <ShieldCheck size={24} className="text-emerald-400" />
              No orphaned files — everything in the index exists on disk.
            </p>
          )}

          {orphans !== null && orphans.length > 0 && (
            <>
              {/* Select-all header */}
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  {allSelected ? 'Deselect all' : `Select all (${orphans.length})`}
                </label>
                {selected.size > 0 && !confirming && (
                  <button
                    onClick={() => setConfirming(true)}
                    disabled={deleting}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-red-600 text-white hover:bg-red-700 transition-colors font-medium disabled:opacity-50"
                  >
                    <Trash2 size={13} />
                    Delete selected ({selected.size})
                  </button>
                )}
              </div>

              {/* Confirm flow */}
              {confirming && (
                <ConfirmDelete
                  count={selected.size}
                  onConfirmed={handleConfirmed}
                  onCancel={() => setConfirming(false)}
                />
              )}

              {/* File list */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                {orphans.map((doc, i) => {
                  const name = doc.path.split('/').pop() ?? doc.path
                  const dir  = doc.path.includes('/')
                    ? doc.path.slice(0, doc.path.lastIndexOf('/'))
                    : ''
                  return (
                    <label
                      key={doc.id}
                      className={`flex items-center gap-3 px-4 py-3 cursor-pointer select-none transition-colors ${
                        selected.has(doc.id) ? 'bg-red-50' : 'hover:bg-slate-50'
                      } ${i > 0 ? 'border-t border-slate-200' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(doc.id)}
                        onChange={() => toggle(doc.id)}
                        className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-500 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-800 font-medium truncate">{name}</p>
                        {dir && (
                          <p className="text-xs text-slate-400 truncate">{dir}</p>
                        )}
                      </div>
                      <div className="shrink-0 flex items-center gap-3 text-xs text-slate-400">
                        {doc.extraction_count > 0 && (
                          <span>{doc.extraction_count} page{doc.extraction_count !== 1 ? 's' : ''} extracted</span>
                        )}
                        <span className={`px-1.5 py-0.5 rounded font-medium ${
                          doc.status === 'done'  ? 'bg-emerald-100 text-emerald-700' :
                          doc.status === 'error' ? 'bg-red-100 text-red-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>{doc.status}</span>
                      </div>
                    </label>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
