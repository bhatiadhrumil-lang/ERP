import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Boxes,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PhoneCall,
  Shield,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { NAV_ITEMS } from '../utils/constants';
import { initials } from '../utils/format';
import { RoleBadge } from '../components/ui/Badge';

const ICONS: Record<string, typeof Users> = {
  'layout-dashboard': LayoutDashboard,
  users: Users,
  'phone-call': PhoneCall,
  package: Package,
  boxes: Boxes,
  'file-text': FileText,
  shield: Shield,
};

export function DashboardLayout() {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  const visibleItems = NAV_ITEMS.filter((item) => user && item.roles.includes(user.role));
  const pageTitle = visibleItems.find((i) => location.pathname.startsWith(i.to))?.label ?? 'Mini ERP';

  const sidebar = (
    <aside className="flex h-full w-60 flex-col bg-slate-900 text-slate-300">
      <div className="flex items-center gap-2.5 px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 font-bold text-white">E</div>
        <div>
          <p className="text-sm font-semibold text-white">Mini ERP</p>
          <p className="text-[11px] text-slate-400">Sales &amp; Inventory</p>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
        {visibleItems.map((item) => {
          const Icon = ICONS[item.icon] ?? LayoutDashboard;
          const active = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                active ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>
      <div className="border-t border-slate-800 px-5 py-3 text-[11px] text-slate-500">Mini ERP · Local Dev</div>
    </aside>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">{sidebar}</div>

      {/* Mobile drawer */}
      {sidebarOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setSidebarOpen(false)} />
          <div className="absolute inset-y-0 left-0">{sidebar}</div>
          <button
            className="absolute left-[17rem] top-3 rounded-full bg-white p-1.5 text-slate-600 shadow"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-sm font-semibold text-slate-700">{pageTitle}</h1>
          </div>
          {user ? (
            <div className="flex items-center gap-3">
              <RoleBadge role={user.role} />
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
                  {initials(user.name)}
                </div>
                <div className="hidden sm:block">
                  <p className="text-xs font-medium text-slate-700">{user.name}</p>
                  <p className="text-[11px] text-slate-400">{user.email}</p>
                </div>
              </div>
              <button
                onClick={logout}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : null}
        </header>
        <main className="flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}