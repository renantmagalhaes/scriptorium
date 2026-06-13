import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { BookOpen, FolderOpen, LayoutDashboard, LogOut, Search, Settings } from 'lucide-react'

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

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            title="Log out"
          >
            <LogOut size={14} />
            <span className="hidden md:inline">Logout</span>
          </button>
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
