import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GraduationCap, Eye, EyeOff, AlertCircle, CheckCircle2, BookOpen, Users } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import DarkModeToggle from '../../components/ui/DarkModeToggle';

type Role = 'student' | 'teacher';

export default function Register() {
  const [formData, setFormData] = useState({ fullName: '', email: '', password: '', confirmPassword: '' });
  const [role, setRole] = useState<Role>('student');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { signUp, signInWithGoogle, signInWithMicrosoft } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

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
    const { error } = await signUp(formData.email, formData.password, formData.fullName, role);
    if (error) {
      setError(error.message || 'Registration failed. Please try again.');
      setLoading(false);
    } else {
      toast.success('Account created! Welcome to Maximus Academy.');
      navigate(role === 'teacher' ? '/teacher' : '/student');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-navy-950 flex">
      <div className="hidden lg:flex lg:w-1/2 bg-navy-900 relative overflow-hidden">
        <div className="absolute inset-0 bg-pattern opacity-10" />
        <div className="absolute inset-0 bg-gradient-to-br from-navy-900/80 via-navy-900/60 to-navy-800/80" />
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
          <h2 className="font-playfair text-4xl font-bold text-white mb-6">
            Start Your Learning Journey Today
          </h2>
          <p className="text-white/90 text-lg leading-relaxed mb-8">
            Create your free account and access hundreds of professional courses designed for the Australian workforce.
          </p>
          <div className="space-y-4">
            {['Access to 200+ premium courses', 'Learn at your own pace', 'Earn industry-recognised certificates', 'Expert instructors from top companies'].map(item => (
              <div key={item} className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-gold-500 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-4 h-4 text-white" />
                </div>
                <span className="text-white/85 font-medium">{item}</span>
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
            <h1 className="text-3xl font-bold text-navy-900 dark:text-white mb-2">Create your account</h1>
            <p className="text-gray-500 dark:text-gray-400 mb-6">Join thousands of learners across Australia</p>

            {/* Role selector */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <button
                type="button"
                onClick={() => setRole('student')}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                  role === 'student'
                    ? 'border-gold-500 bg-gold-50 dark:bg-gold-500/10'
                    : 'border-gray-200 dark:border-navy-600 hover:border-gray-300 dark:hover:border-navy-500'
                }`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${role === 'student' ? 'bg-gold-500' : 'bg-gray-100 dark:bg-navy-700'}`}>
                  <BookOpen className={`w-5 h-5 ${role === 'student' ? 'text-white' : 'text-gray-500 dark:text-gray-400'}`} />
                </div>
                <div className="text-center">
                  <p className={`font-semibold text-sm ${role === 'student' ? 'text-gold-700 dark:text-gold-400' : 'text-gray-700 dark:text-gray-300'}`}>Student</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">I want to learn</p>
                </div>
                {role === 'student' && (
                  <div className="w-4 h-4 rounded-full bg-gold-500 flex items-center justify-center">
                    <CheckCircle2 className="w-3 h-3 text-white" />
                  </div>
                )}
              </button>

              <button
                type="button"
                onClick={() => setRole('teacher')}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                  role === 'teacher'
                    ? 'border-navy-600 bg-navy-50 dark:bg-navy-600/20'
                    : 'border-gray-200 dark:border-navy-600 hover:border-gray-300 dark:hover:border-navy-500'
                }`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${role === 'teacher' ? 'bg-navy-700 dark:bg-navy-500' : 'bg-gray-100 dark:bg-navy-700'}`}>
                  <Users className={`w-5 h-5 ${role === 'teacher' ? 'text-white' : 'text-gray-500 dark:text-gray-400'}`} />
                </div>
                <div className="text-center">
                  <p className={`font-semibold text-sm ${role === 'teacher' ? 'text-navy-700 dark:text-navy-300' : 'text-gray-700 dark:text-gray-300'}`}>Teacher</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">I want to teach</p>
                </div>
                {role === 'teacher' && (
                  <div className="w-4 h-4 rounded-full bg-navy-600 flex items-center justify-center">
                    <CheckCircle2 className="w-3 h-3 text-white" />
                  </div>
                )}
              </button>
            </div>

            <div className="flex gap-3 mb-6">
              <button onClick={signInWithGoogle} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 dark:border-navy-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors">
                <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Google
              </button>
              <button onClick={signInWithMicrosoft} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 dark:border-navy-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors">
                <svg className="w-4 h-4" viewBox="0 0 24 24"><rect x="1" y="1" width="10" height="10" fill="#F25022"/><rect x="13" y="1" width="10" height="10" fill="#7FBA00"/><rect x="1" y="13" width="10" height="10" fill="#00A4EF"/><rect x="13" y="13" width="10" height="10" fill="#FFB900"/></svg>
                Microsoft
              </button>
            </div>

            <div className="flex items-center gap-3 mb-6">
              <div className="flex-1 h-px bg-gray-200 dark:bg-navy-600" />
              <span className="text-xs text-gray-400">or register with email</span>
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
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
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
                        <span className={`text-xs ${check.ok ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>{check.label}</span>
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

              <button type="submit" disabled={loading} className="w-full btn-primary text-center disabled:opacity-60 disabled:cursor-not-allowed">
                {loading ? 'Creating account...' : `Create ${role === 'teacher' ? 'Teacher' : 'Student'} Account`}
              </button>
            </form>

            <p className="mt-4 text-center text-xs text-gray-400">
              By creating an account, you agree to our{' '}
              <a href="#" className="text-gold-600 hover:underline">Terms of Service</a> and{' '}
              <a href="#" className="text-gold-600 hover:underline">Privacy Policy</a>.
            </p>

            <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
              Already have an account?{' '}
              <Link to="/login" className="text-gold-600 hover:text-gold-700 font-medium">Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
