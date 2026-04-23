import { useState, useEffect } from 'react';
import { Plus, FileText, Check, ChevronDown, ChevronUp } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { teacherNavItems } from './teacherNav';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import Badge from '../../components/ui/Badge';
import type { Assignment, AssignmentSubmission, Course } from '../../types';

export default function TeacherAssignments() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [assignments, setAssignments] = useState<(Assignment & { submissions?: AssignmentSubmission[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [gradingTarget, setGradingTarget] = useState<AssignmentSubmission | null>(null);
  const [grade, setGrade] = useState('');
  const [feedback, setFeedback] = useState('');
  const [form, setForm] = useState({ course_id: '', title: '', description: '', due_date: '', max_marks: 100 });
  const [creating, setCreating] = useState(false);
  const [grading, setGrading] = useState(false);
  const { profile } = useAuth();
  const { toast } = useToast();

  const fetchData = async () => {
    if (!profile) return;
    const { data: coursesData } = await supabase.from('courses').select('id, title').eq('teacher_id', profile.id);
    if (coursesData) {
      setCourses(coursesData as Course[]);
      const courseIds = coursesData.map(c => c.id);
      if (courseIds.length > 0) {
        const { data } = await supabase.from('assignments').select('*, submissions:assignment_submissions(*, student:profiles(full_name, email))').in('course_id', courseIds).order('created_at', { ascending: false });
        if (data) setAssignments(data as (Assignment & { submissions?: AssignmentSubmission[] })[]);
      }
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [profile]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    const { error } = await supabase.from('assignments').insert({
      course_id: form.course_id, title: form.title, description: form.description,
      due_date: form.due_date || null, max_marks: form.max_marks,
    });
    if (!error) { toast.success('Assignment created'); setShowCreate(false); fetchData(); }
    else toast.error('Failed to create');
    setCreating(false);
  };

  const handleGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gradingTarget) return;
    setGrading(true);
    await supabase.from('assignment_submissions').update({ grade: parseInt(grade), feedback, graded_at: new Date().toISOString() }).eq('id', gradingTarget.id);
    toast.success('Grade submitted');
    setGradingTarget(null);
    fetchData();
    setGrading(false);
  };

  return (
    <DashboardLayout navItems={teacherNavItems} title="Assignments" subtitle="Create assignments and grade student submissions">
      <div className="space-y-5">
        <div className="flex justify-end">
          <button onClick={() => setShowCreate(true)} className="btn-primary text-sm py-2 flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Assignment
          </button>
        </div>

        {loading ? (
          <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="card p-5 animate-pulse"><div className="h-5 bg-gray-200 dark:bg-navy-700 rounded w-1/3 mb-2" /></div>)}</div>
        ) : assignments.length === 0 ? (
          <div className="card text-center py-16">
            <FileText className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">No assignments yet</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Create your first assignment for students to complete.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {assignments.map(a => {
              const subs = a.submissions || [];
              const pending = subs.filter(s => s.grade == null).length;
              return (
                <div key={a.id} className="card">
                  <div className="flex items-center justify-between p-4 cursor-pointer" onClick={() => setExpanded(expanded === a.id ? null : a.id)}>
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-semibold text-gray-900 dark:text-white text-sm">{a.title}</h3>
                        {pending > 0 && <Badge variant="warning">{pending} pending</Badge>}
                      </div>
                      <p className="text-xs text-gray-400">
                        {a.due_date ? `Due: ${new Date(a.due_date).toLocaleDateString('en-AU')}` : 'No due date'} • Max {a.max_marks} marks • {subs.length} submissions
                      </p>
                    </div>
                    {expanded === a.id ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                  </div>
                  {expanded === a.id && (
                    <div className="border-t border-gray-100 dark:border-navy-700">
                      {a.description && <p className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-navy-700/30">{a.description}</p>}
                      {subs.length === 0 ? (
                        <div className="p-6 text-center text-sm text-gray-400">No submissions yet</div>
                      ) : (
                        <div className="divide-y divide-gray-50 dark:divide-navy-700">
                          {subs.map(sub => {
                            const student = sub.student as { full_name?: string; email?: string } | undefined;
                            return (
                              <div key={sub.id} className="flex items-center gap-3 p-4">
                                <div className="w-8 h-8 rounded-full bg-navy-100 dark:bg-navy-700 flex items-center justify-center text-xs font-bold text-navy-700 dark:text-navy-200 shrink-0">
                                  {student?.full_name?.[0] || '?'}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900 dark:text-white">{student?.full_name}</p>
                                  <p className="text-xs text-gray-400">{new Date(sub.submitted_at).toLocaleDateString('en-AU')}</p>
                                  {sub.content && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">{sub.content}</p>}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {sub.grade != null ? (
                                    <span className="text-sm font-bold text-green-600 dark:text-green-400">{sub.grade}/{a.max_marks}</span>
                                  ) : (
                                    <button onClick={() => { setGradingTarget(sub); setGrade(''); setFeedback(''); }} className="flex items-center gap-1 px-3 py-1.5 bg-gold-500 text-white text-xs font-medium rounded-lg hover:bg-gold-600 transition-colors">
                                      <Check className="w-3.5 h-3.5" /> Grade
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowCreate(false)} />
          <div className="relative bg-white dark:bg-navy-800 rounded-2xl shadow-2xl w-full max-w-md p-6 animate-slide-up">
            <h3 className="font-playfair text-xl font-bold text-gray-900 dark:text-white mb-5">Create Assignment</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Course</label>
                <select value={form.course_id} onChange={e => setForm(f => ({ ...f, course_id: e.target.value }))} className="input-field" required>
                  <option value="">Select course...</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Title</label>
                <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="input-field" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="input-field resize-none" rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Due Date</label>
                  <input type="datetime-local" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Max Marks</label>
                  <input type="number" min="1" value={form.max_marks} onChange={e => setForm(f => ({ ...f, max_marks: parseInt(e.target.value) }))} className="input-field" required />
                </div>
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm border border-gray-200 dark:border-navy-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors">Cancel</button>
                <button type="submit" disabled={creating} className="btn-primary text-sm py-2 disabled:opacity-60">{creating ? 'Creating...' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {gradingTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setGradingTarget(null)} />
          <div className="relative bg-white dark:bg-navy-800 rounded-2xl shadow-2xl w-full max-w-md p-6 animate-slide-up">
            <h3 className="font-playfair text-xl font-bold text-gray-900 dark:text-white mb-4">Grade Submission</h3>
            {gradingTarget.content && (
              <div className="bg-gray-50 dark:bg-navy-700 rounded-xl p-4 mb-4">
                <p className="text-xs text-gray-400 mb-1">Student's Answer</p>
                <p className="text-sm text-gray-700 dark:text-gray-300">{gradingTarget.content}</p>
              </div>
            )}
            <form onSubmit={handleGrade} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Grade</label>
                <input type="number" min="0" value={grade} onChange={e => setGrade(e.target.value)} className="input-field" placeholder="Enter marks" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Feedback</label>
                <textarea value={feedback} onChange={e => setFeedback(e.target.value)} className="input-field resize-none" rows={3} placeholder="Write feedback for the student..." />
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setGradingTarget(null)} className="px-4 py-2 text-sm border border-gray-200 dark:border-navy-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors">Cancel</button>
                <button type="submit" disabled={grading} className="btn-primary text-sm py-2 disabled:opacity-60">{grading ? 'Saving...' : 'Submit Grade'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
