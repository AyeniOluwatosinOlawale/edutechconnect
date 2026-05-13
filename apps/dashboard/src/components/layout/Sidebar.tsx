import { NavLink } from 'react-router-dom'
import { MessageSquare, Users, History, BookUser, BarChart3, Settings, LogOut } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { Avatar } from '../shared/Avatar'
import { StatusDot } from '../shared/StatusDot'
import { useNotifications } from '../../hooks/useNotifications'

const nav = [
  { to: '/inbox', icon: MessageSquare, label: 'Inbox' },
  { to: '/visitors', icon: Users, label: 'Visitors' },
  { to: '/history', icon: History, label: 'History' },
  { to: '/contacts', icon: BookUser, label: 'Contacts' },
  { to: '/reports', icon: BarChart3, label: 'Reports' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export function Sidebar() {
  const { agent, logout } = useAuthStore()
  const { unreadCount } = useNotifications()

  return (
    <aside className="w-16 bg-brand-600 flex flex-col items-center py-4 gap-1 flex-shrink-0">
      <div className="mb-4">
        <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center text-white font-bold text-sm">
          EC
        </div>
      </div>

      {nav.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          title={label}
          className={({ isActive }) =>
            `relative w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
              isActive ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white hover:bg-white/10'
            }`
          }
        >
          <Icon size={20} />
          {to === '/inbox' && unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-400 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </NavLink>
      ))}

      <div className="mt-auto flex flex-col items-center gap-3">
        {agent && (
          <div className="relative">
            <Avatar name={agent.display_name} url={agent.avatar_url} size="sm" />
            <span className="absolute -bottom-0.5 -right-0.5">
              <StatusDot status={agent.status} />
            </span>
          </div>
        )}
        <button
          onClick={logout}
          title="Sign out"
          className="w-10 h-10 rounded-xl flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        >
          <LogOut size={18} />
        </button>
      </div>
    </aside>
  )
}
