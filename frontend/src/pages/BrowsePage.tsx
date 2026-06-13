import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronDown, ChevronRight,
  File, FileText, Folder, FolderOpen, Image, Loader2, ScrollText, Search, X,
} from 'lucide-react'
import { fetchBrowse } from '../api/client'
import type { BrowseItem } from '../api/client'
import FileViewerModal from '../components/FileViewerModal'
import PathBreadcrumb from '../components/PathBreadcrumb'

// ─── Tree model ───────────────────────────────────────────────────────────────

interface TreeNode {
  name:     string
  isDir:    boolean
  path:     string
  id?:      number
  status?:  string
  children: TreeNode[]
}

function buildTree(items: BrowseItem[]): TreeNode[] {
  const root: TreeNode = { name: '', isDir: true, path: '', children: [] }

  for (const item of items) {
    const parts = item.path.split('/')
    let node = root

    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i]
      let dir = node.children.find((c) => c.isDir && c.name === seg)
      if (!dir) {
        dir = { name: seg, isDir: true, path: parts.slice(0, i + 1).join('/'), children: [] }
        node.children.push(dir)
      }
      node = dir
    }

    node.children.push({
      name:     parts[parts.length - 1],
      isDir:    false,
      path:     item.path,
      id:       item.id,
      status:   item.status,
      children: [],
    })
  }

  function sort(n: TreeNode) {
    n.children.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
    n.children.forEach(sort)
  }
  sort(root)

  return root.children
}

// ─── File icon ────────────────────────────────────────────────────────────────

function FileIcon({ name }: { name: string }) {
  const e = (name.split('.').pop() ?? '').toLowerCase()
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff', 'tif'].includes(e))
    return <Image size={14} className="text-emerald-500 shrink-0" />
  if (['pdf', 'docx', 'txt', 'md', 'rst', 'log', 'csv', 'tsv', 'nfo', 'xlsx', 'xls', 'ods'].includes(e))
    return <FileText size={14} className="text-indigo-400 shrink-0" />
  return <File size={14} className="text-slate-400 shrink-0" />
}

// ─── Status dot ───────────────────────────────────────────────────────────────

const DOT: Record<string, string> = {
  done:       'bg-emerald-400',
  pending:    'bg-amber-400',
  processing: 'bg-blue-400',
  error:      'bg-red-400',
}

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${DOT[status] ?? 'bg-slate-300'}`}
      title={status}
    />
  )
}

// ─── Tree row (recursive) ─────────────────────────────────────────────────────

interface RowProps {
  node:   TreeNode
  level:  number
  onOpen: (path: string, id?: number) => void
}

function TreeRow({ node, level, onOpen }: RowProps) {
  const [open, setOpen] = useState(true)
  const pad = level * 16

  if (node.isDir) {
    return (
      <>
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 w-full text-left py-1 pr-2 rounded hover:bg-slate-100 transition-colors"
          style={{ paddingLeft: `${pad + 8}px` }}
        >
          {open
            ? <ChevronDown  size={13} className="text-slate-400 shrink-0" />
            : <ChevronRight size={13} className="text-slate-400 shrink-0" />}
          {open
            ? <FolderOpen size={14} className="text-amber-500 shrink-0" />
            : <Folder     size={14} className="text-amber-500 shrink-0" />}
          <span className="text-sm font-medium text-slate-700 truncate">{node.name}</span>
          <span className="ml-1 text-xs text-slate-400 shrink-0">({node.children.length})</span>
        </button>
        {open && node.children.map((child) => (
          <TreeRow key={child.path} node={child} level={level + 1} onOpen={onOpen} />
        ))}
      </>
    )
  }

  return (
    <button
      onClick={() => onOpen(node.path, node.id)}
      className="flex items-center gap-1.5 w-full text-left py-1 pr-2 rounded hover:bg-slate-100 transition-colors group"
      style={{ paddingLeft: `${pad + 8 + 13 + 6}px` }}
    >
      <FileIcon name={node.name} />
      <span className="text-sm text-slate-600 truncate flex-1 group-hover:text-indigo-600 transition-colors">
        {node.name}
      </span>
      {node.status && <StatusDot status={node.status} />}
    </button>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BrowsePage() {
  const navigate = useNavigate()
  const [viewerFile, setViewerFile]   = useState<{ path: string; id?: number } | null>(null)
  const [filterQuery, setFilterQuery] = useState('')

  const { data, isLoading, isError } = useQuery({
    queryKey:  ['browse'],
    queryFn:   fetchBrowse,
    staleTime: 60_000,
  })

  const tree = data ? buildTree(data.items) : []

  const q = filterQuery.trim().toLowerCase()
  const filtered = q && data
    ? data.items.filter((item) => item.path.toLowerCase().includes(q))
    : null   // null = show tree, [] = searched but no results

  return (
    <>
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-slate-800">Browse</h1>
          {data && (
            <span className="text-sm text-slate-400">
              {data.items.length} indexed file{data.items.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Filter bar */}
        {data && data.items.length > 0 && (
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="search"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Filter files…"
              className="w-full pl-9 pr-8 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
            />
            {filterQuery && (
              <button
                onClick={() => setFilterQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center gap-2 text-slate-400 py-16">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        )}

        {isError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
            Failed to load file tree.
          </div>
        )}

        {data && tree.length === 0 && (
          <div className="text-center py-16 text-slate-400 text-sm">No indexed files yet.</div>
        )}

        {/* Filtered flat list */}
        {filtered !== null && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-2 select-none">
            {filtered.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">
                No files match &ldquo;{filterQuery.trim()}&rdquo;
              </p>
            ) : filtered.map((item) => {
              const name = item.path.split('/').pop() ?? item.path
              return (
                <div
                  key={item.path}
                  className="flex items-center gap-2 px-3 py-2 rounded hover:bg-slate-100 transition-colors group"
                >
                  <button
                    onClick={() => setViewerFile({ path: item.path, id: item.id })}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left"
                  >
                    <FileIcon name={name} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-700 truncate group-hover:text-indigo-600 transition-colors">
                        {name}
                      </p>
                      <PathBreadcrumb path={item.path} includeFile className="mt-0.5" />
                    </div>
                  </button>
                  <div className="shrink-0 flex items-center gap-1.5">
                    <button
                      onClick={() => navigate(`/docs/${item.id}/text`)}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors md:opacity-0 md:group-hover:opacity-100 opacity-100"
                      title="View / edit extracted text"
                    >
                      <ScrollText size={11} />
                      Text
                    </button>
                    <StatusDot status={item.status} />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Full tree */}
        {filtered === null && tree.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-2 select-none">
            {tree.map((node) => (
              <TreeRow key={node.path} node={node} level={0} onOpen={(path, id) => setViewerFile({ path, id })} />
            ))}
          </div>
        )}
      </div>

      <FileViewerModal path={viewerFile?.path ?? null} docId={viewerFile?.id ?? null} onClose={() => setViewerFile(null)} />
    </>
  )
}
