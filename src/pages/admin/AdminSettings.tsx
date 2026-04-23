import { useState } from 'react';
import { Save, Upload, Settings } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { adminNavItems } from './adminNav';
import { useToast } from '../../contexts/ToastContext';

export default function AdminSettings() {
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    platformName: 'Maximus Academy',
    tagline: 'Learn. Upskill. Achieve.',
    supportEmail: 'hello@maximus.edu.au',
    supportPhone: '+61 2 9123 4567',
    welcomeEmailSubject: 'Welcome to Maximus Academy!',
    welcomeEmailBody: 'Dear {student_name},\n\nWelcome to Maximus Academy! Your account has been created successfully.\n\nStart learning today by browsing our course catalogue.\n\nBest regards,\nThe Maximus Academy Team',
    certEmailSubject: 'Your Certificate is Ready — {course_name}',
    certEmailBody: 'Congratulations {student_name}!\n\nYou have successfully completed {course_name}. Your certificate is attached to this email.\n\nCertificate ID: {certificate_id}\n\nBest regards,\nThe Maximus Academy Team',
  });
  const { toast } = useToast();

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await new Promise(r => setTimeout(r, 800));
    toast.success('Settings saved successfully');
    setSaving(false);
  };

  return (
    <DashboardLayout navItems={adminNavItems} title="Settings" subtitle="Platform configuration and email templates">
      <form onSubmit={handleSave} className="space-y-6 max-w-3xl">
        <div className="card p-6">
          <h2 className="font-playfair text-lg font-bold text-gray-900 dark:text-white mb-5 flex items-center gap-2">
            <Settings className="w-5 h-5 text-gold-500" /> Platform Settings
          </h2>
          <div className="grid md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Platform Name</label>
              <input type="text" value={settings.platformName} onChange={e => setSettings(s => ({ ...s, platformName: e.target.value }))} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Tagline</label>
              <input type="text" value={settings.tagline} onChange={e => setSettings(s => ({ ...s, tagline: e.target.value }))} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Support Email</label>
              <input type="email" value={settings.supportEmail} onChange={e => setSettings(s => ({ ...s, supportEmail: e.target.value }))} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Support Phone</label>
              <input type="text" value={settings.supportPhone} onChange={e => setSettings(s => ({ ...s, supportPhone: e.target.value }))} className="input-field" />
            </div>
          </div>
          <div className="mt-5">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Platform Logo</label>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-navy-900 rounded-xl flex items-center justify-center">
                <span className="text-gold-400 font-playfair font-bold text-xl">M</span>
              </div>
              <label className="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-navy-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors cursor-pointer">
                <Upload className="w-4 h-4" /> Upload Logo
                <input type="file" accept="image/*" className="hidden" onChange={() => toast.info('Logo upload feature requires file storage configuration')} />
              </label>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <h2 className="font-playfair text-lg font-bold text-gray-900 dark:text-white mb-5">Certificate Template</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Upload a PDF or image template. The system will automatically fill in student name, course, date, and certificate ID.
          </p>
          <div className="border-2 border-dashed border-gray-200 dark:border-navy-600 rounded-xl p-8 text-center">
            <Upload className="w-8 h-8 text-gray-400 mx-auto mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Drag and drop a PDF or PNG template here</p>
            <label className="btn-primary text-sm py-2 cursor-pointer inline-block">
              Browse Files
              <input type="file" accept=".pdf,.png,.jpg" className="hidden" onChange={() => toast.info('Certificate template upload requires storage configuration')} />
            </label>
            <p className="text-xs text-gray-400 mt-3">Supported formats: PDF, PNG, JPG • Max 10MB</p>
          </div>
        </div>

        <div className="card p-6">
          <h2 className="font-playfair text-lg font-bold text-gray-900 dark:text-white mb-5">Email Templates</h2>
          <div className="space-y-6">
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white mb-3">Welcome Email</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Subject</label>
                  <input type="text" value={settings.welcomeEmailSubject} onChange={e => setSettings(s => ({ ...s, welcomeEmailSubject: e.target.value }))} className="input-field text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Body <span className="text-gray-400">(Variables: {'{student_name}'}, {'{platform_name}'})</span></label>
                  <textarea value={settings.welcomeEmailBody} onChange={e => setSettings(s => ({ ...s, welcomeEmailBody: e.target.value }))} className="input-field text-sm resize-none" rows={5} />
                </div>
              </div>
            </div>
            <div className="pt-4 border-t border-gray-100 dark:border-navy-700">
              <h3 className="font-medium text-gray-900 dark:text-white mb-3">Certificate Email</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Subject</label>
                  <input type="text" value={settings.certEmailSubject} onChange={e => setSettings(s => ({ ...s, certEmailSubject: e.target.value }))} className="input-field text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Body <span className="text-gray-400">(Variables: {'{student_name}'}, {'{course_name}'}, {'{certificate_id}'})</span></label>
                  <textarea value={settings.certEmailBody} onChange={e => setSettings(s => ({ ...s, certEmailBody: e.target.value }))} className="input-field text-sm resize-none" rows={5} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2 disabled:opacity-60">
          <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </form>
    </DashboardLayout>
  );
}
