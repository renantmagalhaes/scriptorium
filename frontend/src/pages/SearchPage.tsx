import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Loader2, SearchIcon } from 'lucide-react'
import { searchDocs } from '../api/client'
import FileViewerModal from '../components/FileViewerModal'
import ResultCard from '../components/ResultCard'

const LIMIT = 20

export default function SearchPage() {
  const [inputValue, setInputValue] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [viewerFile, setViewerFile] = useState<{ path: string; docId?: number } | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce: fire search 350 ms after the user stops typing.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setQuery(inputValue.trim())
      setPage(1)
    }, 350)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [inputValue])

  const { data, isLoading, isError } = useQuery({
    queryKey: ['search', query, page],
    queryFn: ({ signal }) => searchDocs(query, page, LIMIT, signal),
    enabled: query.length >= 2,
    staleTime: 30_000,
  })

  const totalPages = data ? Math.ceil(data.total / LIMIT) : 0

  return (
    <>
    <div className="flex flex-col gap-6">
      {/* ── Search bar ────────────────────────────────────────────────── */}
      <div className="relative">
        <SearchIcon
          size={18}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        />
        <input
          type="search"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Search documents… (phrases, AND/OR, -exclusions, partial words)"
          className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-300 bg-white shadow-sm text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
          autoFocus
        />
        {isLoading && (
          <Loader2
            size={16}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-indigo-500 animate-spin"
          />
        )}
      </div>

      {/* ── Results ───────────────────────────────────────────────────── */}
      {!query && (
        <div className="text-center py-20 text-slate-400 select-none">
          <SearchIcon size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-base">Type to search across your documents</p>
          <p className="text-sm mt-1 opacity-75">Start typing — search fires after 2 characters</p>
        </div>
      )}

      {query && isError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          Search failed — please try again.
        </div>
      )}

      {query && data && data.results.length === 0 && !isLoading && (
        <div className="text-center py-16 text-slate-400 select-none">
          <p className="text-base">No results for &ldquo;{data.query}&rdquo;</p>
          <p className="text-sm mt-1 opacity-75">Try different keywords or check the Status page for indexing errors.</p>
        </div>
      )}

      {data && data.results.length > 0 && (
        <>
          {/* Result count */}
          <p className="text-sm text-slate-500">
            {data.total.toLocaleString()} result{data.total !== 1 ? 's' : ''} for{' '}
            <span className="font-medium text-slate-700">&ldquo;{data.query}&rdquo;</span>
          </p>

          {/* Cards */}
          <div className="flex flex-col gap-3">
            {data.results.map((r) => (
              <ResultCard key={r.doc_id} result={r} onOpen={(path, docId) => setViewerFile({ path, docId })} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm border border-slate-300 bg-white disabled:opacity-40 hover:bg-slate-50 transition-colors"
              >
                <ChevronLeft size={14} />
                Previous
              </button>
              <span className="text-sm text-slate-500">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm border border-slate-300 bg-white disabled:opacity-40 hover:bg-slate-50 transition-colors"
              >
                Next
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </>
      )}
    </div>

    <FileViewerModal path={viewerFile?.path ?? null} docId={viewerFile?.docId ?? null} onClose={() => setViewerFile(null)} />
</>
  )
}
