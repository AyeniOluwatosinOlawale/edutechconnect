import { Outlet } from 'react-router-dom'
import { Sidebar } from '../components/layout/Sidebar'

export default function Dashboard() {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar />
      <main className="flex-1 flex overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
