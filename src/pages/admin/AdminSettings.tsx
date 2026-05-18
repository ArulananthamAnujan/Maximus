import { useState, useEffect, useRef } from 'react';
import { Save, Upload, Settings, Image, Trash2, CheckCircle2 } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { adminNavItems } from './adminNav';
import { supabase } from '../../lib/supabase';
import { refreshSiteSettings } from '../../hooks/useSiteSettings';
import { toast } from 'sonner';

interface SiteSettings {
  platform_name: string;
  tagline: string;
  support_email: string;
  support_phone: string;
  logo_url: string;
  welcome_email_subject: string;
  welcome_email_body: string;
  cert_email_subject: string;
  cert_email_body: string;
}

const DEFAULT_SETTINGS: SiteSettings = {
  platform_name: 'Maximus Academy',
  tagline: 'Learn. Upskill. Achieve.',
  support_email: 'hello@maximus.edu.au',
  support_phone: '+61 2 9123 4567',
  logo_url: '',
  welcome_email_subject: 'Welcome to Maximus Academy!',
  welcome_email_body: 'Dear {student_name},\n\nWelcome to Maximus Academy! Your account has been created successfully.\n\nStart learning today by browsing our course catalogue.\n\nBest regards,\nThe Maximus Academy Team',
  cert_email_subject: 'Your Certificate is Ready — {course_name}',
  cert_email_body: 'Congratulations {student_name}!\n\nYou have successfully completed {course_name}. Your certificate is attached to this email.\n\nCertificate ID: {certificate_id}\n\nBest regards,\nThe Maximus Academy Team',
};

async function loadSettings(): Promise<SiteSettings> {
  const { data } = await supabase.from('site_settings').select('key, value');
  if (!data) return DEFAULT_SETTINGS;
  const map: Record<string, string> = {};
  data.forEach(row => { map[row.key] = row.value ?? ''; });
  return {
    platform_name: map['platform_name'] ?? DEFAULT_SETTINGS.platform_name,
    tagline: map['tagline'] ?? DEFAULT_SETTINGS.tagline,
    support_email: map['support_email'] ?? DEFAULT_SETTINGS.support_email,
    support_phone: map['support_phone'] ?? DEFAULT_SETTINGS.support_phone,
    logo_url: map['logo_url'] ?? '',
    welcome_email_subject: map['welcome_email_subject'] ?? DEFAULT_SETTINGS.welcome_email_subject,
    welcome_email_body: map['welcome_email_body'] ?? DEFAULT_SETTINGS.welcome_email_body,
    cert_email_subject: map['cert_email_subject'] ?? DEFAULT_SETTINGS.cert_email_subject,
    cert_email_body: map['cert_email_body'] ?? DEFAULT_SETTINGS.cert_email_body,
  };
}

async function saveSetting(key: string, value: string) {
  await supabase.from('site_settings').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
}

export default function AdminSettings() {
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SETTINGS);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSettings().then(s => { setSettings(s); setLoading(false); });
  }, []);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Logo must be under 5MB.');
      return;
    }
    setUploadingLogo(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `logo/company-logo.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('course-thumbnails')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('course-thumbnails').getPublicUrl(path);
      const logoUrl = urlData.publicUrl + `?t=${Date.now()}`;
      await saveSetting('logo_url', logoUrl);
      setSettings(s => ({ ...s, logo_url: logoUrl }));
      await refreshSiteSettings();
      toast.success('Logo updated! Changes are live across the site.');
    } catch (err) {
      console.error(err);
      toast.error('Failed to upload logo. Please try again.');
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveLogo = async () => {
    await saveSetting('logo_url', '');
    setSettings(s => ({ ...s, logo_url: '' }));
    await refreshSiteSettings();
    toast.success('Logo removed. Default logo will be used.');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await Promise.all([
        saveSetting('platform_name', settings.platform_name),
        saveSetting('tagline', settings.tagline),
        saveSetting('support_email', settings.support_email),
        saveSetting('support_phone', settings.support_phone),
        saveSetting('welcome_email_subject', settings.welcome_email_subject),
        saveSetting('welcome_email_body', settings.welcome_email_body),
        saveSetting('cert_email_subject', settings.cert_email_subject),
        saveSetting('cert_email_body', settings.cert_email_body),
      ]);
      toast.success('Settings saved successfully.');
    } catch {
      toast.error('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout navItems={adminNavItems} title="Settings" subtitle="Platform configuration and email templates">
        <div className="space-y-4 max-w-3xl">
          {[1,2,3].map(i => <div key={i} className="card h-40 animate-pulse" />)}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout navItems={adminNavItems} title="Settings" subtitle="Platform configuration and email templates">
      <form onSubmit={handleSave} className="space-y-6 max-w-3xl">

        {/* Platform Settings */}
        <div className="card p-6">
          <h2 className="font-playfair text-lg font-bold text-gray-900 dark:text-white mb-5 flex items-center gap-2">
            <Settings className="w-5 h-5 text-gold-500" /> Platform Settings
          </h2>
          <div className="grid md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Platform Name</label>
              <input type="text" value={settings.platform_name} onChange={e => setSettings(s => ({ ...s, platform_name: e.target.value }))} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Tagline</label>
              <input type="text" value={settings.tagline} onChange={e => setSettings(s => ({ ...s, tagline: e.target.value }))} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Support Email</label>
              <input type="email" value={settings.support_email} onChange={e => setSettings(s => ({ ...s, support_email: e.target.value }))} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Support Phone</label>
              <input type="text" value={settings.support_phone} onChange={e => setSettings(s => ({ ...s, support_phone: e.target.value }))} className="input-field" />
            </div>
          </div>
        </div>

        {/* Logo Upload */}
        <div className="card p-6">
          <h2 className="font-playfair text-lg font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
            <Image className="w-5 h-5 text-gold-500" /> Company Logo
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
            Upload your company logo. It will appear in the header and throughout the site immediately after saving.
          </p>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
            {/* Preview */}
            <div className="w-28 h-28 rounded-2xl bg-navy-900 dark:bg-navy-800 border border-navy-700 flex items-center justify-center overflow-hidden shrink-0">
              {settings.logo_url ? (
                <img src={settings.logo_url} alt="Company logo" className="w-full h-full object-contain p-3" />
              ) : (
                <span className="text-gold-400 font-playfair font-bold text-3xl">M</span>
              )}
            </div>
            <div className="space-y-3 flex-1">
              {settings.logo_url && (
                <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  Custom logo is active
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <label className={`flex items-center gap-2 px-4 py-2.5 border border-gray-200 dark:border-navy-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors cursor-pointer ${uploadingLogo ? 'opacity-60 cursor-not-allowed' : 'hover:bg-gray-50 dark:hover:bg-navy-700'}`}>
                  <Upload className="w-4 h-4" />
                  {uploadingLogo ? 'Uploading...' : settings.logo_url ? 'Replace Logo' : 'Upload Logo'}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingLogo}
                    onChange={handleLogoUpload}
                  />
                </label>
                {settings.logo_url && (
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="flex items-center gap-2 px-4 py-2.5 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" /> Remove
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500">Recommended: PNG or SVG, transparent background, min 200×200px. Max 5MB.</p>
            </div>
          </div>
        </div>

        {/* Certificate Template */}
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
              <input type="file" accept=".pdf,.png,.jpg" className="hidden" onChange={() => toast.info('Certificate template upload coming soon.')} />
            </label>
            <p className="text-xs text-gray-400 mt-3">Supported formats: PDF, PNG, JPG • Max 10MB</p>
          </div>
        </div>

        {/* Email Templates */}
        <div className="card p-6">
          <h2 className="font-playfair text-lg font-bold text-gray-900 dark:text-white mb-5">Email Templates</h2>
          <div className="space-y-6">
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white mb-3">Welcome Email</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Subject</label>
                  <input type="text" value={settings.welcome_email_subject} onChange={e => setSettings(s => ({ ...s, welcome_email_subject: e.target.value }))} className="input-field text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Body <span className="text-gray-400">(Variables: {'{student_name}'}, {'{platform_name}'})</span></label>
                  <textarea value={settings.welcome_email_body} onChange={e => setSettings(s => ({ ...s, welcome_email_body: e.target.value }))} className="input-field text-sm resize-none" rows={5} />
                </div>
              </div>
            </div>
            <div className="pt-4 border-t border-gray-100 dark:border-navy-700">
              <h3 className="font-medium text-gray-900 dark:text-white mb-3">Certificate Email</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Subject</label>
                  <input type="text" value={settings.cert_email_subject} onChange={e => setSettings(s => ({ ...s, cert_email_subject: e.target.value }))} className="input-field text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Body <span className="text-gray-400">(Variables: {'{student_name}'}, {'{course_name}'}, {'{certificate_id}'})</span></label>
                  <textarea value={settings.cert_email_body} onChange={e => setSettings(s => ({ ...s, cert_email_body: e.target.value }))} className="input-field text-sm resize-none" rows={5} />
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
