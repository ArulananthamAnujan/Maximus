import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GraduationCap, Eye, EyeOff, AlertCircle, Chrome as Google } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import DarkModeToggle from '../../components/ui/DarkModeToggle';

const DEMO_ACCOUNTS = [
  { role: 'Admin', email: 'admin@maximus.edu.au', password: 'Admin1234!', color: 'text-red-600' },
  { role: 'Teacher', email: 'teacher@maximus.edu.au', password: 'Teacher1234!', color: 'text-blue-600' },
  { role: 'Student', email: 'student@maximus.edu.au', password: 'Student1234!', color: 'text-green-600' },
];

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { signIn, signInWithGoogle, signInWithMicrosoft } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError('Please fill in all fields.'); return; }
    setLoading(true);
    setError('');
    const { error } = await signIn(email, password);
    if (error) {
      setError('Invalid email or password. Please try again.');
      setLoading(false);
    } else {
      toast.success('Welcome back!');
      navigate('/dashboard');
    }
  };

  const handleDemo = async (demoEmail: string, demoPassword: string) => {
    setLoading(true);
    setError('');
    const { error } = await signIn(demoEmail, demoPassword);
    if (error) {
      setError(`Login failed: ${(error as { message?: string }).message || 'Invalid credentials. Please try again.'}`);
      setLoading(false);
    } else {
      toast.success('Logged in with demo account!');
      navigate('/dashboard');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-navy-950 flex">
      <div className="hidden lg:flex lg:w-1/2 bg-navy-900 relative overflow-hidden">
        <div className="absolute inset-0 bg-pattern opacity-30" />
        <div className="relative z-10 flex flex-col justify-center p-16">
          <Link to="/" className="flex items-center gap-3 mb-16">
            <div className="w-12 h-12 bg-gold-500 rounded-xl flex items-center justify-center">
              <GraduationCap className="w-7 h-7 text-white" />
            </div>
            <div>
              <p className="font-playfair font-bold text-white text-2xl">Maximus Academy</p>
              <p className="text-gold-400 text-sm font-medium tracking-widest">AUSTRALIA</p>
            </div>
          </Link>
          <h2 className="font-playfair text-4xl font-bold text-white mb-6 leading-tight">
            Transform Your Career with World-Class Education
          </h2>
          <p className="text-gray-300 text-lg leading-relaxed mb-10">
            Join thousands of Australians upskilling through our premium online courses designed by industry experts.
          </p>
          <div className="grid grid-cols-3 gap-6">
            {[['10,000+', 'Students'], ['200+', 'Courses'], ['98%', 'Satisfaction']].map(([val, label]) => (
              <div key={label} className="text-center">
                <p className="text-3xl font-bold text-gold-400 font-playfair">{val}</p>
                <p className="text-gray-400 text-sm mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="flex justify-between items-center p-4">
          <Link to="/" className="lg:hidden flex items-center gap-2">
            <div className="w-8 h-8 bg-gold-500 rounded-lg flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <span className="font-playfair font-bold text-navy-900 dark:text-white text-sm">Maximus Academy</span>
          </Link>
          <div className="ml-auto">
            <DarkModeToggle />
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-md">
            <h1 className="text-3xl font-bold text-navy-900 dark:text-white mb-2">Welcome back</h1>
            <p className="text-gray-500 dark:text-gray-400 mb-8">Sign in to your Maximus Academy account</p>

            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4 mb-6">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-400 mb-3">Demo Accounts — Click to Login</p>
              <div className="flex flex-col gap-2">
                {DEMO_ACCOUNTS.map(acc => (
                  <button
                    key={acc.role}
                    onClick={() => handleDemo(acc.email, acc.password)}
                    disabled={loading}
                    className="flex items-center justify-between px-3 py-2 bg-white dark:bg-navy-800 rounded-lg text-sm hover:bg-amber-50 dark:hover:bg-navy-700 transition-colors border border-amber-100 dark:border-navy-600"
                  >
                    <span className={`font-semibold ${acc.color}`}>{acc.role}</span>
                    <span className="text-gray-500 dark:text-gray-400 text-xs">{acc.email}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 mb-6">
              <button
                onClick={signInWithGoogle}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 dark:border-navy-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors"
              >
                <Google className="w-4 h-4" />
                Google
              </button>
              <button
                onClick={signInWithMicrosoft}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 dark:border-navy-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24"><rect x="1" y="1" width="10" height="10" fill="#F25022"/><rect x="13" y="1" width="10" height="10" fill="#7FBA00"/><rect x="1" y="13" width="10" height="10" fill="#00A4EF"/><rect x="13" y="13" width="10" height="10" fill="#FFB900"/></svg>
                Microsoft
              </button>
            </div>

            <div className="flex items-center gap-3 mb-6">
              <div className="flex-1 h-px bg-gray-200 dark:bg-navy-600" />
              <span className="text-xs text-gray-400">or continue with email</span>
              <div className="flex-1 h-px bg-gray-200 dark:bg-navy-600" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="input-field"
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
                  <Link to="/forgot-password" className="text-xs text-gold-600 hover:text-gold-700">Forgot password?</Link>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="input-field pr-10"
                    placeholder="••••••••"
                    required
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full btn-primary text-center disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
              Don't have an account?{' '}
              <Link to="/register" className="text-gold-600 hover:text-gold-700 font-medium">Create account</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
