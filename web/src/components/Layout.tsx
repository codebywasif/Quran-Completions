import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth';

const nav = [
  { to: '/', label: 'Current Week', end: true },
  { to: '/allocation', label: 'Allocation' },
  { to: '/outbox', label: 'Messages' },
  { to: '/members', label: 'Members' },
  { to: '/history', label: 'History' },
  { to: '/connection', label: 'WhatsApp' },
  { to: '/settings', label: 'Settings' },
];

export default function Layout() {
  const { logout } = useAuth();
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="flex">
        <aside className="sticky top-0 flex h-screen w-60 flex-col border-r border-slate-200 bg-white">
          <div className="px-5 py-5">
            <h1 className="text-lg font-bold text-emerald-700">Quran Completion</h1>
            <p className="text-xs text-slate-400">Moderator dashboard</p>
          </div>
          <nav className="flex-1 space-y-1 px-3">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `block rounded-lg px-3 py-2 text-sm font-medium ${
                    isActive
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="px-3 py-4">
            <button
              onClick={logout}
              className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-100"
            >
              Log out
            </button>
          </div>
        </aside>
        <main className="flex-1 px-8 py-8">
          <div className="mx-auto max-w-5xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
