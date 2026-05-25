import { useState, useEffect } from 'react';
import { Award, Download, ExternalLink, Shield, Calendar, Mail, Loader2 } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { studentNavItems } from './studentNav';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';
import type { Certificate } from '../../types';
import jsPDF from 'jspdf';

interface CertificateWithCourse extends Omit<Certificate, 'course'> {
  course: { title: string; category: string; thumbnail_url: string };
}

const LOGO_URL = 'https://pwnlfbbssvywynffkksd.supabase.co/storage/v1/object/public/course-thumbnails/logo/company-logo.png?t=1779083699690';
const PLATFORM = 'Maximus Academy';
const ABN = 'ABN: 12 345 678 901';

async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function generateCertificatePDF(cert: CertificateWithCourse, studentName: string): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = 297, H = 210;

  // ── Background ────────────────────────────────────────────────────────────
  // Deep navy background
  doc.setFillColor(10, 20, 45);
  doc.rect(0, 0, W, H, 'F');

  // Gold border outer
  doc.setDrawColor(212, 175, 55);
  doc.setLineWidth(1.5);
  doc.rect(8, 8, W - 16, H - 16);

  // Gold border inner
  doc.setDrawColor(212, 175, 55);
  doc.setLineWidth(0.5);
  doc.rect(12, 12, W - 24, H - 24);

  // Subtle watermark circles
  doc.setDrawColor(255, 255, 255, 0.03);
  doc.setLineWidth(0.3);
  doc.circle(W / 2, H / 2, 70);
  doc.circle(W / 2, H / 2, 90);

  // ── Logo ──────────────────────────────────────────────────────────────────
  const logoB64 = await loadImageAsBase64(LOGO_URL);
  if (logoB64) {
    doc.addImage(logoB64, 'PNG', W / 2 - 18, 18, 36, 18, undefined, 'FAST');
  }

  // ── Header text ───────────────────────────────────────────────────────────
  doc.setTextColor(212, 175, 55);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(PLATFORM.toUpperCase(), W / 2, 42, { align: 'center', charSpace: 3 });

  doc.setTextColor(180, 180, 180);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(ABN, W / 2, 47, { align: 'center' });

  // ── Decorative divider ────────────────────────────────────────────────────
  doc.setDrawColor(212, 175, 55);
  doc.setLineWidth(0.4);
  doc.line(W / 2 - 60, 51, W / 2 + 60, 51);

  // ── Certificate of Completion ─────────────────────────────────────────────
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('Certificate of Completion', W / 2, 65, { align: 'center' });

  // ── Presented to ─────────────────────────────────────────────────────────
  doc.setTextColor(180, 180, 180);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('This is to certify that', W / 2, 76, { align: 'center' });

  // ── Student name ─────────────────────────────────────────────────────────
  doc.setTextColor(212, 175, 55);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.text(studentName, W / 2, 92, { align: 'center' });

  // Underline
  const nameWidth = doc.getTextWidth(studentName);
  doc.setDrawColor(212, 175, 55);
  doc.setLineWidth(0.5);
  doc.line(W / 2 - nameWidth / 2, 94, W / 2 + nameWidth / 2, 94);

  // ── Has successfully completed ────────────────────────────────────────────
  doc.setTextColor(180, 180, 180);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('has successfully completed the course', W / 2, 103, { align: 'center' });

  // ── Course name ───────────────────────────────────────────────────────────
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(cert.course.title, W / 2, 115, { align: 'center' });

  if (cert.course.category) {
    doc.setTextColor(150, 180, 220);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(cert.course.category, W / 2, 121, { align: 'center' });
  }

  // ── Bottom divider ────────────────────────────────────────────────────────
  doc.setDrawColor(212, 175, 55);
  doc.setLineWidth(0.4);
  doc.line(W / 2 - 80, 132, W / 2 + 80, 132);

  // ── Bottom section: date + cert ID ────────────────────────────────────────
  const issueDate = new Date(cert.issued_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
  const certId = cert.certificate_id || cert.verification_code || cert.id.substring(0, 8).toUpperCase();

  // Left: issue date
  doc.setTextColor(180, 180, 180);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('ISSUED ON', 70, 142, { align: 'center' });
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(issueDate, 70, 148, { align: 'center' });

  // Middle: seal placeholder
  doc.setDrawColor(212, 175, 55);
  doc.setLineWidth(0.8);
  doc.circle(W / 2, 147, 12);
  doc.setDrawColor(212, 175, 55);
  doc.setLineWidth(0.4);
  doc.circle(W / 2, 147, 10);
  doc.setTextColor(212, 175, 55);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.text('OFFICIAL', W / 2, 145, { align: 'center' });
  doc.text('SEAL', W / 2, 150, { align: 'center' });

  // Right: cert ID
  doc.setTextColor(180, 180, 180);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('CERTIFICATE ID', W - 70, 142, { align: 'center' });
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(certId, W - 70, 148, { align: 'center' });

  // ── Verify URL ────────────────────────────────────────────────────────────
  doc.setDrawColor(212, 175, 55);
  doc.setLineWidth(0.2);
  doc.line(W / 2 - 80, 158, W / 2 + 80, 158);

  doc.setTextColor(120, 140, 160);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(`Verify at: ${window.location.origin}/verify/${certId}`, W / 2, 163, { align: 'center' });

  return doc;
}

export default function StudentCertificates() {
  const { profile } = useAuth();
  const [certificates, setCertificates] = useState<CertificateWithCourse[]>([]);
  const [loading, setLoading]           = useState(true);
  const [downloading, setDownloading]   = useState<string | null>(null);
  const [emailing, setEmailing]         = useState<string | null>(null);

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

  const handleDownload = async (cert: CertificateWithCourse) => {
    if (!profile) return;
    setDownloading(cert.id);
    try {
      const doc = await generateCertificatePDF(cert, profile.full_name || 'Student');
      const certId = cert.certificate_id || cert.verification_code || cert.id.substring(0, 8).toUpperCase();
      doc.save(`${PLATFORM.replace(/\s/g, '_')}_Certificate_${certId}.pdf`);
      toast.success('Certificate downloaded!');
    } catch {
      toast.error('Failed to generate PDF. Please try again.');
    } finally {
      setDownloading(null);
    }
  };

  const handleEmailCopy = async (cert: CertificateWithCourse) => {
    if (!profile) return;
    setEmailing(cert.id);
    try {
      // Generate PDF as blob, then open email client with instructions
      // (Full SMTP would need an edge function — here we open mailto with cert details)
      const certId = cert.certificate_id || cert.verification_code || cert.id.substring(0, 8).toUpperCase();
      const subject = encodeURIComponent(`Your ${PLATFORM} Certificate — ${cert.course.title}`);
      const body = encodeURIComponent(
        `Hi ${profile.full_name},\n\nCongratulations on completing "${cert.course.title}"!\n\nCertificate ID: ${certId}\nIssued: ${new Date(cert.issued_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}\n\nVerify at: ${window.location.origin}/verify/${certId}\n\n— ${PLATFORM}`
      );
      window.open(`mailto:${profile.email}?subject=${subject}&body=${body}`);
      toast.success('Email client opened with your certificate details.');
    } catch {
      toast.error('Could not open email client.');
    } finally {
      setEmailing(null);
    }
  };

  return (
    <DashboardLayout navItems={studentNavItems} title="My Certificates" subtitle="Your earned achievements">
      <div className="space-y-6">
        {loading ? (
          <div className="grid md:grid-cols-2 gap-6">
            {[1, 2].map(i => <div key={i} className="bg-white dark:bg-navy-800 rounded-2xl h-48 animate-pulse border border-gray-100 dark:border-navy-700" />)}
          </div>
        ) : certificates.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 bg-amber-50 dark:bg-amber-900/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Award className="w-10 h-10 text-amber-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No certificates yet</h3>
            <p className="text-gray-500 dark:text-gray-400">Pass all required quizzes in a course to earn your certificate.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {certificates.map(cert => {
              const certId = cert.certificate_id || cert.verification_code || cert.id.substring(0, 8).toUpperCase();
              return (
                <div key={cert.id} className="group relative rounded-2xl overflow-hidden border border-gray-100 dark:border-navy-700 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5 bg-white dark:bg-navy-800">

                  {/* Certificate preview banner */}
                  <div className="relative h-40 bg-gradient-to-br from-[#0a1430] via-[#0d1e4a] to-[#0a1430] overflow-hidden">
                    {/* Decorative rings */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-10">
                      <div className="w-48 h-48 border-2 border-amber-400 rounded-full" />
                      <div className="absolute w-36 h-36 border border-amber-400 rounded-full" />
                    </div>
                    {/* Gold border lines */}
                    <div className="absolute inset-3 border border-amber-400/40 rounded-xl" />
                    <div className="absolute inset-4 border border-amber-400/20 rounded-xl" />

                    <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
                      <p className="text-amber-400 text-xs font-bold tracking-[0.2em] uppercase mb-2">{PLATFORM}</p>
                      <Award className="w-8 h-8 text-amber-400 mb-2" />
                      <p className="text-white font-bold text-base leading-tight line-clamp-2">{cert.course.title}</p>
                      <p className="text-amber-400/70 text-xs mt-1 font-semibold tracking-wide">Certificate of Completion</p>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          <Calendar className="w-3.5 h-3.5 text-gray-400" />
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Issued {new Date(cert.issued_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        </div>
                        <p className="text-xs font-mono text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-navy-700 px-2 py-0.5 rounded-md inline-block">{certId}</p>
                      </div>
                      <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 rounded-lg">
                        <Shield className="w-3.5 h-3.5" />
                        <span className="text-xs font-semibold">Verified</span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDownload(cert)}
                        disabled={downloading === cert.id}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-60 shadow-sm"
                      >
                        {downloading === cert.id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Download className="w-4 h-4" />}
                        Download PDF
                      </button>
                      <button
                        onClick={() => handleEmailCopy(cert)}
                        disabled={emailing === cert.id}
                        className="flex items-center justify-center gap-2 px-3 py-2.5 bg-sky-100 dark:bg-sky-900/20 hover:bg-sky-200 dark:hover:bg-sky-900/40 text-sky-700 dark:text-sky-400 text-sm font-semibold rounded-xl transition-colors disabled:opacity-60"
                        title="Send to email"
                      >
                        {emailing === cert.id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Mail className="w-4 h-4" />}
                      </button>
                      <a
                        href={`/verify/${certId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 px-3 py-2.5 border border-gray-200 dark:border-navy-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-navy-700 text-sm font-medium rounded-xl transition-colors"
                        title="Verify"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Info section */}
        <div className="rounded-2xl bg-gradient-to-br from-[#0a1430] to-[#0d1e4a] border border-amber-500/20 p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center shrink-0">
              <Shield className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h3 className="font-bold text-white mb-1">Verified & Secure Certificates</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Each {PLATFORM} certificate is digitally generated as a professional PDF with a unique verification ID.
                Download your certificate or share the verify link with employers, LinkedIn, or academic institutions.
              </p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
