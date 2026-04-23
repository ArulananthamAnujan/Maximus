import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { GraduationCap, CheckCircle, XCircle, Search, Shield } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Certificate } from '../../types';
import DarkModeToggle from '../../components/ui/DarkModeToggle';

export default function VerifyCertificate() {
  const { id } = useParams<{ id: string }>();
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [searchId, setSearchId] = useState(id || '');
  const [searched, setSearched] = useState(!!id);
  const [notFound, setNotFound] = useState(false);

  const verifyCert = async (certId: string) => {
    setLoading(true);
    setNotFound(false);
    const { data } = await supabase
      .from('certificates')
      .select('*, student:profiles(full_name), course:courses(title)')
      .eq('certificate_id', certId.toUpperCase())
      .maybeSingle();
    if (data) setCertificate(data as Certificate);
    else setNotFound(true);
    setSearched(true);
    setLoading(false);
  };

  useEffect(() => {
    if (id) verifyCert(id);
  }, [id]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-navy-950">
      <header className="bg-navy-900 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gold-500 rounded-lg flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <span className="font-playfair font-bold text-white">Maximus Academy</span>
          </Link>
          <DarkModeToggle className="text-gray-400 hover:text-white" />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-16">
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-gold-100 dark:bg-gold-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-gold-600" />
          </div>
          <h1 className="font-playfair text-3xl font-bold text-navy-900 dark:text-white mb-3">Certificate Verification</h1>
          <p className="text-gray-500 dark:text-gray-400">Enter a certificate ID to verify its authenticity.</p>
        </div>

        <div className="bg-white dark:bg-navy-800 rounded-2xl border border-gray-100 dark:border-navy-700 p-8 mb-6">
          <div className="flex gap-3">
            <input
              type="text"
              value={searchId}
              onChange={e => setSearchId(e.target.value.toUpperCase())}
              className="input-field flex-1 font-mono"
              placeholder="MAX-2024-000001"
              onKeyDown={e => e.key === 'Enter' && verifyCert(searchId)}
            />
            <button onClick={() => verifyCert(searchId)} disabled={loading || !searchId} className="btn-primary flex items-center gap-2 shrink-0 disabled:opacity-60">
              <Search className="w-4 h-4" />
              Verify
            </button>
          </div>
        </div>

        {loading && (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-2 border-gold-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">Verifying certificate...</p>
          </div>
        )}

        {!loading && searched && certificate && !certificate.revoked && (
          <div className="bg-white dark:bg-navy-800 rounded-2xl border-2 border-green-500 p-8 animate-slide-up">
            <div className="flex items-center gap-3 mb-6">
              <CheckCircle className="w-8 h-8 text-green-500" />
              <div>
                <h2 className="text-xl font-bold text-green-700 dark:text-green-400">Certificate Valid</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">This certificate is authentic and has not been revoked.</p>
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-navy-700 rounded-xl p-6 space-y-4">
              <div className="flex justify-center mb-4">
                <div className="w-20 h-20 bg-gold-100 dark:bg-gold-900/30 rounded-2xl flex items-center justify-center">
                  <GraduationCap className="w-10 h-10 text-gold-600" />
                </div>
              </div>
              <div className="text-center mb-6">
                <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Certificate of Completion</p>
                <p className="font-playfair text-2xl font-bold text-navy-900 dark:text-white">
                  {(certificate.student as { full_name: string })?.full_name}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-400 mb-1">Course</p>
                  <p className="font-semibold text-gray-900 dark:text-white">{(certificate.course as { title: string })?.title}</p>
                </div>
                <div>
                  <p className="text-gray-400 mb-1">Certificate ID</p>
                  <p className="font-mono font-semibold text-gray-900 dark:text-white">{certificate.certificate_id}</p>
                </div>
                <div>
                  <p className="text-gray-400 mb-1">Issued Date</p>
                  <p className="font-semibold text-gray-900 dark:text-white">{new Date(certificate.issued_at).toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                </div>
                <div>
                  <p className="text-gray-400 mb-1">Issued By</p>
                  <p className="font-semibold text-gray-900 dark:text-white">Maximus Academy Australia</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {!loading && searched && certificate?.revoked && (
          <div className="bg-white dark:bg-navy-800 rounded-2xl border-2 border-red-500 p-8 animate-slide-up">
            <div className="flex items-center gap-3">
              <XCircle className="w-8 h-8 text-red-500" />
              <div>
                <h2 className="text-xl font-bold text-red-700 dark:text-red-400">Certificate Revoked</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">This certificate has been revoked and is no longer valid.</p>
              </div>
            </div>
          </div>
        )}

        {!loading && searched && notFound && (
          <div className="bg-white dark:bg-navy-800 rounded-2xl border-2 border-gray-200 dark:border-navy-600 p-8 text-center animate-slide-up">
            <XCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Certificate Not Found</h2>
            <p className="text-gray-500 dark:text-gray-400">No certificate with ID <strong>{searchId}</strong> was found. Please check the ID and try again.</p>
          </div>
        )}

        <p className="text-center text-xs text-gray-400 mt-8">
          Maximus Academy Australia &mdash; Certificates issued on this platform are digitally signed and tamper-proof.<br />
          For support, contact <a href="mailto:certificates@maximus.edu.au" className="text-gold-600 hover:underline">certificates@maximus.edu.au</a>
        </p>
      </main>
    </div>
  );
}
