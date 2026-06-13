import { useEffect, useState, useRef } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { BookOpen, FolderOpen, LayoutDashboard, LogOut, Search, Settings, Sun, Moon, Sparkles, ChevronDown } from 'lucide-react'

type Theme = 'light' | 'dark' | 'cyber'

function ThemeSelector() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('theme') as Theme
    if (saved === 'dark' || saved === 'cyber' || saved === 'light') {
      return saved
    }
    return 'light'
  })
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const html = document.documentElement
    html.classList.remove('theme-dark', 'theme-cyber')
    if (theme === 'dark') {
      html.classList.add('theme-dark')
    } else if (theme === 'cyber') {
      html.classList.add('theme-cyber')
    }
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const themes: { value: Theme; label: string; icon: React.ReactNode }[] = [
    { value: 'light', label: 'Light', icon: <Sun size={14} className="text-amber-500" /> },
    { value: 'dark', label: 'Dark', icon: <Moon size={14} className="text-slate-400" /> },
    { value: 'cyber', label: 'Cyber', icon: <Sparkles size={14} className="text-cyan-400" /> },
  ]

  const currentTheme = themes.find((t) => t.value === theme) || themes[0]

  return (
    <div className="relative font-sans" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200 transition-colors bg-white font-medium shadow-sm"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        {currentTheme.icon}
        <span className="hidden sm:inline capitalize text-xs font-semibold">{currentTheme.value}</span>
        <ChevronDown size={12} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-32 rounded-lg border border-slate-200 bg-white shadow-lg z-20 py-1 origin-top-right transition-all">
          {themes.map((t) => (
            <button
              key={t.value}
              onClick={() => {
                setTheme(t.value)
                setIsOpen(false)
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                theme === t.value
                  ? 'bg-indigo-50 text-indigo-700 font-semibold'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {t.icon}
              <span className="text-xs font-medium">{t.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Layout() {
  const navigate = useNavigate()

  function handleLogout() {
    localStorage.removeItem('token')
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* ── Navbar ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between md:justify-start gap-6">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 text-indigo-600 font-semibold text-lg shrink-0">
            <BookOpen size={20} />
            <span>Scriptorium</span>
          </Link>

          {/* Nav links (hidden on mobile, visible on desktop) */}
          <nav className="hidden md:flex items-center gap-1 flex-1">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <Search size={14} />
              Search
            </NavLink>
            <NavLink
              to="/browse"
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <FolderOpen size={14} />
              Browse
            </NavLink>
            <NavLink
              to="/status"
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <LayoutDashboard size={14} />
              Status
            </NavLink>
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <Settings size={14} />
              Admin
            </NavLink>
          </nav>

          {/* Actions: Theme Selector & Logout */}
          <div className="flex items-center gap-3 shrink-0">
            <ThemeSelector />
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              title="Log out"
            >
              <LogOut size={14} />
              <span className="hidden md:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Page content ────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8 pb-24 md:pb-8">
        <Outlet />
      </main>

      {/* ── Bottom Navbar for Mobile ─────────────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-slate-200 shadow-lg flex justify-around items-center h-16 md:hidden">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `flex flex-col items-center justify-center w-full h-full text-xs font-medium transition-colors ${
              isActive ? 'text-indigo-600' : 'text-slate-500'
            }`
          }
        >
          <Search size={18} className="mb-0.5" />
          <span>Search</span>
        </NavLink>
        <NavLink
          to="/browse"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center w-full h-full text-xs font-medium transition-colors ${
              isActive ? 'text-indigo-600' : 'text-slate-500'
            }`
          }
        >
          <FolderOpen size={18} className="mb-0.5" />
          <span>Browse</span>
        </NavLink>
        <NavLink
          to="/status"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center w-full h-full text-xs font-medium transition-colors ${
              isActive ? 'text-indigo-600' : 'text-slate-500'
            }`
          }
        >
          <LayoutDashboard size={18} className="mb-0.5" />
          <span>Status</span>
        </NavLink>
        <NavLink
          to="/admin"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center w-full h-full text-xs font-medium transition-colors ${
              isActive ? 'text-indigo-600' : 'text-slate-500'
            }`
          }
        >
          <Settings size={18} className="mb-0.5" />
          <span>Admin</span>
        </NavLink>
      </nav>
    </div>
  )
}
