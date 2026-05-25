import { useState, useEffect } from 'react';
import { Award, Download, ExternalLink, Shield, Calendar, Mail, Loader2, GraduationCap, CheckCircle2 } from 'lucide-react';
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

  // ── Rich cream/parchment background ─────────────────────────────────────
  doc.setFillColor(252, 248, 240);
  doc.rect(0, 0, W, H, 'F');

  // Subtle texture overlay strips (simulate linen)
  for (let y = 0; y < H; y += 3) {
    doc.setFillColor(245, 240, 228);
    doc.rect(0, y, W, 0.4, 'F');
  }

  // ── Outer gold border (thick) ────────────────────────────────────────────
  doc.setDrawColor(180, 140, 40);
  doc.setLineWidth(3);
  doc.rect(6, 6, W - 12, H - 12);

  // ── Inner gold border (thin) ─────────────────────────────────────────────
  doc.setDrawColor(200, 165, 60);
  doc.setLineWidth(0.6);
  doc.rect(10, 10, W - 20, H - 20);

  // ── Corner ornament squares ───────────────────────────────────────────────
  const corners = [[6,6],[W-14,6],[6,H-14],[W-14,H-14]];
  doc.setFillColor(180, 140, 40);
  corners.forEach(([cx,cy]) => doc.rect(cx, cy, 8, 8, 'F'));
  doc.setFillColor(252, 248, 240);
  corners.forEach(([cx,cy]) => doc.rect(cx+1.5, cy+1.5, 5, 5, 'F'));

  // ── Side ornamental lines ─────────────────────────────────────────────────
  doc.setDrawColor(200, 165, 60);
  doc.setLineWidth(0.3);
  // Top decorative triple line
  doc.line(30, 14, W - 30, 14);
  doc.line(30, 15.5, W - 30, 15.5);
  // Bottom decorative triple line
  doc.line(30, H - 14, W - 30, H - 14);
  doc.line(30, H - 15.5, W - 30, H - 15.5);

  // ── Header background ribbon ──────────────────────────────────────────────
  doc.setFillColor(20, 35, 75);
  doc.rect(10, 18, W - 20, 28, 'F');
  // Gold accent line under ribbon
  doc.setFillColor(200, 165, 60);
  doc.rect(10, 46, W - 20, 1.2, 'F');

  // ── Logo ──────────────────────────────────────────────────────────────────
  const logoB64 = await loadImageAsBase64(LOGO_URL);
  if (logoB64) {
    doc.addImage(logoB64, 'PNG', W / 2 - 16, 20, 32, 16, undefined, 'FAST');
  } else {
    // Fallback: academy name in ribbon
    doc.setTextColor(212, 175, 55);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(PLATFORM.toUpperCase(), W / 2, 34, { align: 'center', charSpace: 3 });
  }

  // ── Platform name below ribbon ────────────────────────────────────────────
  doc.setTextColor(20, 35, 75);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(PLATFORM.toUpperCase(), W / 2, 53, { align: 'center', charSpace: 4 });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(130, 110, 70);
  doc.text(ABN, W / 2, 58, { align: 'center' });

  // ── "Certificate of Completion" title ─────────────────────────────────────
  // Decorative swash line
  doc.setDrawColor(180, 140, 40);
  doc.setLineWidth(0.8);
  doc.line(W / 2 - 55, 64, W / 2 - 18, 64);
  doc.line(W / 2 + 18, 64, W / 2 + 55, 64);
  doc.setFillColor(180, 140, 40);
  doc.circle(W / 2 - 15, 64, 1.5, 'F');
  doc.circle(W / 2 + 15, 64, 1.5, 'F');
  doc.circle(W / 2, 64, 2, 'F');

  doc.setTextColor(20, 35, 75);
  doc.setFont('times', 'italic');
  doc.setFontSize(26);
  doc.text('Certificate of Completion', W / 2, 76, { align: 'center' });

  // ── "This is to certify that" ────────────────────────────────────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 85, 55);
  doc.text('T H I S   I S   T O   C E R T I F Y   T H A T', W / 2, 86, { align: 'center' });

  // ── Student Name ──────────────────────────────────────────────────────────
  doc.setFont('times', 'bolditalic');
  doc.setFontSize(32);
  doc.setTextColor(20, 35, 75);
  doc.text(studentName, W / 2, 101, { align: 'center' });

  // Elegant underline with taper
  const nw = doc.getTextWidth(studentName);
  doc.setDrawColor(180, 140, 40);
  doc.setLineWidth(1.2);
  doc.line(W / 2 - nw / 2, 104, W / 2 + nw / 2, 104);
  doc.setLineWidth(0.3);
  doc.line(W / 2 - nw / 2 - 4, 105.5, W / 2 + nw / 2 + 4, 105.5);

  // ── "has successfully completed" ─────────────────────────────────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 85, 55);
  doc.text('has successfully completed the course', W / 2, 113, { align: 'center' });

  // ── Course title ──────────────────────────────────────────────────────────
  doc.setFont('times', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(20, 35, 75);
  const titleLines = doc.splitTextToSize(cert.course.title, 180) as string[];
  const titleY = titleLines.length > 1 ? 122 : 124;
  doc.text(titleLines, W / 2, titleY, { align: 'center', lineHeightFactor: 1.4 });

  if (cert.course.category) {
    const afterTitle = titleY + (titleLines.length - 1) * 16 * 0.352 * 1.4 + 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(130, 110, 70);
    doc.text(cert.course.category.toUpperCase(), W / 2, afterTitle, { align: 'center', charSpace: 2 });
  }

  // ── Bottom ornament row ───────────────────────────────────────────────────
  const bottomY = 148;
  doc.setFillColor(20, 35, 75);
  doc.rect(10, bottomY, W - 20, 0.8, 'F');
  doc.setFillColor(200, 165, 60);
  doc.rect(10, bottomY + 1.5, W - 20, 0.4, 'F');

  // ── Three-column footer ───────────────────────────────────────────────────
  const issueDate = new Date(cert.issued_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
  const certId = cert.certificate_id || cert.verification_code || cert.id.substring(0, 8).toUpperCase();

  const col1 = 60, col2 = W / 2, col3 = W - 60;
  const labelY = bottomY + 12, valY = bottomY + 18;

  // Labels
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(130, 110, 70);
  ['DATE OF ISSUE', 'AUTHORISED SEAL', 'CERTIFICATE ID'].forEach((lbl, i) => {
    doc.text(lbl, [col1, col2, col3][i], labelY, { align: 'center', charSpace: 1 });
  });

  // Values
  doc.setFont('times', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(20, 35, 75);
  doc.text(issueDate, col1, valY, { align: 'center' });
  doc.text(certId, col3, valY, { align: 'center' });

  // Seal circle
  doc.setDrawColor(180, 140, 40);
  doc.setLineWidth(1.2);
  doc.circle(col2, valY - 2, 11);
  doc.setLineWidth(0.4);
  doc.circle(col2, valY - 2, 8.5);
  doc.setFillColor(20, 35, 75);
  doc.circle(col2, valY - 2, 6, 'F');
  doc.setTextColor(200, 165, 60);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5);
  doc.text('OFFICIAL', col2, valY - 3.5, { align: 'center', charSpace: 0.5 });
  doc.text('SEAL', col2, valY - 0.5, { align: 'center', charSpace: 1 });

  // ── Signature line ─────────────────────────────────────────────────────────
  doc.setDrawColor(130, 110, 70);
  doc.setLineWidth(0.3);
  doc.line(col1 - 28, bottomY + 28, col1 + 28, bottomY + 28);
  doc.line(col3 - 28, bottomY + 28, col3 + 28, bottomY + 28);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(130, 110, 70);
  doc.text('Director of Education', col1, bottomY + 32, { align: 'center' });
  doc.text('Registrar', col3, bottomY + 32, { align: 'center' });

  // ── Verify URL ────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(150, 130, 90);
  doc.text(`Verify this certificate at: ${window.location.origin}/verify/${certId}`, W / 2, H - 13, { align: 'center' });

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
      <div className="space-y-8">

        {loading ? (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white dark:bg-navy-800 rounded-3xl h-64 animate-pulse border border-gray-100 dark:border-navy-700" />
            ))}
          </div>
        ) : certificates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="relative mb-6">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-50 to-yellow-100 dark:from-amber-900/20 dark:to-yellow-900/10 flex items-center justify-center shadow-inner">
                <GraduationCap className="w-12 h-12 text-amber-400" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-white dark:bg-navy-800 rounded-full flex items-center justify-center shadow border border-gray-100 dark:border-navy-700">
                <Award className="w-4 h-4 text-amber-400" />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">No certificates yet</h3>
            <p className="text-gray-500 dark:text-gray-400 max-w-sm">Complete all required lessons and pass any course quizzes to earn your first certificate.</p>
          </div>
        ) : (
          <>
            {/* Certificate cards */}
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
              {certificates.map(cert => {
                const certId = cert.certificate_id || cert.verification_code || cert.id.substring(0, 8).toUpperCase();
                const issueDateShort = new Date(cert.issued_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

                return (
                  <div
                    key={cert.id}
                    className="group relative flex flex-col rounded-3xl overflow-hidden shadow-md hover:shadow-2xl transition-all duration-500 hover:-translate-y-1 bg-white dark:bg-navy-800 border border-gray-100 dark:border-navy-700"
                  >
                    {/* Parchment preview panel */}
                    <div className="relative h-52 overflow-hidden" style={{ background: 'linear-gradient(135deg, #fdf6e3 0%, #f5ead0 50%, #ede0c4 100%)' }}>

                      {/* Outer gold border inside panel */}
                      <div className="absolute inset-2.5 rounded-2xl border-2 border-amber-500/50 pointer-events-none" />
                      <div className="absolute inset-4 rounded-xl border border-amber-400/30 pointer-events-none" />

                      {/* Corner ornaments */}
                      {[['top-2.5 left-2.5','rounded-tl-2xl'],['top-2.5 right-2.5','rounded-tr-2xl'],['bottom-2.5 left-2.5','rounded-bl-2xl'],['bottom-2.5 right-2.5','rounded-br-2xl']].map(([pos]) => (
                        <div key={pos} className={`absolute ${pos} w-4 h-4 bg-amber-500/60`} />
                      ))}
                      <div className="absolute top-2.5 left-2.5 w-3 h-3 bg-amber-100" style={{ margin: '0.5px' }} />
                      <div className="absolute top-2.5 right-2.5 w-3 h-3 bg-amber-100" style={{ margin: '0.5px' }} />
                      <div className="absolute bottom-2.5 left-2.5 w-3 h-3 bg-amber-100" style={{ margin: '0.5px' }} />
                      <div className="absolute bottom-2.5 right-2.5 w-3 h-3 bg-amber-100" style={{ margin: '0.5px' }} />

                      {/* Header ribbon */}
                      <div className="absolute top-6 left-6 right-6 h-7 rounded-lg flex items-center justify-center" style={{ background: '#14234b' }}>
                        <span className="text-amber-400 text-xs font-bold tracking-widest uppercase">{PLATFORM}</span>
                      </div>
                      <div className="absolute top-13 left-6 right-6 h-px bg-amber-500/50" style={{ top: '52px' }} />

                      {/* Main content */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center pt-8 px-5 text-center gap-1.5">
                        {/* Italic title */}
                        <p className="text-xs tracking-wider text-amber-700/80 font-medium" style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
                          Certificate of Completion
                        </p>
                        {/* Divider with dots */}
                        <div className="flex items-center gap-1.5">
                          <div className="h-px w-8 bg-amber-500/50" />
                          <div className="w-1 h-1 rounded-full bg-amber-500/70" />
                          <div className="h-px w-8 bg-amber-500/50" />
                        </div>
                        {/* Awarded to */}
                        <p className="text-xs text-amber-800/60 uppercase tracking-widest">Awarded to</p>
                        <p className="font-bold text-sm text-gray-800 leading-tight" style={{ fontFamily: 'Georgia, serif' }}>
                          {profile?.full_name || 'Student'}
                        </p>
                        <p className="text-xs text-gray-600/70 mt-0.5 leading-snug line-clamp-2" style={{ fontFamily: 'Georgia, serif' }}>
                          {cert.course.title}
                        </p>
                      </div>

                      {/* Bottom date strip */}
                      <div className="absolute bottom-6 left-6 right-6 flex justify-between items-center">
                        <span className="text-xs text-amber-700/60 font-medium">{issueDateShort}</span>
                        <div className="flex items-center gap-1 text-xs text-amber-700/60 font-medium">
                          <CheckCircle2 className="w-3 h-3 text-amber-600" />
                          Verified
                        </div>
                      </div>
                    </div>

                    {/* Card body */}
                    <div className="flex flex-col flex-1 p-5 gap-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-bold text-gray-900 dark:text-white text-sm leading-snug line-clamp-2">
                            {cert.course.title}
                          </p>
                          {cert.course.category && (
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{cert.course.category}</p>
                          )}
                        </div>
                        <div className="shrink-0 flex items-center gap-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 px-2 py-1 rounded-lg">
                          <Shield className="w-3 h-3" />
                          <span className="text-xs font-semibold">Verified</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {issueDateShort}
                        </span>
                        <span className="font-mono bg-gray-50 dark:bg-navy-700 px-2 py-0.5 rounded-md text-gray-500 dark:text-gray-400 truncate max-w-[120px]">
                          {certId}
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 mt-auto">
                        <button
                          onClick={() => handleDownload(cert)}
                          disabled={downloading === cert.id}
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-60 shadow-sm hover:shadow-md active:scale-95"
                          style={{ background: 'linear-gradient(135deg, #b8860b 0%, #d4af37 50%, #b8860b 100%)' }}
                        >
                          {downloading === cert.id
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Download className="w-4 h-4" />}
                          Download PDF
                        </button>
                        <button
                          onClick={() => handleEmailCopy(cert)}
                          disabled={emailing === cert.id}
                          title="Send to email"
                          className="flex items-center justify-center px-3 py-2.5 rounded-xl border border-gray-200 dark:border-navy-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors disabled:opacity-60"
                        >
                          {emailing === cert.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                        </button>
                        <a
                          href={`/verify/${certId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Verify certificate"
                          className="flex items-center justify-center px-3 py-2.5 rounded-xl border border-gray-200 dark:border-navy-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Trust banner */}
            <div className="relative overflow-hidden rounded-3xl border border-amber-200/60 dark:border-amber-800/40 shadow-sm"
              style={{ background: 'linear-gradient(135deg, #fdf6e3 0%, #f5ead0 100%)' }}>
              <div className="absolute top-0 right-0 w-64 h-full opacity-10 pointer-events-none"
                style={{ background: 'radial-gradient(ellipse at top right, #b8860b 0%, transparent 70%)' }} />
              <div className="relative flex items-start gap-5 p-6">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-inner"
                  style={{ background: 'linear-gradient(135deg, #14234b 0%, #1e3a6e 100%)' }}>
                  <GraduationCap className="w-7 h-7 text-amber-400" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 mb-1">Verified Academic Certificates</h3>
                  <p className="text-gray-600 text-sm leading-relaxed max-w-xl">
                    Every {PLATFORM} certificate carries a unique verification code and is signed with a tamper-proof ID.
                    Share the verify link directly with employers, LinkedIn, or academic institutions for instant credential confirmation.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
