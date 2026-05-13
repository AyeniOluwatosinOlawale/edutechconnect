import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { useAuthStore } from './stores/authStore'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Inbox from './pages/Inbox'
import Visitors from './pages/Visitors'
import History from './pages/History'
import Contacts from './pages/Contacts'
import Reports from './pages/Reports'
import Settings from './pages/Settings/index'
import WidgetSettings from './pages/Settings/WidgetSettings'
import CannedResponses from './pages/Settings/CannedResponses'
import Integrations from './pages/Settings/Integrations'
import KnowledgeBase from './pages/Settings/KnowledgeBase'

function RequireAuth({ children }: { children: React.ReactElement }) {
  const { user, loading } = useAuthStore()
  if (loading) return <div className="flex items-center justify-center h-screen text-slate-400 text-sm">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  const { setUser, setAgent, setLoading } = useAuthStore()

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        const { data } = await supabase
          .from('agents')
          .select('*')
          .eq('id', session.user.id)
          .single()
        setAgent(data)
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        const { data } = await supabase.from('agents').select('*').eq('id', session.user.id).single()
        setAgent(data)
      } else {
        setAgent(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [setUser, setAgent, setLoading])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Dashboard />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/inbox" replace />} />
          <Route path="inbox" element={<Inbox />} />
          <Route path="visitors" element={<Visitors />} />
          <Route path="history" element={<History />} />
          <Route path="contacts" element={<Contacts />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />}>
            <Route index element={<Navigate to="/settings/widget" replace />} />
            <Route path="widget" element={<WidgetSettings />} />
            <Route path="canned" element={<CannedResponses />} />
            <Route path="knowledge-base" element={<KnowledgeBase />} />
            <Route path="integrations" element={<Integrations />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
