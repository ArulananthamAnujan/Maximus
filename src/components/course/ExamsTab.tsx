import { useEffect, useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp, Clock, X, Sparkles, ClipboardList } from 'lucide-react';
import NumberInput from '../ui/NumberInput';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface ExamQuestion { id: string; question: string; marks: number; sample_answer: string; order_index: number; }
interface Exam { id: string; course_id: string; title: string; description: string; instructions: string; passage: string; time_limit_minutes: number; total_marks: number; is_published: boolean; questions: ExamQuestion[]; }

/** Written exams for a course: reading passages and open answers, AI graded and teacher reviewed. */
export default function ExamsTab({ courseId, courseTitle }: { courseId: string; courseTitle: string }) {
  const selectedCourse = courseId;
  const courses = [{ id: courseId, title: courseTitle }];
  const { profile } = useAuth();
  const [exams, setExams] = useState<Exam[]>([]);
  const [expandedExam, setExpandedExam] = useState<string | null>(null);
  const [showExamCreate, setShowExamCreate] = useState(false);
  const [examForm, setExamForm] = useState({ title: '', description: '', instructions: 'Read the passage carefully and answer all questions in full sentences.', passage: '', time_limit_minutes: '60' });
  const [examQuestions, setExamQuestions] = useState<{ question: string; marks: number; sample_answer: string }[]>([{ question: '', marks: 5, sample_answer: '' }]);
  const [savingExam, setSavingExam] = useState(false);
  const [showAIExamGenerator, setShowAIExamGenerator] = useState(false);
  const [aiExamForm, setAIExamForm] = useState({ topic: '', exam_type: 'reading_comprehension' as 'reading_comprehension' | 'question_only', difficulty: 'intermediate', num_questions: 5, marks_per_question: 5, target_audience: '', extra_instructions: '' });
  const [generatingExam, setGeneratingExam] = useState(false);

  const fetchExams = async () => {
    const { data } = await supabase.from('exams').select('*, questions:exam_questions(*)').eq('course_id', courseId).order('created_at');
    if (data) setExams(data.map(e => ({ ...e, questions: [...(e.questions || [])].sort((a, b) => a.order_index - b.order_index) })) as Exam[]);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchExams(); }, [courseId]);

  return (
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h2 className="font-bold text-slate-800">Exams</h2>
                    <p className="text-sm text-slate-500 mt-0.5">Reading comprehension and open-answer assessments — AI graded, teacher reviewed</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setShowAIExamGenerator(true)} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg transition-colors">
                      <Sparkles className="w-4 h-4" /> Generate with AI
                    </button>
                    <button onClick={() => { setShowExamCreate(true); setExamForm({ title: '', description: '', instructions: 'Read the passage carefully and answer all questions in full sentences.', passage: '', time_limit_minutes: '60' }); setExamQuestions([{ question: '', marks: 5, sample_answer: '' }]); }} className="btn-primary text-sm py-2 flex items-center gap-2">
                      <Plus className="w-4 h-4" /> New Exam
                    </button>
                  </div>
                </div>

                {exams.length === 0 ? (
                  <div className="text-center py-14 text-slate-400 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                    <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-40" />
                    <p className="font-semibold text-slate-500">No exams yet</p>
                    <p className="text-sm mt-1">Create reading comprehension or open-answer exams for this course</p>
                    <button onClick={() => setShowExamCreate(true)} className="mt-4 btn-primary text-sm py-2 flex items-center gap-2 mx-auto">
                      <Plus className="w-4 h-4" /> Create First Exam
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {exams.map(exam => {
                      const isExpanded = expandedExam === exam.id;
                      return (
                        <div key={exam.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                          <div className="flex items-center gap-3 px-4 py-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-bold text-slate-800">{exam.title}</p>
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${exam.is_published ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                  {exam.is_published ? 'Published' : 'Draft'}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5 flex-wrap">
                                <span>{exam.questions.length} question{exam.questions.length !== 1 ? 's' : ''}</span>
                                <span>{exam.total_marks} marks</span>
                                {exam.time_limit_minutes > 0 && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{exam.time_limit_minutes}m</span>}
                                {exam.passage && <span className="text-sky-500">Reading passage included</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={async () => {
                                  const { error } = await supabase.from('exams').update({ is_published: !exam.is_published }).eq('id', exam.id);
                                  if (!error) fetchExams();
                                }}
                                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${exam.is_published ? 'text-slate-600 border-slate-200 hover:bg-slate-50' : 'text-emerald-600 border-emerald-200 hover:bg-emerald-50'}`}
                              >
                                {exam.is_published ? 'Unpublish' : 'Publish'}
                              </button>
                              <button
                                onClick={() => setExpandedExam(isExpanded ? null : exam.id)}
                                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                              >
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                              <button
                                onClick={async () => {
                                  if (!confirm('Delete this exam and all submissions?')) return;
                                  await supabase.from('exams').delete().eq('id', exam.id);
                                  fetchExams();
                                }}
                                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="border-t border-slate-100 bg-slate-50 px-4 py-4 space-y-4">
                              {/* Passage preview */}
                              {exam.passage && (
                                <div>
                                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Reading Passage</p>
                                  <p className="text-sm text-slate-600 bg-white border border-slate-200 rounded-lg p-3 line-clamp-4">{exam.passage}</p>
                                </div>
                              )}
                              {/* Questions list */}
                              <div>
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Questions</p>
                                <div className="space-y-2">
                                  {exam.questions.map((q, qi) => (
                                    <div key={q.id} className="flex items-start gap-3 bg-white border border-slate-200 rounded-lg px-3 py-2.5">
                                      <span className="text-xs font-bold text-slate-400 mt-0.5 shrink-0">Q{qi + 1}</span>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-slate-700">{q.question}</p>
                                        {q.sample_answer && <p className="text-xs text-slate-400 mt-0.5 truncate">Model: {q.sample_answer}</p>}
                                      </div>
                                      <span className="text-xs font-bold text-teal-600 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full shrink-0">{q.marks}m</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Create Exam modal */}
                {showExamCreate && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                    <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
                      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                        <h3 className="font-bold text-slate-900 text-lg">Create Exam</h3>
                        <button onClick={() => setShowExamCreate(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="p-6 space-y-5">
                        {/* Basic details */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="col-span-2">
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Exam Title <span className="text-red-500">*</span></label>
                            <input type="text" value={examForm.title} onChange={e => setExamForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. IELTS Reading Practice — Academic Band 7" className="input-field text-sm w-full" />
                          </div>
                          <div className="col-span-2">
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Description</label>
                            <input type="text" value={examForm.description} onChange={e => setExamForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description shown to students" className="input-field text-sm w-full" />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Time Limit (minutes, 0 = no limit)</label>
                            <input type="number" min={0} step="1" value={examForm.time_limit_minutes} onChange={e => setExamForm(f => ({ ...f, time_limit_minutes: e.target.value }))} className="input-field text-sm w-full" />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Instructions for Students</label>
                            <input type="text" value={examForm.instructions} onChange={e => setExamForm(f => ({ ...f, instructions: e.target.value }))} className="input-field text-sm w-full" />
                          </div>
                        </div>

                        {/* Passage */}
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Reading Passage / Stimulus Text</label>
                          <p className="text-xs text-slate-400 mb-2">Paste the article, paragraph, or stimulus students read before answering. Leave blank for pure question-answer format.</p>
                          <textarea
                            value={examForm.passage}
                            onChange={e => setExamForm(f => ({ ...f, passage: e.target.value }))}
                            placeholder="Paste the reading passage here (e.g. IELTS Academic Reading text, news article, literature extract)..."
                            rows={6}
                            className="input-field text-sm w-full resize-none"
                          />
                        </div>

                        {/* Questions */}
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <label className="text-xs font-semibold text-slate-600">Questions</label>
                            <button type="button" onClick={() => setExamQuestions(q => [...q, { question: '', marks: 5, sample_answer: '' }])} className="text-xs font-semibold text-teal-600 hover:text-teal-700 flex items-center gap-1 border border-teal-200 hover:bg-teal-50 rounded-lg px-3 py-1.5 transition-colors">
                              <Plus className="w-3 h-3" /> Add Question
                            </button>
                          </div>
                          <div className="space-y-3">
                            {examQuestions.map((q, idx) => (
                              <div key={idx} className="border border-slate-200 rounded-xl p-4 bg-slate-50">
                                <div className="flex items-center justify-between mb-3">
                                  <span className="text-xs font-bold text-slate-500">Question {idx + 1}</span>
                                  {examQuestions.length > 1 && (
                                    <button type="button" onClick={() => setExamQuestions(qs => qs.filter((_, i) => i !== idx))} className="p-1 text-slate-400 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                                  )}
                                </div>
                                <div className="space-y-3">
                                  <div className="flex gap-3">
                                    <div className="flex-1">
                                      <label className="block text-xs font-semibold text-slate-500 mb-1">Question Text <span className="text-red-500">*</span></label>
                                      <textarea value={q.question} onChange={e => setExamQuestions(qs => qs.map((x, i) => i === idx ? { ...x, question: e.target.value } : x))} placeholder="e.g. According to the passage, what are the two main causes mentioned by the author?" rows={2} className="input-field text-sm w-full resize-none" />
                                    </div>
                                    <div className="w-20 shrink-0">
                                      <label className="block text-xs font-semibold text-slate-500 mb-1">Marks</label>
                                      <NumberInput min={1} step="1" value={q.marks} onChange={n => setExamQuestions(qs => qs.map((x, i) => i === idx ? { ...x, marks: n } : x))} className="input-field text-sm w-full" />
                                    </div>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1">Model Answer <span className="text-slate-400 font-normal">(AI uses this to grade students)</span></label>
                                    <textarea value={q.sample_answer} onChange={e => setExamQuestions(qs => qs.map((x, i) => i === idx ? { ...x, sample_answer: e.target.value } : x))} placeholder="Write the ideal answer. Be specific — the more detail, the better the AI grading." rows={2} className="input-field text-sm w-full resize-none text-slate-600" />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center justify-between mt-2 text-xs text-slate-400">
                            <span>{examQuestions.length} question{examQuestions.length !== 1 ? 's' : ''}</span>
                            <span className="font-semibold text-teal-600">Total: {examQuestions.reduce((s, q) => s + q.marks, 0)} marks</span>
                          </div>
                        </div>

                        <div className="flex gap-3 pt-2 border-t border-slate-100">
                          <button type="button" onClick={() => setShowExamCreate(false)} className="flex-1 px-4 py-2.5 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 font-medium transition-colors">Cancel</button>
                          <button
                            type="button"
                            disabled={savingExam}
                            onClick={async () => {
                              if (!selectedCourse || !profile) return;
                              if (!examForm.title.trim()) { return; }
                              if (examQuestions.some(q => !q.question.trim())) { return; }
                              setSavingExam(true);
                              try {
                                const totalMarks = examQuestions.reduce((s, q) => s + q.marks, 0);
                                const { data: exam, error } = await supabase.from('exams').insert({
                                  course_id: selectedCourse,
                                  teacher_id: profile.id,
                                  title: examForm.title,
                                  description: examForm.description,
                                  instructions: examForm.instructions,
                                  passage: examForm.passage,
                                  time_limit_minutes: parseInt(examForm.time_limit_minutes) || 0,
                                  total_marks: totalMarks,
                                  is_published: false,
                                }).select().single();
                                if (error) throw error;
                                const qRows = examQuestions.map((q, i) => ({ exam_id: exam.id, question: q.question, marks: q.marks, sample_answer: q.sample_answer, order_index: i }));
                                await supabase.from('exam_questions').insert(qRows);
                                setShowExamCreate(false);
                                fetchExams();
                              } catch {
                                // silent — user sees no change, can retry
                              } finally {
                                setSavingExam(false);
                              }
                            }}
                            className="flex-1 btn-primary text-sm py-2.5 flex items-center justify-center gap-2 disabled:opacity-60"
                          >
                            {savingExam ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving...</> : <><Plus className="w-4 h-4" /> Create Exam</>}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {/* AI Exam Generator modal */}
                {showAIExamGenerator && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                    <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
                      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-sky-50 to-white">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-5 h-5 text-sky-500" />
                          <h3 className="font-bold text-slate-900">Generate Exam with AI</h3>
                        </div>
                        <button onClick={() => setShowAIExamGenerator(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="p-6 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="col-span-2">
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Topic / Subject <span className="text-red-500">*</span></label>
                            <input
                              type="text"
                              value={aiExamForm.topic}
                              onChange={e => setAIExamForm(f => ({ ...f, topic: e.target.value }))}
                              placeholder="e.g. IELTS Academic Reading — Environmental Issues"
                              className="input-field text-sm w-full"
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Exam Type</label>
                            <div className="grid grid-cols-2 gap-2">
                              {(['reading_comprehension', 'question_only'] as const).map(t => (
                                <button
                                  key={t}
                                  type="button"
                                  onClick={() => setAIExamForm(f => ({ ...f, exam_type: t }))}
                                  className={`py-2.5 px-3 rounded-lg border text-sm font-medium transition-colors text-left ${aiExamForm.exam_type === t ? 'bg-sky-50 border-sky-400 text-sky-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                                >
                                  {t === 'reading_comprehension' ? '📖 Reading Comprehension' : '✍️ Question Only'}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Difficulty / Level</label>
                            <select value={aiExamForm.difficulty} onChange={e => setAIExamForm(f => ({ ...f, difficulty: e.target.value }))} className="input-field text-sm w-full">
                              <option value="beginner">Beginner</option>
                              <option value="intermediate">Intermediate</option>
                              <option value="upper_intermediate">Upper Intermediate (Band 6-7)</option>
                              <option value="advanced">Advanced (Band 7-8)</option>
                              <option value="proficient">Proficient (Band 8-9)</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Target Audience</label>
                            <input type="text" value={aiExamForm.target_audience} onChange={e => setAIExamForm(f => ({ ...f, target_audience: e.target.value }))} placeholder="e.g. Adult IELTS candidates" className="input-field text-sm w-full" />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Number of Questions</label>
                            <select value={aiExamForm.num_questions} onChange={e => setAIExamForm(f => ({ ...f, num_questions: parseInt(e.target.value) }))} className="input-field text-sm w-full">
                              {[3,4,5,6,7,8,10].map(n => <option key={n} value={n}>{n} questions</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Marks per Question</label>
                            <select value={aiExamForm.marks_per_question} onChange={e => setAIExamForm(f => ({ ...f, marks_per_question: parseInt(e.target.value) }))} className="input-field text-sm w-full">
                              {[2,3,4,5,8,10].map(n => <option key={n} value={n}>{n} marks</option>)}
                            </select>
                          </div>
                          <div className="col-span-2">
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Extra Instructions <span className="text-slate-400 font-normal">(optional)</span></label>
                            <input type="text" value={aiExamForm.extra_instructions} onChange={e => setAIExamForm(f => ({ ...f, extra_instructions: e.target.value }))} placeholder="e.g. Focus on inference questions, use formal register" className="input-field text-sm w-full" />
                          </div>
                        </div>
                        <div className="bg-sky-50 rounded-xl p-3 text-xs text-sky-700">
                          AI will generate a full exam: {aiExamForm.exam_type === 'reading_comprehension' ? 'reading passage + ' : ''}{aiExamForm.num_questions} questions with model answers · {aiExamForm.num_questions * aiExamForm.marks_per_question} total marks
                        </div>
                        <div className="flex gap-3 pt-1">
                          <button type="button" onClick={() => setShowAIExamGenerator(false)} className="flex-1 px-4 py-2.5 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 font-medium transition-colors">Cancel</button>
                          <button
                            type="button"
                            disabled={generatingExam || !aiExamForm.topic.trim() || !selectedCourse}
                            onClick={async () => {
                              if (!selectedCourse || !profile) return;
                              setGeneratingExam(true);
                              try {
                                const { generateExam } = await import('../../lib/ai');
                                const courseData = courses.find(c => c.id === selectedCourse);
                                const result = await generateExam({
                                  topic: aiExamForm.topic,
                                  course_context: courseData?.title || '',
                                  exam_type: aiExamForm.exam_type,
                                  difficulty: aiExamForm.difficulty,
                                  num_questions: aiExamForm.num_questions,
                                  marks_per_question: aiExamForm.marks_per_question,
                                  target_audience: aiExamForm.target_audience,
                                  extra_instructions: aiExamForm.extra_instructions,
                                });
                                // Save to DB
                                const totalMarks = result.questions.reduce((s, q) => s + q.marks, 0);
                                const { data: exam, error } = await supabase.from('exams').insert({
                                  course_id: selectedCourse,
                                  teacher_id: profile.id,
                                  title: result.title,
                                  description: result.description,
                                  instructions: result.instructions,
                                  passage: result.passage,
                                  time_limit_minutes: result.time_limit_minutes,
                                  total_marks: totalMarks,
                                  is_published: false,
                                }).select().single();
                                if (error) throw error;
                                const qRows = result.questions.map((q, i) => ({
                                  exam_id: exam.id,
                                  question: q.question,
                                  marks: q.marks,
                                  sample_answer: q.sample_answer,
                                  order_index: i,
                                }));
                                await supabase.from('exam_questions').insert(qRows);
                                setShowAIExamGenerator(false);
                                fetchExams();
                              } catch {
                                // silent retry available
                              } finally {
                                setGeneratingExam(false);
                              }
                            }}
                            className="flex-1 btn-primary text-sm py-2.5 flex items-center justify-center gap-2 disabled:opacity-60"
                          >
                            {generatingExam
                              ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Generating...</>
                              : <><Sparkles className="w-4 h-4" /> Generate Exam</>
                            }
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
  );
}
