import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import BrowsePage from './pages/BrowsePage'
import SearchPage from './pages/SearchPage'
import StatusPage from './pages/StatusPage'
import AdminPage from './pages/AdminPage'
import TextEditorPage from './pages/TextEditorPage'

function RequireAuth() {
  return localStorage.getItem('token') ? (
    <Outlet />
  ) : (
    <Navigate to="/login" replace />
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<Layout />}>
            <Route index element={<SearchPage />} />
            <Route path="browse" element={<BrowsePage />} />
            <Route path="status" element={<StatusPage />} />
            <Route path="docs/:docId/text" element={<TextEditorPage />} />
            <Route path="admin" element={<AdminPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
