import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronLeft, CheckCircle2, Circle, Play, FileText, Link as LinkIcon, BookOpen, Lock, Menu, X } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { studentNavItems } from './studentNav';
import ProgressBar from '../../components/ui/ProgressBar';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import type { Course, Section, Lesson } from '../../types';

interface SectionWithLessons extends Section {
  lessons: Lesson[];
}

export default function StudentCoursePlayer() {
  const { courseId } = useParams<{ courseId: string }>();
  const { profile } = useAuth();
  const { toast } = useToast();
  const [course, setCourse] = useState<Course | null>(null);
  const [sections, setSections] = useState<SectionWithLessons[]>([]);
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [completedLessons, setCompletedLessons] = useState<Set<string>>(new Set());
  const [enrolled, setEnrolled] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    if (!courseId || !profile) return;
    const fetchData = async () => {
      const [courseRes, sectionsRes, progressRes, enrollRes] = await Promise.all([
        supabase.from('courses').select('*, teacher:profiles(full_name, avatar_url)').eq('id', courseId).maybeSingle(),
        supabase.from('sections').select('*, lessons(*)').eq('course_id', courseId).order('order_index'),
        supabase.from('lesson_progress').select('lesson_id').eq('student_id', profile.id),
        supabase.from('enrollments').select('id').eq('student_id', profile.id).eq('course_id', courseId).maybeSingle(),
      ]);

      if (courseRes.data) setCourse(courseRes.data as Course);
      if (sectionsRes.data) {
        const secs = sectionsRes.data.map(s => ({
          ...s,
          lessons: [...(s.lessons || [])].sort((a, b) => a.order_index - b.order_index),
        })) as SectionWithLessons[];
        setSections(secs);
        const firstLesson = secs[0]?.lessons[0];
        if (firstLesson) setActiveLesson(firstLesson);
      }
      if (progressRes.data) setCompletedLessons(new Set(progressRes.data.map(p => p.lesson_id)));
      setEnrolled(!!enrollRes.data);
      setLoading(false);
    };
    fetchData();
  }, [courseId, profile]);

  const allRequired = sections.flatMap(s => s.lessons.filter(l => l.is_required));
  const completedRequired = allRequired.filter(l => completedLessons.has(l.id)).length;
  const progress = allRequired.length > 0 ? Math.round((completedRequired / allRequired.length) * 100) : 0;

  const handleMarkComplete = async () => {
    if (!activeLesson || !profile || completedLessons.has(activeLesson.id)) return;
    setMarking(true);
    const { error } = await supabase.from('lesson_progress').insert({ student_id: profile.id, lesson_id: activeLesson.id });
    if (!error) {
      const newCompleted = new Set(completedLessons).add(activeLesson.id);
      setCompletedLessons(newCompleted);
      const newProgress = allRequired.length > 0 ? Math.round((newCompleted.size / allRequired.length) * 100) : 0;
      await supabase.from('enrollments').update({ progress_percent: newProgress }).eq('student_id', profile.id).eq('course_id', courseId);
      toast.success('Lesson marked as complete!');
    }
    setMarking(false);
  };

  const lessonIcon = (type: Lesson['type']) => {
    const icons = { video: <Play className="w-3.5 h-3.5" />, pdf: <FileText className="w-3.5 h-3.5" />, article: <BookOpen className="w-3.5 h-3.5" />, link: <LinkIcon className="w-3.5 h-3.5" /> };
    return icons[type];
  };

  if (loading) {
    return (
      <DashboardLayout navItems={studentNavItems} title="Loading..." subtitle="">
        <div className="flex items-center justify-center h-64">
          <div className="w-10 h-10 border-4 border-gold-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (!enrolled) {
    return (
      <DashboardLayout navItems={studentNavItems} title="Access Denied" subtitle="">
        <div className="text-center py-20">
          <Lock className="w-12 h-12 text-gray-300 dark:text-navy-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Not Enrolled</h3>
          <p className="text-gray-500 dark:text-gray-400 mb-6">You need to enrol in this course to access the content.</p>
          <Link to="/student/courses" className="btn-primary">Browse Courses</Link>
        </div>
      </DashboardLayout>
    );
  }

  const Sidebar = () => (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-100 dark:border-navy-700">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Course Progress</p>
        <ProgressBar value={progress} />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{completedRequired}/{allRequired.length} lessons completed</p>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {sections.map(section => (
          <div key={section.id} className="border-b border-gray-100 dark:border-navy-700 last:border-0">
            <div className="px-4 py-3 bg-gray-50 dark:bg-navy-900/50">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">{section.title}</p>
            </div>
            {section.lessons.map(lesson => {
              const isCompleted = completedLessons.has(lesson.id);
              const isActive = activeLesson?.id === lesson.id;
              const opensNewTab = (lesson.type === 'video' || lesson.type === 'pdf' || lesson.type === 'link') && lesson.url;
              return (
                <div
                  key={lesson.id}
                  className={`w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-navy-700/50 transition-colors ${isActive ? 'bg-gold-50 dark:bg-gold-900/20 border-l-2 border-gold-500' : ''}`}
                >
                  <button
                    onClick={() => { setActiveLesson(lesson); setSidebarOpen(false); }}
                    className={`mt-0.5 shrink-0 ${isCompleted ? 'text-green-500' : isActive ? 'text-gold-500' : 'text-gray-300 dark:text-navy-600'}`}
                  >
                    {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    {opensNewTab ? (
                      <a
                        href={lesson.url!}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => { setActiveLesson(lesson); setSidebarOpen(false); }}
                        className={`block text-xs font-medium leading-snug hover:underline ${isActive ? 'text-gold-700 dark:text-gold-400' : 'text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400'}`}
                      >
                        {lesson.title}
                      </a>
                    ) : (
                      <button
                        onClick={() => { setActiveLesson(lesson); setSidebarOpen(false); }}
                        className={`text-left text-xs font-medium leading-snug w-full ${isActive ? 'text-gold-700 dark:text-gold-400' : 'text-gray-700 dark:text-gray-300'}`}
                      >
                        {lesson.title}
                      </button>
                    )}
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-xs ${isActive ? 'text-gold-600 dark:text-gold-500' : 'text-gray-400'}`}>{lessonIcon(lesson.type)}</span>
                      {lesson.duration_minutes > 0 && (
                        <span className="text-xs text-gray-400">{lesson.duration_minutes}min</span>
                      )}
                      {opensNewTab && (
                        <LinkIcon className="w-2.5 h-2.5 text-gray-300 dark:text-navy-600" />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <DashboardLayout navItems={studentNavItems} title={course?.title || 'Course Player'} subtitle="">
      <div className="flex gap-0 -m-4 sm:-m-6 h-[calc(100vh-8rem)]">
        <div className="hidden lg:flex flex-col w-72 border-r border-gray-200 dark:border-navy-700 bg-white dark:bg-navy-800 overflow-hidden">
          <Sidebar />
        </div>

        {sidebarOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
            <div className="relative z-10 w-72 bg-white dark:bg-navy-800 flex flex-col">
              <div className="flex items-center justify-between p-3 border-b border-gray-100 dark:border-navy-700">
                <p className="font-semibold text-sm text-gray-900 dark:text-white">Course Content</p>
                <button onClick={() => setSidebarOpen(false)} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <Sidebar />
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          <div className="p-4 sm:p-6">
            <div className="flex items-center gap-3 mb-4">
              <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white">
                <Menu className="w-5 h-5" />
              </button>
              <Link to="/student/courses" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white">
                <ChevronLeft className="w-4 h-4" /> Back to Courses
              </Link>
            </div>

            {activeLesson ? (
              <div>
                <div className="flex items-start justify-between mb-6 gap-4">
                  <div>
                    {(activeLesson.type === 'video' || activeLesson.type === 'pdf' || activeLesson.type === 'link') && activeLesson.url ? (
                      <a
                        href={activeLesson.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center gap-2 mb-1"
                      >
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{activeLesson.title}</h2>
                        <LinkIcon className="w-4 h-4 text-gray-300 dark:text-navy-600 group-hover:text-blue-500 transition-colors shrink-0" />
                      </a>
                    ) : (
                      <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{activeLesson.title}</h2>
                    )}
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                      <span className="capitalize">{activeLesson.type}</span>
                      {activeLesson.duration_minutes > 0 && <span>· {activeLesson.duration_minutes} min</span>}
                      {activeLesson.is_preview && <span className="badge bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Preview</span>}
                    </div>
                  </div>
                  {!completedLessons.has(activeLesson.id) && (
                    <button
                      onClick={handleMarkComplete}
                      disabled={marking}
                      className="btn-primary text-sm shrink-0 flex items-center gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {marking ? 'Saving...' : 'Mark Complete'}
                    </button>
                  )}
                  {completedLessons.has(activeLesson.id) && (
                    <div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm font-medium">
                      <CheckCircle2 className="w-4 h-4" /> Completed
                    </div>
                  )}
                </div>

                {activeLesson.type === 'video' && activeLesson.url && (() => {
                  const url = activeLesson.url;
                  const ytMatch = url.match(/(?:v=|youtu\.be\/)([^&?\s]+)/);
                  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
                  if (ytMatch) {
                    const thumbnail = `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`;
                    return (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded-xl overflow-hidden mb-6 bg-black relative aspect-video group cursor-pointer"
                      >
                        <img src={thumbnail} alt="Video thumbnail" className="w-full h-full object-cover opacity-75 group-hover:opacity-60 transition-opacity" />
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                          <div className="w-16 h-16 bg-red-600 group-hover:bg-red-700 rounded-full flex items-center justify-center shadow-2xl transition-colors">
                            <svg className="w-7 h-7 text-white ml-1" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                          </div>
                          <span className="text-white text-sm font-semibold bg-black/50 px-4 py-1.5 rounded-full backdrop-blur-sm">Watch on YouTube</span>
                        </div>
                      </a>
                    );
                  }
                  if (vimeoMatch) {
                    return (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex flex-col items-center justify-center gap-3 rounded-xl mb-6 bg-gray-900 aspect-video group cursor-pointer hover:bg-gray-800 transition-colors"
                      >
                        <div className="w-16 h-16 bg-blue-500 group-hover:bg-blue-600 rounded-full flex items-center justify-center shadow-2xl transition-colors">
                          <svg className="w-7 h-7 text-white ml-1" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                        </div>
                        <span className="text-white text-sm font-semibold">Watch on Vimeo</span>
                      </a>
                    );
                  }
                  return (
                    <div className="rounded-xl overflow-hidden mb-6 bg-black">
                      <video src={url} controls className="w-full aspect-video" />
                    </div>
                  );
                })()}
                {activeLesson.type === 'video' && !activeLesson.url && (
                  <div className="rounded-xl bg-gray-900 flex items-center justify-center aspect-video mb-6">
                    <div className="text-center text-gray-400">
                      <Play className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Video not available</p>
                    </div>
                  </div>
                )}
                {activeLesson.type === 'article' && (
                  <div className="prose dark:prose-invert max-w-none bg-white dark:bg-navy-800 rounded-xl p-6 border border-gray-100 dark:border-navy-700 mb-6">
                    <p className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{activeLesson.content}</p>
                  </div>
                )}
                {activeLesson.type === 'link' && activeLesson.url && (
                  <div className="bg-white dark:bg-navy-800 rounded-xl p-6 border border-gray-100 dark:border-navy-700 mb-6">
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">External Resource</p>
                    <a href={activeLesson.url} target="_blank" rel="noopener noreferrer" className="btn-primary flex items-center gap-2 w-fit">
                      <LinkIcon className="w-4 h-4" /> Open Resource
                    </a>
                  </div>
                )}
                {activeLesson.type === 'pdf' && activeLesson.url && (
                  <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-100 dark:border-navy-700 mb-6 overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-navy-700 bg-gray-50 dark:bg-navy-900/50">
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <FileText className="w-4 h-4 text-red-500" />
                        <span className="font-medium truncate max-w-xs">{activeLesson.url.split('/').pop()?.split('?')[0] || 'Document'}</span>
                      </div>
                      <a
                        href={activeLesson.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors shrink-0 ml-3"
                      >
                        <LinkIcon className="w-3.5 h-3.5" /> Open in New Tab
                      </a>
                    </div>
                    <a
                      href={activeLesson.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-col items-center justify-center gap-4 py-14 px-6 hover:bg-gray-50 dark:hover:bg-navy-700/30 transition-colors cursor-pointer group"
                    >
                      <div className="w-20 h-24 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-lg flex flex-col items-center justify-center gap-1 group-hover:border-red-400 transition-colors">
                        <FileText className="w-8 h-8 text-red-500" />
                        <span className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-wider">PDF</span>
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-gray-800 dark:text-white text-sm">{activeLesson.title}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Click to open the PDF in a new tab</p>
                      </div>
                    </a>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <button
                    onClick={() => {
                      const all = sections.flatMap(s => s.lessons);
                      const idx = all.findIndex(l => l.id === activeLesson.id);
                      if (idx > 0) setActiveLesson(all[idx - 1]);
                    }}
                    className="btn-outline text-sm"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => {
                      const all = sections.flatMap(s => s.lessons);
                      const idx = all.findIndex(l => l.id === activeLesson.id);
                      if (idx < all.length - 1) setActiveLesson(all[idx + 1]);
                    }}
                    className="btn-primary text-sm"
                  >
                    Next Lesson
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-20 text-gray-400">
                <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Select a lesson to begin</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
