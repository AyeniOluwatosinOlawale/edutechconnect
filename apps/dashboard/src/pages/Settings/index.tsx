import { NavLink, Outlet } from 'react-router-dom'

const tabs = [
  { to: '/settings/widget', label: 'Widget' },
  { to: '/settings/agents', label: 'Agents' },
  { to: '/settings/tags', label: 'Tags' },
  { to: '/settings/canned', label: 'Canned Responses' },
  { to: '/settings/knowledge-base', label: '✨ Knowledge Base' },
  { to: '/settings/integrations', label: 'Integrations' },
]

export default function Settings() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="border-b border-slate-200 bg-white px-6 pt-4">
        <h1 className="text-lg font-semibold text-slate-800 mb-4">Settings</h1>
        <nav className="flex gap-0">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? 'border-brand-500 text-brand-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="flex-1 overflow-auto p-6">
        <Outlet />
      </div>
    </div>
  )
}
