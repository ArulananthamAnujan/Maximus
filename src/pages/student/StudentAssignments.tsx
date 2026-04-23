import { useState, useEffect } from 'react';
import { FileText, Upload, Clock, CheckCircle2, AlertCircle, Star } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { studentNavItems } from './studentNav';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import type { Assignment, AssignmentSubmission } from '../../types';

interface AssignmentWithSubmission extends Assignment {
  course: { title: string };
  submission: AssignmentSubmission | null;
}

export default function StudentAssignments() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [assignments, setAssignments] = useState<AssignmentWithSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    fetchData();
  }, [profile]);

  const fetchData = async () => {
    if (!profile) return;
    const { data: enrollments } = await supabase.from('enrollments').select('course_id').eq('student_id', profile.id);
    const courseIds = (enrollments || []).map(e => e.course_id);
    if (courseIds.length === 0) { setLoading(false); return; }

    const [assignRes, subRes] = await Promise.all([
      supabase.from('assignments').select('*, course:courses(title)').in('course_id', courseIds).order('due_date', { ascending: true }),
      supabase.from('assignment_submissions').select('*').eq('student_id', profile.id),
    ]);

    const submissionMap = new Map((subRes.data || []).map(s => [s.assignment_id, s]));
    setAssignments((assignRes.data || []).map(a => ({ ...a, submission: submissionMap.get(a.id) || null })) as AssignmentWithSubmission[]);
    setLoading(false);
  };

  const handleSubmit = async (assignmentId: string) => {
    if (!profile || !drafts[assignmentId]?.trim()) {
      toast.error('Please write your submission before submitting.'); return;
    }
    setSubmitting(assignmentId);
    const { error } = await supabase.from('assignment_submissions').upsert({
      assignment_id: assignmentId,
      student_id: profile.id,
      content: drafts[assignmentId],
      submitted_at: new Date().toISOString(),
    }, { onConflict: 'assignment_id,student_id' });
    if (error) {
      toast.error('Submission failed. Please try again.');
    } else {
      toast.success('Assignment submitted successfully!');
      setDrafts(prev => { const n = { ...prev }; delete n[assignmentId]; return n; });
      fetchData();
    }
    setSubmitting(null);
  };

  const getStatus = (a: AssignmentWithSubmission) => {
    if (!a.submission) {
      if (a.due_date && new Date(a.due_date) < new Date()) return 'overdue';
      return 'pending';
    }
    if (a.submission.grade !== null) return 'graded';
    return 'submitted';
  };

  const statusConfig = {
    pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', icon: <Clock className="w-3 h-3" /> },
    overdue: { label: 'Overdue', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: <AlertCircle className="w-3 h-3" /> },
    submitted: { label: 'Submitted', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: <CheckCircle2 className="w-3 h-3" /> },
    graded: { label: 'Graded', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: <Star className="w-3 h-3" /> },
  };

  return (
    <DashboardLayout navItems={studentNavItems} title="Assignments" subtitle="Submit and track your assignments">
      <div className="space-y-4">
        {loading ? (
          <div className="space-y-4">
            {[1,2,3].map(i => <div key={i} className="card p-5 animate-pulse h-28" />)}
          </div>
        ) : assignments.length === 0 ? (
          <div className="text-center py-20">
            <FileText className="w-12 h-12 text-gray-300 dark:text-navy-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400">No assignments yet</p>
          </div>
        ) : (
          assignments.map(a => {
            const status = getStatus(a);
            const cfg = statusConfig[status];
            const isExpanded = expanded === a.id;
            const daysLeft = a.due_date ? Math.ceil((new Date(a.due_date).getTime() - Date.now()) / 86400000) : null;

            return (
              <div key={a.id} className="card overflow-visible">
                <button
                  onClick={() => setExpanded(isExpanded ? null : a.id)}
                  className="w-full flex items-center gap-4 p-5 text-left hover:bg-gray-50 dark:hover:bg-navy-700/50 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-gold-100 dark:bg-gold-900/30 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-gold-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-white truncate">{a.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{a.course?.title}</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className={`badge flex items-center gap-1 ${cfg.color}`}>{cfg.icon}{cfg.label}</span>
                      {a.due_date && (
                        <span className={`text-xs ${daysLeft !== null && daysLeft < 0 ? 'text-red-500' : daysLeft !== null && daysLeft <= 3 ? 'text-orange-500' : 'text-gray-400'}`}>
                          Due: {new Date(a.due_date).toLocaleDateString('en-AU')}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">Max: {a.max_marks} marks</span>
                    </div>
                  </div>
                  {a.submission?.grade !== null && a.submission?.grade !== undefined && (
                    <div className="text-right shrink-0">
                      <p className="text-2xl font-bold font-playfair text-green-600">{a.submission.grade}</p>
                      <p className="text-xs text-gray-400">/{a.max_marks}</p>
                    </div>
                  )}
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-100 dark:border-navy-700 p-5 space-y-4">
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Instructions</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{a.description}</p>
                    </div>

                    {a.submission?.grade !== null && a.submission?.grade !== undefined && a.submission.feedback && (
                      <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
                        <p className="text-sm font-medium text-green-800 dark:text-green-400 mb-1">Teacher Feedback</p>
                        <p className="text-sm text-green-700 dark:text-green-300">{a.submission.feedback}</p>
                      </div>
                    )}

                    {a.submission && (
                      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                        <p className="text-sm font-medium text-blue-800 dark:text-blue-400 mb-1">Your Submission</p>
                        <p className="text-sm text-blue-700 dark:text-blue-300">{a.submission.content}</p>
                        <p className="text-xs text-blue-400 mt-2">Submitted {new Date(a.submission.submitted_at).toLocaleDateString('en-AU')}</p>
                      </div>
                    )}

                    {!a.submission && status !== 'overdue' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Your Answer</label>
                        <textarea
                          value={drafts[a.id] || ''}
                          onChange={e => setDrafts(prev => ({ ...prev, [a.id]: e.target.value }))}
                          className="input-field min-h-32 resize-none"
                          placeholder="Write your submission here..."
                        />
                        <div className="flex items-center justify-between mt-3">
                          <div className="flex items-center gap-2 text-xs text-gray-400">
                            <Upload className="w-3.5 h-3.5" />
                            File upload coming soon
                          </div>
                          <button
                            onClick={() => handleSubmit(a.id)}
                            disabled={submitting === a.id}
                            className="btn-primary text-sm"
                          >
                            {submitting === a.id ? 'Submitting...' : 'Submit Assignment'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </DashboardLayout>
  );
}
