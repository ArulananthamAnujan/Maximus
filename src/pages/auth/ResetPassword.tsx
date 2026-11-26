import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GraduationCap, Lock, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import DarkModeToggle from '../../components/ui/DarkModeToggle';

/**
 * Landing page for the password-recovery email link. Supabase signs the visitor in with a
 * short-lived recovery session from the URL; here they choose a new password.
 */
export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (session) { setHasSession(true); setReady(true); }
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      setHasSession(!!session);
      setReady(true);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) { setError(error.message); return; }
    setDone(true);
    setTimeout(() => navigate('/dashboard', { replace: true }), 1500);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-navy-950 flex items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <DarkModeToggle />
      </div>
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-navy-800 rounded-2xl shadow-xl p-8 border border-gray-100 dark:border-navy-700">
          <div className="w-14 h-14 bg-gold-100 dark:bg-gold-900/30 rounded-2xl flex items-center justify-center mb-6">
            <GraduationCap className="w-8 h-8 text-gold-600" />
          </div>

          {done ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Password updated</h1>
              <p className="text-gray-500 dark:text-gray-400">Taking you to your dashboard…</p>
            </div>
          ) : !ready ? (
            <p className="text-gray-500 dark:text-gray-400">Checking your reset link…</p>
          ) : !hasSession ? (
            <>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">This link has expired</h1>
              <p className="text-gray-500 dark:text-gray-400 mb-6">Password reset links can only be used once and expire after a short time.</p>
              <Link to="/forgot-password" className="btn-primary inline-flex justify-center w-full">Request a new link</Link>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Choose a new password</h1>
              <p className="text-gray-500 dark:text-gray-400 mb-8">Use at least 8 characters.</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                  </div>
                )}
                <div>
                  <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">New password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input id="new-password" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} className="input-field pl-10" />
                  </div>
                </div>
                <div>
                  <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Confirm new password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} className="input-field pl-10" />
                  </div>
                </div>
                <button type="submit" disabled={saving} className="btn-primary w-full">
                  {saving ? 'Saving…' : 'Update password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
