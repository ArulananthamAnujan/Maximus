import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, User, LogOut, Bell, ChevronDown } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import MaximusLogo from '../ui/MaximusLogo';

export default function PublicHeader() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { user, profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setIsOpen(false);
    setUserMenuOpen(false);
  }, [location]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const navLinks = [
    { label: 'Home', href: '/' },
    { label: 'About Us', href: '/about' },
    { label: 'Our Mission', href: '/our-mission' },
    { label: 'Courses', href: '/courses' },
    { label: 'PTE', href: '/pte' },
    { label: 'Contact', href: '/contact' },
    { label: 'Book Online', href: '/book-online' },
  ];

  const handleDashboard = () => {
    if (profile?.role === 'admin') navigate('/admin');
    else if (profile?.role === 'teacher') navigate('/teacher');
    else navigate('/student');
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const isActive = (href: string) => {
    if (href === '/') return location.pathname === '/';
    return location.pathname.startsWith(href);
  };

  const headerBg = scrolled || isOpen
    ? 'bg-white shadow-md border-b border-slate-200'
    : 'bg-white/95 backdrop-blur-md border-b border-slate-200/80';

  return (
    <header className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${headerBg}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-[88px]">
          <Link to="/" className="flex items-center shrink-0">
            <MaximusLogo height={64} variant="dark" />
          </Link>

          <nav className="hidden lg:flex items-center gap-0.5">
            {navLinks.map(link => (
              <Link
                key={link.href}
                to={link.href}
                className={`px-3.5 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                  isActive(link.href)
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-700 hover:bg-sky-50 hover:text-sky-700'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="hidden lg:flex items-center gap-2 shrink-0">
            <Link
              to="/notifications"
              className={`p-2 rounded-lg transition-all ${
                location.pathname === '/notifications'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-500 hover:bg-sky-50 hover:text-sky-600'
              }`}
              title="Notifications"
            >
              <Bell className="w-5 h-5" />
            </Link>

            {user && profile ? (
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 pl-1 pr-2.5 py-1.5 rounded-lg text-slate-700 hover:bg-sky-50 transition-all"
                >
                  <div className="w-8 h-8 rounded-full bg-sky-600 flex items-center justify-center text-sm font-bold text-white">
                    {(profile.full_name?.[0] || profile.email[0]).toUpperCase()}
                  </div>
                  <span className="text-sm font-semibold max-w-[100px] truncate">
                    {profile.full_name?.split(' ')[0] || 'Account'}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-52 bg-white dark:bg-navy-800 rounded-xl shadow-2xl border border-slate-100 dark:border-navy-700 py-1.5 animate-fade-in z-50">
                    <div className="px-4 py-3 border-b border-slate-100 dark:border-navy-700">
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{profile.full_name || 'User'}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{profile.email}</p>
                      <span className="inline-flex mt-1.5 text-xs bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 px-2 py-0.5 rounded-full font-semibold capitalize">{profile.role}</span>
                    </div>
                    <button onClick={handleDashboard} className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-navy-700 transition-colors">
                      <User className="w-4 h-4 text-slate-400 dark:text-slate-500" /> My Dashboard
                    </button>
                    <div className="border-t border-slate-100 dark:border-navy-700 mt-1 pt-1">
                      <button onClick={handleSignOut} className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                        <LogOut className="w-4 h-4" /> Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/login"
                  className="px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50 rounded-lg transition-all border border-sky-200"
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  className="px-5 py-2 text-sm font-bold bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-all shadow-sm"
                >
                  Enrol Now
                </Link>
              </div>
            )}
          </div>

          <button
            onClick={() => setIsOpen(!isOpen)}
            className="lg:hidden p-2 text-slate-600 hover:bg-sky-50 hover:text-sky-600 rounded-lg transition-colors"
          >
            {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {isOpen && (
          <div className="lg:hidden border-t border-slate-100 py-4 space-y-1 animate-slide-down">
            {navLinks.map(link => (
              <Link
                key={link.href}
                to={link.href}
                className={`block px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                  isActive(link.href)
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-700 hover:bg-sky-50 hover:text-sky-700'
                }`}
              >
                {link.label}
              </Link>
            ))}
            <Link
              to="/notifications"
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                location.pathname === '/notifications'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-700 hover:bg-sky-50 hover:text-sky-700'
              }`}
            >
              <Bell className="w-4 h-4" /> Notifications
            </Link>
            <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
              {user && profile ? (
                <>
                  <button onClick={handleDashboard} className="flex items-center gap-2 px-4 py-2.5 text-sky-700 hover:bg-sky-50 rounded-lg text-sm font-semibold transition-colors">
                    <User className="w-4 h-4" /> My Dashboard
                  </button>
                  <button onClick={handleSignOut} className="flex items-center gap-2 px-4 py-2.5 text-red-600 hover:bg-red-50 rounded-lg text-sm font-semibold transition-colors">
                    <LogOut className="w-4 h-4" /> Sign Out
                  </button>
                </>
              ) : (
                <>
                  <Link to="/login" className="block px-4 py-2.5 text-sky-700 border border-sky-200 hover:bg-sky-50 rounded-lg text-sm font-semibold text-center transition-colors">Login</Link>
                  <Link to="/register" className="block px-4 py-2.5 bg-sky-600 text-white rounded-lg text-sm font-bold text-center transition-colors hover:bg-sky-700">Enrol Now</Link>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
