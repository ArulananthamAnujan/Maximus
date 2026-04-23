import { useState, useEffect } from 'react';
import { Search, Award, ShieldX } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { adminNavItems } from './adminNav';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../contexts/ToastContext';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Badge from '../../components/ui/Badge';
import type { Certificate } from '../../types';

export default function AdminCertificates() {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [revokeTarget, setRevokeTarget] = useState<Certificate | null>(null);
  const { toast } = useToast();

  const fetchData = async () => {
    const { data } = await supabase
      .from('certificates')
      .select('*, student:profiles(full_name, email), course:courses(title)')
      .order('issued_at', { ascending: false });
    if (data) setCertificates(data as Certificate[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    await supabase.from('certificates').update({ revoked: !revokeTarget.revoked, revoked_at: !revokeTarget.revoked ? new Date().toISOString() : null }).eq('id', revokeTarget.id);
    toast.success(revokeTarget.revoked ? 'Certificate reinstated' : 'Certificate revoked');
    setRevokeTarget(null);
    fetchData();
  };

  const filtered = certificates.filter(c => {
    const student = c.student as { full_name?: string; email?: string } | undefined;
    const course = c.course as { title?: string } | undefined;
    const q = search.toLowerCase();
    return !search || student?.full_name?.toLowerCase().includes(q) || student?.email?.toLowerCase().includes(q) || course?.title?.toLowerCase().includes(q) || c.certificate_id.toLowerCase().includes(q);
  });

  return (
    <DashboardLayout navItems={adminNavItems} title="Certificates" subtitle="Manage all issued certificates">
      <div className="space-y-5">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search certificates..." value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-9 py-2 text-sm" />
        </div>

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-navy-700/50 border-b border-gray-100 dark:border-navy-700">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Student</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase hidden md:table-cell">Course</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase hidden sm:table-cell">Certificate ID</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase hidden lg:table-cell">Issued</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-navy-700">
                {loading ? Array.from({ length: 5 }).map((_, i) => <tr key={i}>{[1,2,3,4,5,6].map(j => <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-200 dark:bg-navy-700 rounded animate-pulse" /></td>)}</tr>) :
                filtered.map(cert => {
                  const student = cert.student as { full_name?: string; email?: string } | undefined;
                  const course = cert.course as { title?: string } | undefined;
                  return (
                    <tr key={cert.id} className="hover:bg-gray-50 dark:hover:bg-navy-700/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 dark:text-white text-sm">{student?.full_name || '—'}</p>
                        <p className="text-xs text-gray-400">{student?.email}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 hidden md:table-cell">{course?.title || '—'}</td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="font-mono text-xs text-gray-600 dark:text-gray-400">{cert.certificate_id}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 hidden lg:table-cell">{new Date(cert.issued_at).toLocaleDateString('en-AU')}</td>
                      <td className="px-4 py-3">
                        <Badge variant={cert.revoked ? 'error' : 'success'}>{cert.revoked ? 'Revoked' : 'Valid'}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => setRevokeTarget(cert)} className={`flex items-center gap-1 text-xs font-medium ml-auto ${cert.revoked ? 'text-green-600 hover:text-green-700' : 'text-red-500 hover:text-red-700'}`}>
                          <ShieldX className="w-3.5 h-3.5" /> {cert.revoked ? 'Reinstate' : 'Revoke'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!loading && filtered.length === 0 && (
              <div className="text-center py-12">
                <Award className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500 dark:text-gray-400 text-sm">No certificates found</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog isOpen={!!revokeTarget} title={revokeTarget?.revoked ? 'Reinstate Certificate' : 'Revoke Certificate'} message={revokeTarget?.revoked ? 'Reinstate this certificate? It will become valid again.' : 'Revoke this certificate? Students will no longer be able to use it.'} variant={revokeTarget?.revoked ? 'info' : 'danger'} onConfirm={handleRevoke} onCancel={() => setRevokeTarget(null)} confirmText={revokeTarget?.revoked ? 'Reinstate' : 'Revoke'} />
    </DashboardLayout>
  );
}
