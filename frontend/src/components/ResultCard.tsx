import { Download, Eye, FileText, ScrollText } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { SearchResult } from '../api/client'
import { downloadFile } from '../api/client'
import PathBreadcrumb from './PathBreadcrumb'

interface Props {
  result:  SearchResult
  onOpen?: (path: string) => void
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function fileName(path: string) {
  return path.split('/').pop() ?? path
}

export default function ResultCard({ result, onOpen }: Props) {
  const navigate = useNavigate()
  const name = fileName(result.path)

  return (
    <article className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow p-5 flex gap-4">
      {/* Icon */}
      <div className="shrink-0 mt-0.5">
        <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center">
          <FileText size={18} className="text-indigo-500" />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        {/* Path + actions */}
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="min-w-0">
            <p className="font-semibold text-slate-800 truncate" title={result.path}>
              {name}
            </p>
            <PathBreadcrumb path={result.path} includeFile className="mt-0.5" />
          </div>
          <div className="shrink-0 flex items-center gap-1.5">
            {onOpen && (
              <button
                onClick={() => onOpen(result.path)}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors font-medium"
                title="Open preview"
              >
                <Eye size={13} />
                Open
              </button>
            )}
            <button
              onClick={() => navigate(`/docs/${result.doc_id}/text`)}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors font-medium"
              title="View / edit extracted text"
            >
              <ScrollText size={13} />
              Text
            </button>
            <button
              onClick={() => downloadFile(result.path, name)}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors font-medium"
              title="Download original"
            >
              <Download size={13} />
              Download
            </button>
          </div>
        </div>

        {/* Snippet — safe HTML from backend (_safe_snippet escapes all chars except <mark>) */}
        {result.snippet ? (
          <p
            className="text-sm text-slate-600 leading-relaxed mt-2"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: result.snippet }}
          />
        ) : null}

        {/* Metadata */}
        <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
          {result.ocr_completed_at && (
            <span>OCR: {formatDate(result.ocr_completed_at)}</span>
          )}
          <span>Updated: {formatDate(result.updated_at)}</span>
          <span className="font-mono opacity-60">score {result.rank.toFixed(4)}</span>
        </div>
      </div>
    </article>
  )
}
