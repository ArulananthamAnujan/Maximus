import { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, LogOut, Bell, ChevronDown, ExternalLink, ChevronRight } from 'lucide-react';
import DarkModeToggle from '../ui/DarkModeToggle';
import { useAuth } from '../../contexts/AuthContext';
import MaximusLogo from '../ui/MaximusLogo';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string | number;
  group?: string;
}

interface DashboardLayoutProps {
  navItems: NavItem[];
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}

export default function DashboardLayout({ navItems, children, title, subtitle }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
    : profile?.email?.[0]?.toUpperCase() || '?';

  const groups = navItems.reduce<Record<string, NavItem[]>>((acc, item) => {
    const g = item.group || '';
    if (!acc[g]) acc[g] = [];
    acc[g].push(item);
    return acc;
  }, {});

  const isActive = (href: string) =>
    location.pathname === href || (href !== '/student' && href !== '/teacher' && href !== '/admin' && location.pathname.startsWith(href + '/'));

  const SidebarContent = ({ mobile = false }: { mobile?: boolean }) => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 h-[88px] border-b border-slate-200 dark:border-navy-700 shrink-0 bg-white dark:bg-navy-900">
        <Link to="/" className="flex items-center min-w-0 flex-1">
            <MaximusLogo height={64} variant="dark" />
          </Link>
        {mobile && (
          <button onClick={() => setSidebarOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-navy-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 overflow-y-auto px-3 space-y-5">
        {Object.entries(groups).map(([group, items]) => (
          <div key={group}>
            {group && (
              <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-2 mb-1.5">{group}</p>
            )}
            <div className="space-y-0.5">
              {items.map(item => {
                const active = isActive(item.href);
                return (
                  <Link key={item.href + item.label} to={item.href}
                    className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                      active
                        ? 'bg-sky-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-300 hover:text-sky-700 hover:bg-sky-50 dark:hover:bg-sky-900/20 dark:hover:text-sky-300'
                    }`}>
                    <item.icon className={`w-4 h-4 shrink-0 transition-colors ${active ? 'text-white' : 'text-slate-400 dark:text-slate-500 group-hover:text-sky-600 dark:group-hover:text-sky-400'}`} />
                    <span className="truncate flex-1">{item.label}</span>
                    {item.badge !== undefined && (
                      <span className={`ml-auto text-xs px-1.5 py-0.5 rounded-full font-bold min-w-[20px] text-center leading-none ${active ? 'bg-white/20 text-white' : 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'}`}>
                        {item.badge}
                      </span>
                    )}
                    {active && <ChevronRight className="w-3.5 h-3.5 text-white/60 shrink-0" />}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="p-3 border-t border-slate-200 dark:border-navy-700 shrink-0">
        <div className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-navy-700 transition-colors cursor-default">
          <div className="w-9 h-9 rounded-full bg-sky-600 flex items-center justify-center text-sm font-bold text-white shrink-0 ring-2 ring-sky-200 dark:ring-sky-800">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800 dark:text-white truncate leading-tight">{profile?.full_name || 'User'}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 truncate capitalize">{profile?.role}</p>
          </div>
          <button onClick={handleSignOut} title="Sign out"
            className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0">
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );

  const isStudent = profile?.role === 'student';
  const mobileNavItems = isStudent ? navItems.slice(0, 5) : [];

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-navy-950 overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-60 bg-white dark:bg-navy-900 shrink-0 shadow-md border-r border-slate-200 dark:border-navy-700">
        <SidebarContent />
      </aside>

      {/* Mobile overlay sidebar */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="relative z-10 w-64 bg-white dark:bg-navy-900 flex flex-col shadow-2xl animate-slide-in border-r border-slate-200 dark:border-navy-700">
            <SidebarContent mobile />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top header */}
        <header className="h-14 bg-white dark:bg-navy-800 border-b border-slate-200 dark:border-navy-700 flex items-center gap-3 px-4 shrink-0 shadow-sm">
          <button onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-sky-50 dark:hover:bg-navy-700 rounded-lg transition-colors">
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-slate-900 dark:text-white truncate leading-tight">{title}</h1>
            {subtitle && (
              <p className="text-xs text-slate-400 dark:text-slate-500 hidden sm:block truncate leading-tight">{subtitle}</p>
            )}
          </div>

          <div className="flex items-center gap-1">
            <DarkModeToggle />

            <button className="relative p-2 text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-sky-50 dark:hover:bg-navy-700 rounded-lg transition-colors">
              <Bell className="w-4.5 h-4.5" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-sky-600 rounded-full ring-2 ring-white dark:ring-navy-800" />
            </button>

            <div className="relative" ref={menuRef}>
              <button onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg hover:bg-sky-50 dark:hover:bg-navy-700 transition-colors">
                <div className="w-7 h-7 rounded-full bg-sky-600 flex items-center justify-center text-xs font-bold text-white">
                  {initials}
                </div>
                <span className="hidden sm:block text-sm font-medium text-slate-700 dark:text-slate-200 max-w-[100px] truncate">
                  {profile?.full_name?.split(' ')[0] || 'User'}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-52 bg-white dark:bg-navy-800 rounded-xl shadow-xl border border-slate-200 dark:border-navy-700 py-1.5 z-50 animate-fade-in">
                  <div className="px-4 py-3 border-b border-slate-100 dark:border-navy-700">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{profile?.full_name || 'User'}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{profile?.email}</p>
                    <span className="inline-flex mt-1.5 text-xs bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 px-2 py-0.5 rounded-full font-medium capitalize">
                      {profile?.role}
                    </span>
                  </div>
                  <Link to="/" onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-navy-700 transition-colors">
                    <ExternalLink className="w-4 h-4 text-slate-400" /> View Website
                  </Link>
                  <div className="border-t border-slate-100 dark:border-navy-700 mt-1 pt-1">
                    <button onClick={handleSignOut}
                      className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                      <LogOut className="w-4 h-4" /> Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className={`flex-1 overflow-y-auto bg-slate-50 dark:bg-navy-950 ${isStudent ? 'pb-16 lg:pb-0' : ''}`}>
          <div className="p-4 sm:p-6 max-w-screen-2xl mx-auto w-full">
            {children}
          </div>
        </main>

        {/* Mobile bottom navigation for students */}
        {isStudent && mobileNavItems.length > 0 && (
          <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-navy-800 border-t border-slate-200 dark:border-navy-700 flex items-stretch shadow-lg">
            {mobileNavItems.map(item => {
              const active = isActive(item.href);
              return (
                <Link key={item.href + item.label} to={item.href}
                  className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 px-1 transition-colors ${
                    active ? 'text-sky-600 dark:text-sky-400' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}>
                  <item.icon className="w-5 h-5 shrink-0" />
                  <span className="text-[10px] font-medium leading-tight truncate max-w-full">{item.label}</span>
                  {active && <span className="absolute bottom-0 w-8 h-0.5 bg-sky-600 rounded-t-full" />}
                </Link>
              );
            })}
          </nav>
        )}
      </div>
    </div>
  );
}
