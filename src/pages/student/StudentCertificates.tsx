import { useState, useEffect } from 'react';
import { Award, Download, ExternalLink, Shield, Calendar } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { studentNavItems } from './studentNav';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Certificate } from '../../types';

interface CertificateWithCourse extends Certificate {
  course: { title: string; category: string; thumbnail_url: string };
}

export default function StudentCertificates() {
  const { profile } = useAuth();
  const [certificates, setCertificates] = useState<CertificateWithCourse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    supabase
      .from('certificates')
      .select('*, course:courses(title,category,thumbnail_url)')
      .eq('student_id', profile.id)
      .eq('revoked', false)
      .order('issued_at', { ascending: false })
      .then(({ data }) => {
        if (data) setCertificates(data as CertificateWithCourse[]);
        setLoading(false);
      });
  }, [profile]);

  const handleDownload = (cert: CertificateWithCourse) => {
    const content = `
MAXIMUS ACADEMY AUSTRALIA
Certificate of Completion

This is to certify that

${profile?.full_name}

has successfully completed the course

${cert.course.title}

Certificate ID: ${cert.certificate_id}
Issue Date: ${new Date(cert.issued_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}

Verify at: ${window.location.origin}/verify/${cert.certificate_id}
    `.trim();

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${cert.certificate_id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout navItems={studentNavItems} title="My Certificates" subtitle="Your earned achievements">
      <div className="space-y-6">
        {loading ? (
          <div className="grid md:grid-cols-2 gap-6">
            {[1,2].map(i => <div key={i} className="card p-6 animate-pulse h-40" />)}
          </div>
        ) : certificates.length === 0 ? (
          <div className="text-center py-20">
            <Award className="w-16 h-16 text-gray-200 dark:text-navy-700 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No certificates yet</h3>
            <p className="text-gray-500 dark:text-gray-400">Complete a course to earn your first certificate.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {certificates.map(cert => (
              <div key={cert.id} className="card overflow-hidden group hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                <div className="relative h-36 overflow-hidden">
                  <img
                    src={cert.course.thumbnail_url || 'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg'}
                    alt=""
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-navy-900/60 to-navy-900/90" />
                  <div className="absolute inset-0 flex flex-col justify-center items-center text-center px-6">
                    <Award className="w-8 h-8 text-gold-400 mb-2" />
                    <h3 className="font-playfair text-lg font-bold text-white">{cert.course.title}</h3>
                    <p className="text-gold-300 text-xs font-medium mt-0.5">Certificate of Completion</p>
                  </div>
                </div>
                <div className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5 flex items-center gap-1.5">
                        <Calendar className="w-3 h-3" />
                        Issued {new Date(cert.issued_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                      <p className="text-xs font-mono text-gray-500 dark:text-gray-400">{cert.certificate_id}</p>
                    </div>
                    <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                      <Shield className="w-4 h-4" />
                      <span className="text-xs font-medium">Valid</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDownload(cert)}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gold-500 hover:bg-gold-600 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </button>
                    <a
                      href={`/verify/${cert.certificate_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 px-3 py-2 border border-gray-200 dark:border-navy-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-navy-700 text-sm font-medium rounded-lg transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Verify
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="card p-6 bg-gradient-to-br from-navy-900 to-navy-800 border-navy-700">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-gold-500/20 rounded-xl flex items-center justify-center shrink-0">
              <Shield className="w-6 h-6 text-gold-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white mb-1">Verified & Secure Certificates</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Each Maximus Academy certificate comes with a unique ID and a public verification link. Share your achievements with employers and LinkedIn.
              </p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
