import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, CheckCircle2, Clock, FileText, Loader2, RefreshCw, Zap } from 'lucide-react'
import { fetchStatus } from '../api/client'
import type { StatusCount } from '../api/client'

const STATUS_META: Record<string, { label: string; color: string; icon: ReactNode }> = {
  done:       { label: 'Done',       color: 'text-emerald-600 bg-emerald-50 border-emerald-200', icon: <CheckCircle2 size={20} /> },
  pending:    { label: 'Pending',    color: 'text-amber-600  bg-amber-50  border-amber-200',  icon: <Clock size={20} /> },
  processing: { label: 'Processing', color: 'text-blue-600   bg-blue-50   border-blue-200',   icon: <Zap size={20} /> },
  error:      { label: 'Error',      color: 'text-red-600    bg-red-50    border-red-200',     icon: <AlertCircle size={20} /> },
}

function StatCard({ count }: { count: StatusCount }) {
  const meta = STATUS_META[count.status] ?? {
    label: count.status,
    color: 'text-slate-600 bg-slate-50 border-slate-200',
    icon: <FileText size={20} />,
  }
  return (
    <div className={`rounded-xl border p-5 flex items-center gap-4 ${meta.color}`}>
      <div className="opacity-80">{meta.icon}</div>
      <div>
        <p className="text-2xl font-bold">{count.count.toLocaleString()}</p>
        <p className="text-sm font-medium opacity-80">{meta.label}</p>
      </div>
    </div>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export default function StatusPage() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['status'],
    queryFn: fetchStatus,
    refetchInterval: 15_000,   // auto-refresh every 15 s
  })

  return (
    <div className="flex flex-col gap-8">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Ingestion status</h1>
          <p className="text-sm text-slate-500 mt-0.5">Refreshes every 15 seconds</p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 size={18} className="animate-spin" />
          Loading…
        </div>
      )}

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          Failed to load status — please try again.
        </div>
      )}

      {data && (
        <>
          {/* ── Totals ────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-2xl font-bold text-slate-800">
                {data.total_documents.toLocaleString()}
              </p>
              <p className="text-sm text-slate-500 mt-0.5">Total documents</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-2xl font-bold text-slate-800">
                {data.total_extractions.toLocaleString()}
              </p>
              <p className="text-sm text-slate-500 mt-0.5">Total extractions</p>
            </div>
          </div>

          {/* ── Per-status cards ──────────────────────────────────────── */}
          {data.counts.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {data.counts.map((c) => (
                <StatCard key={c.status} count={c} />
              ))}
            </div>
          )}

          {/* ── Recent errors ─────────────────────────────────────────── */}
          {data.recent_errors.length > 0 && (
            <div>
              <h2 className="text-base font-semibold text-slate-800 mb-3">
                Recent errors ({data.recent_errors.length})
              </h2>
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium text-slate-600">Path</th>
                      <th className="text-left px-4 py-2.5 font-medium text-slate-600">Error</th>
                      <th className="text-left px-4 py-2.5 font-medium text-slate-600 whitespace-nowrap">
                        Updated
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.recent_errors.map((e) => (
                      <tr key={e.id} className="hover:bg-red-50 transition-colors">
                        <td
                          className="px-4 py-3 font-mono text-xs text-slate-700 max-w-[240px] truncate"
                          title={e.path}
                        >
                          {e.path}
                        </td>
                        <td
                          className="px-4 py-3 text-red-600 max-w-[360px] truncate"
                          title={e.error_detail ?? ''}
                        >
                          {e.error_detail ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                          {formatDate(e.updated_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {data.recent_errors.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
              <CheckCircle2 size={16} />
              No errors — all indexed documents processed successfully.
            </div>
          )}
        </>
      )}
    </div>
  )
}
