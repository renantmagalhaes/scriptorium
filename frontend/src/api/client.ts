import axios from 'axios'

export const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  },
)

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SearchResult {
  doc_id: number
  path: string
  status: string
  ocr_completed_at: string | null
  updated_at: string
  snippet: string  // safe HTML with <mark> highlights
  rank: number
}

export interface SearchResponse {
  results: SearchResult[]
  total: number
  query: string
  page: number
  limit: number
}

export interface StatusCount {
  status: string
  count: number
}

export interface ErrorEntry {
  id: number
  path: string
  error_detail: string | null
  updated_at: string
}

export interface StatusResponse {
  counts: StatusCount[]
  recent_errors: ErrorEntry[]
  total_documents: number
  total_extractions: number
}

// ─── API calls ────────────────────────────────────────────────────────────────

export interface BrowseItem {
  id: number
  path: string
  status: string
}

export interface BrowseResponse {
  items: BrowseItem[]
}

export interface ExtractionPage {
  id: number
  page: number | null
  text: string
  original_text: string | null
}

export interface ExtractionListResponse {
  doc_id: number
  path: string
  pages: ExtractionPage[]
}

export const fetchExtractions = (docId: number) =>
  api.get<ExtractionListResponse>(`/extractions/${docId}`).then((r) => r.data)

export const updateExtraction = (extractionId: number, text: string) =>
  api.patch<ExtractionPage>(`/extractions/${extractionId}`, { text }).then((r) => r.data)

export const searchDocs = (q: string, page = 1, limit = 20, signal?: AbortSignal) =>
  api
    .get<SearchResponse>('/search', { params: { q, page, limit }, signal })
    .then((r) => r.data)

export const fetchStatus = () =>
  api.get<StatusResponse>('/status').then((r) => r.data)

export const fetchBrowse = () =>
  api.get<BrowseResponse>('/browse').then((r) => r.data)

export const loginRequest = (username: string, password: string) => {
  const form = new URLSearchParams()
  form.append('username', username)
  form.append('password', password)
  return api
    .post<{ access_token: string; token_type: string }>('/auth/login', form, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    .then((r) => r.data)
}

export interface AdminSettings {
  preserve_catalog: boolean
}

export interface OrphanDoc {
  id: number
  path: string
  status: string
  ocr_completed_at: string | null
  extraction_count: number
}

export interface OrphansResponse {
  orphans: OrphanDoc[]
  total: number
}

export const triggerScan = () =>
  api.post<{ triggered: boolean }>('/admin/scan').then(r => r.data)

export const fetchAdminSettings = () =>
  api.get<AdminSettings>('/admin/settings').then(r => r.data)

export const fetchOrphans = () =>
  api.get<OrphansResponse>('/admin/orphans').then(r => r.data)

export const purgeOrphans = (ids: number[]) =>
  api.post<{ deleted: number }>('/admin/purge', { ids }).then(r => r.data)

/** Encode a corpus-relative path for use in URLs (encode segments, keep slashes). */
export const encPath = (path: string) =>
  path.split('/').map(encodeURIComponent).join('/')

/** URL for inline browser rendering — uses ?token= so <iframe>/<img> work. */
export const viewUrl = (path: string) => {
  const token = localStorage.getItem('token') ?? ''
  return `/api/files/view/${encPath(path)}?token=${encodeURIComponent(token)}`
}

/** Programmatic download via axios so the auth header is included. */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const resp = await api.get<Blob>(`/files/${encPath(path)}`, { responseType: 'blob' })
  const url = URL.createObjectURL(resp.data)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
