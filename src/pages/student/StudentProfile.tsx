import { useState } from 'react';
import { User, Save, Eye, EyeOff, Bell, Lock, Mail } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { studentNavItems } from './studentNav';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

export default function StudentProfile() {
  const { profile, refreshProfile } = useAuth();
  const { toast } = useToast();

  const [name, setName] = useState(profile?.full_name || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [notifEmail, setNotifEmail] = useState(profile?.notification_email ?? true);
  const [notifDeadlines, setNotifDeadlines] = useState(profile?.notification_deadlines ?? true);
  const [notifGrades, setNotifGrades] = useState(profile?.notification_grades ?? true);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const handleSaveProfile = async () => {
    if (!profile) return;
    if (!name.trim()) { toast.error('Full name is required.'); return; }
    setSavingProfile(true);
    const { error } = await supabase.from('profiles').update({
      full_name: name.trim(),
      bio: bio.trim(),
      phone: phone.trim(),
      notification_email: notifEmail,
      notification_deadlines: notifDeadlines,
      notification_grades: notifGrades,
      updated_at: new Date().toISOString(),
    }).eq('id', profile.id);
    if (error) {
      toast.error('Failed to update profile.');
    } else {
      await refreshProfile();
      toast.success('Profile updated successfully!');
    }
    setSavingProfile(false);
  };

  const handleChangePassword = async () => {
    if (!newPw || !confirmPw) { toast.error('Please fill in all password fields.'); return; }
    if (newPw !== confirmPw) { toast.error('Passwords do not match.'); return; }
    if (newPw.length < 8) { toast.error('Password must be at least 8 characters.'); return; }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    if (error) {
      toast.error('Failed to update password. Please try again.');
    } else {
      toast.success('Password updated successfully!');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    }
    setSavingPassword(false);
  };

  return (
    <DashboardLayout navItems={studentNavItems} title="My Profile" subtitle="Manage your account settings">
      <div className="max-w-2xl space-y-6">
        <div className="card p-6">
          <div className="flex items-center gap-4 mb-6 pb-6 border-b border-gray-100 dark:border-navy-700">
            <div className="w-16 h-16 rounded-full bg-gold-500 flex items-center justify-center text-2xl font-bold text-white">
              {name?.[0]?.toUpperCase() || '?'}
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white text-lg">{name || 'Your Name'}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{profile?.email}</p>
              <span className="badge bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 mt-1">Student</span>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <User className="w-4 h-4 text-gold-500" /> Personal Information
            </h4>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Full Name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} className="input-field" placeholder="Your full name" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Phone</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="input-field" placeholder="+61 400 000 000" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Bio</label>
              <textarea value={bio} onChange={e => setBio(e.target.value)} className="input-field min-h-20 resize-none" placeholder="Tell us a little about yourself..." />
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-100 dark:border-navy-700 space-y-4">
            <h4 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Bell className="w-4 h-4 text-gold-500" /> Notification Preferences
            </h4>
            {[
              { label: 'Email notifications', sub: 'Receive updates via email', val: notifEmail, set: setNotifEmail, icon: Mail },
              { label: 'Deadline reminders', sub: '24 hours before assignments are due', val: notifDeadlines, set: setNotifDeadlines, icon: Bell },
              { label: 'Grade notifications', sub: 'When your assignments are graded', val: notifGrades, set: setNotifGrades, icon: User },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gray-100 dark:bg-navy-700 rounded-lg flex items-center justify-center">
                    <item.icon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{item.label}</p>
                    <p className="text-xs text-gray-400">{item.sub}</p>
                  </div>
                </div>
                <button
                  onClick={() => item.set(!item.val)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${item.val ? 'bg-gold-500' : 'bg-gray-300 dark:bg-navy-600'}`}
                >
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${item.val ? 'translate-x-5.5 left-0' : 'left-0.5'}`} style={{ transform: item.val ? 'translateX(22px)' : 'translateX(0)' }} />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-6 flex justify-end">
            <button onClick={handleSaveProfile} disabled={savingProfile} className="btn-primary flex items-center gap-2">
              <Save className="w-4 h-4" />
              {savingProfile ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

        <div className="card p-6">
          <h4 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
            <Lock className="w-4 h-4 text-gold-500" /> Change Password
          </h4>
          <div className="space-y-3">
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                className="input-field pr-10"
                placeholder="New password"
              />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} className="input-field" placeholder="Confirm new password" />
            <div className="flex justify-end">
              <button onClick={handleChangePassword} disabled={savingPassword} className="btn-primary text-sm flex items-center gap-2">
                <Lock className="w-4 h-4" />
                {savingPassword ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
