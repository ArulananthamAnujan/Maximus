import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GraduationCap, Eye, EyeOff, AlertCircle, CheckCircle2, Info, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import DarkModeToggle from '../../components/ui/DarkModeToggle';
import { useSiteSettings } from '../../hooks/useSiteSettings';

export default function Register() {
  const [formData, setFormData] = useState({ fullName: '', email: '', password: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { signUp, signInWithGoogle, signInWithMicrosoft } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { logo_url, platform_name } = useSiteSettings();

  const passwordChecks = [
    { label: 'At least 8 characters', ok: formData.password.length >= 8 },
    { label: 'Contains uppercase letter', ok: /[A-Z]/.test(formData.password) },
    { label: 'Contains number', ok: /\d/.test(formData.password) },
  ];

  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName || !formData.email || !formData.password) {
      setError('Please fill in all fields.'); return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.'); return;
    }
    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters.'); return;
    }
    setLoading(true);
    const { error } = await signUp(formData.email, formData.password, formData.fullName, 'student');
    if (error) {
      setError(error.message || 'Registration failed. Please try again.');
      setLoading(false);
    } else {
      toast.success('Account created! Welcome to Maximus Academy.');
      navigate('/student');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-navy-950 flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-navy-900 relative overflow-hidden">
        <div className="absolute inset-0 bg-pattern opacity-10" />
        <div className="absolute inset-0 bg-gradient-to-br from-navy-900/80 via-navy-900/60 to-navy-800/80" />
        <div className="relative z-10 flex flex-col justify-center p-16">
          <Link to="/" className="flex items-center gap-3 mb-16">
            {logo_url ? (
              <img src={logo_url} alt={platform_name} className="h-16 w-auto object-contain" />
            ) : (
              <div className="w-12 h-12 bg-gold-500 rounded-xl flex items-center justify-center">
                <GraduationCap className="w-7 h-7 text-white" />
              </div>
            )}
            <div>
              <p className="font-playfair font-bold text-white text-2xl">{platform_name}</p>
              <p className="text-gold-400 text-sm font-medium tracking-widest">AUSTRALIA</p>
            </div>
          </Link>
          <h2 className="font-playfair text-4xl font-bold text-white mb-6">
            Start Your Learning Journey Today
          </h2>
          <p className="text-white/90 text-lg leading-relaxed mb-8">
            Create your student account and access hundreds of professional courses designed for the Australian workforce.
          </p>
          <div className="space-y-4">
            {[
              'Access to 200+ premium courses',
              'Learn at your own pace',
              'AI-powered study tools',
              'Earn industry-recognised certificates',
              'Request face-to-face sessions with teachers',
            ].map(item => (
              <div key={item} className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-gold-500 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-4 h-4 text-white" />
                </div>
                <span className="text-white/85 font-medium">{item}</span>
              </div>
            ))}
          </div>

          {/* Teacher access note */}
          <div className="mt-10 p-4 rounded-xl bg-white/10 border border-white/20">
            <div className="flex items-start gap-3">
              <Info className="w-4 h-4 text-gold-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-white font-semibold text-sm">Are you a teacher?</p>
                <p className="text-white/70 text-xs mt-1 leading-relaxed">
                  Teacher accounts are provisioned by Maximus Academy. Contact us at{' '}
                  <a href="/contact" className="text-gold-400 hover:text-gold-300 underline">our contact page</a>{' '}
                  to apply for a teacher account.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col bg-white dark:bg-navy-900">
        <div className="flex justify-between items-center p-4">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back to home</span>
            </Link>
            <Link to="/" className="lg:hidden flex items-center gap-2 ml-2">
              {logo_url ? (
                <img src={logo_url} alt={platform_name} className="h-10 w-auto object-contain" />
              ) : (
                <div className="w-8 h-8 bg-gold-500 rounded-lg flex items-center justify-center">
                  <GraduationCap className="w-5 h-5 text-white" />
                </div>
              )}
              <span className="font-playfair font-bold text-navy-900 dark:text-white text-sm">{platform_name}</span>
            </Link>
          </div>
          <DarkModeToggle />
        </div>

        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-md">
            <div className="mb-6">
              <h1 className="text-3xl font-bold text-navy-900 dark:text-white mb-2">Create your account</h1>
              <p className="text-gray-500 dark:text-gray-400">Join thousands of learners across Australia</p>
            </div>

            {/* Social sign-up */}
            <div className="flex gap-3 mb-6">
              <button
                onClick={signInWithGoogle}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 dark:border-navy-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-navy-700 bg-white dark:bg-navy-800 transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Google
              </button>
              <button
                onClick={signInWithMicrosoft}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 dark:border-navy-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-navy-700 bg-white dark:bg-navy-800 transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <rect x="1" y="1" width="10" height="10" fill="#F25022"/>
                  <rect x="13" y="1" width="10" height="10" fill="#7FBA00"/>
                  <rect x="1" y="13" width="10" height="10" fill="#00A4EF"/>
                  <rect x="13" y="13" width="10" height="10" fill="#FFB900"/>
                </svg>
                Microsoft
              </button>
            </div>

            <div className="flex items-center gap-3 mb-6">
              <div className="flex-1 h-px bg-gray-200 dark:bg-navy-600" />
              <span className="text-xs text-gray-400 dark:text-gray-500">or register with email</span>
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Full Name</label>
                <input type="text" value={formData.fullName} onChange={handleChange('fullName')} className="input-field" placeholder="Jane Smith" required />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email Address</label>
                <input type="email" value={formData.email} onChange={handleChange('email')} className="input-field" placeholder="you@example.com" required />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={handleChange('password')}
                    className="input-field pr-10"
                    placeholder="Create a strong password"
                    required
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {formData.password && (
                  <div className="mt-2 space-y-1">
                    {passwordChecks.map(check => (
                      <div key={check.label} className="flex items-center gap-2">
                        <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${check.ok ? 'bg-green-500' : 'bg-gray-300 dark:bg-navy-600'}`}>
                          {check.ok && <CheckCircle2 className="w-2.5 h-2.5 text-white" />}
                        </div>
                        <span className={`text-xs ${check.ok ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`}>{check.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Confirm Password</label>
                <input
                  type="password"
                  value={formData.confirmPassword}
                  onChange={handleChange('confirmPassword')}
                  className="input-field"
                  placeholder="Repeat your password"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full btn-primary text-center disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? 'Creating account...' : 'Create Student Account'}
              </button>
            </form>

            {/* Teacher access note for mobile */}
            <div className="lg:hidden mt-5 p-3 rounded-xl bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                <p className="text-xs text-sky-700 dark:text-sky-300">
                  Teacher accounts are set up by Maximus Academy.{' '}
                  <Link to="/contact" className="underline font-medium">Contact us</Link> to apply.
                </p>
              </div>
            </div>

            <p className="mt-4 text-center text-xs text-gray-400 dark:text-gray-500">
              By creating an account, you agree to our{' '}
              <a href="#" className="text-gold-600 hover:underline">Terms of Service</a> and{' '}
              <a href="#" className="text-gold-600 hover:underline">Privacy Policy</a>.
            </p>

            <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
              Already have an account?{' '}
              <Link to="/login" className="text-gold-600 hover:text-gold-700 dark:hover:text-gold-400 font-medium">Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
