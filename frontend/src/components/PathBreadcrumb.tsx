interface Props {
  /** Full corpus-relative path, e.g. "docs/reports/file.pdf" */
  path: string
  /** When true, include the filename as the last crumb. Default false. */
  includeFile?: boolean
  className?: string
}

/**
 * Renders a path as styled breadcrumb segments separated by ›.
 * Returns null when there is nothing to show (root-level file, includeFile=false).
 */
export default function PathBreadcrumb({ path, includeFile = false, className = '' }: Props) {
  const parts = path.split('/')
  const segments = includeFile ? parts : parts.slice(0, -1)

  if (segments.length === 0) return null  // root file, dirs-only mode — nothing to show

  return (
    <p
      className={`flex items-center flex-wrap gap-x-0.5 text-xs text-slate-400 min-w-0 ${className}`}
      title={path}
    >
      {segments.map((seg, i) => (
        <span key={i} className="flex items-center gap-x-0.5 min-w-0 shrink-0">
          {i > 0 && <span className="opacity-40 select-none px-0.5">›</span>}
          <span className="truncate">{seg}</span>
        </span>
      ))}
    </p>
  )
}
