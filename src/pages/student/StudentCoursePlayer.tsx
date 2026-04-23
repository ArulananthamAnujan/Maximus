import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, CheckCircle2, Circle, Play, FileText,
  Link as LinkIcon, BookOpen, Lock, Menu, X
} from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { studentNavItems } from './studentNav';
import ProgressBar from '../../components/ui/ProgressBar';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useHasCourseAccess } from '../../hooks/useAccess';
import { useCourseProgress, useUpdateLessonProgress } from '../../hooks/useProgress';
import { toast as sonnerToast } from 'sonner';
import type { Course, Section, Lesson } from '../../types';

interface SectionWithLessons extends Section {
  lessons: Lesson[];
}

// ─── Memoized sidebar lesson item ────────────────────────────────────────────
interface LessonItemProps {
  lesson: Lesson;
  isCompleted: boolean;
  isActive: boolean;
  canAccess: boolean;
  progressPercent?: number;
  onClick: (lesson: Lesson) => void;
}

const LessonItem = memo(function LessonItem({ lesson, isCompleted, isActive, canAccess, progressPercent, onClick }: LessonItemProps) {
  const icon = useMemo(() => {
    const icons: Record<string, React.ReactNode> = {
      video: <Play className="w-3.5 h-3.5" />,
      pdf: <FileText className="w-3.5 h-3.5" />,
      text: <BookOpen className="w-3.5 h-3.5" />,
      article: <BookOpen className="w-3.5 h-3.5" />,
      link: <LinkIcon className="w-3.5 h-3.5" />,
    };
    return icons[lesson.type] ?? null;
  }, [lesson.type]);

  return (
    <div
      className={`w-full flex items-start gap-3 px-4 py-3 transition-colors ${canAccess ? 'hover:bg-gray-50 dark:hover:bg-navy-700/50 cursor-pointer' : 'opacity-50 cursor-not-allowed'} ${isActive ? 'bg-gold-50 dark:bg-gold-900/20 border-l-2 border-gold-500' : ''}`}
      onClick={() => onClick(lesson)}
    >
      <span className={`mt-0.5 shrink-0 ${isCompleted ? 'text-green-500' : isActive ? 'text-gold-500' : 'text-gray-300 dark:text-navy-600'}`}>
        {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : canAccess ? <Circle className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
      </span>
      <div className="flex-1 min-w-0">
        <span className={`block text-xs font-medium leading-snug ${isActive ? 'text-gold-700 dark:text-gold-400' : 'text-gray-700 dark:text-gray-300'}`}>
          {lesson.title}
        </span>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-xs ${isActive ? 'text-gold-600 dark:text-gold-500' : 'text-gray-400'}`}>{icon}</span>
          {lesson.duration_minutes > 0 && (
            <span className="text-xs text-gray-400">{lesson.duration_minutes}min</span>
          )}
          {lesson.is_preview && !canAccess && (
            <span className="text-xs text-sky-600 font-semibold">Preview</span>
          )}
          {progressPercent !== undefined && progressPercent > 0 && !isCompleted && (
            <span className="text-xs text-amber-500">{progressPercent}%</span>
          )}
        </div>
      </div>
    </div>
  );
});

export default function StudentCoursePlayer() {
  const { courseId } = useParams<{ courseId: string }>();
  const { profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [course, setCourse] = useState<Course | null>(null);
  const [sections, setSections] = useState<SectionWithLessons[]>([]);
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [completedLessons, setCompletedLessons] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);

  const { hasAccess, isLoading: accessLoading } = useHasCourseAccess(courseId);
  const { data: courseProgressRows = [] } = useCourseProgress(courseId);
  const updateProgressMutation = useUpdateLessonProgress();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const progressSaveTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionStartTime = useRef<number>(Date.now());
  const autoCompleteFired = useRef<Set<string>>(new Set()); // prevent duplicate mutations

  // Build completed set from progress rows
  useEffect(() => {
    const completed = new Set(
      courseProgressRows.filter(p => p.is_completed).map(p => p.lesson_id)
    );
    setCompletedLessons(completed);
  }, [courseProgressRows]);

  useEffect(() => {
    if (!courseId || !profile) return;
    const fetchData = async () => {
      const [courseRes, sectionsRes] = await Promise.all([
        supabase
          .from('courses')
          .select('id,title,short_description,thumbnail_url,category,level,total_lessons,teacher_id')
          .eq('id', courseId)
          .maybeSingle(),
        supabase
          .from('sections')
          .select('id,title,order_index,lessons(id,title,type,lesson_type,video_url,content,duration_minutes,order_index,is_preview,file_url)')
          .eq('course_id', courseId)
          .order('order_index'),
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
      setLoading(false);
    };
    fetchData();
  }, [courseId, profile]);

  // Restore last position when lesson changes
  useEffect(() => {
    if (!activeLesson || !courseProgressRows.length) return;
    const row = courseProgressRows.find(p => p.lesson_id === activeLesson.id);
    if (row && row.last_position_seconds > 0 && videoRef.current) {
      videoRef.current.currentTime = row.last_position_seconds;
    }
    sessionStartTime.current = Date.now();
    autoCompleteFired.current = new Set(); // reset per-lesson on switch
  }, [activeLesson?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveVideoProgress = useCallback(() => {
    if (!activeLesson || !courseId || !hasAccess) return;
    const video = videoRef.current;
    if (!video || video.duration === 0) return;
    const position = Math.floor(video.currentTime);
    const percent = Math.floor((video.currentTime / video.duration) * 100);
    updateProgressMutation.mutate({
      lessonId: activeLesson.id,
      courseId,
      lastPositionSeconds: position,
      watchPercentage: percent,
      isCompleted: percent >= 90,
    });
  }, [activeLesson, courseId, hasAccess, updateProgressMutation]);

  // 30-second interval (was 15s — halves the network traffic)
  useEffect(() => {
    const lessonType = activeLesson?.type ?? activeLesson?.lesson_type;
    if (!activeLesson || lessonType !== 'video') return;
    progressSaveTimer.current = setInterval(saveVideoProgress, 30000);
    return () => {
      if (progressSaveTimer.current) clearInterval(progressSaveTimer.current);
    };
  }, [activeLesson?.id, saveVideoProgress]); // eslint-disable-line react-hooks/exhaustive-deps

  const allLessons = useMemo(() => sections.flatMap(s => s.lessons), [sections]);
  const completedCount = useMemo(() => allLessons.filter(l => completedLessons.has(l.id)).length, [allLessons, completedLessons]);
  const progress = allLessons.length > 0 ? Math.round((completedCount / allLessons.length) * 100) : 0;

  // Progress map for sidebar percentages
  const progressMap = useMemo(() => {
    const m = new Map<string, number>();
    courseProgressRows.forEach(r => m.set(r.lesson_id, r.watch_percentage));
    return m;
  }, [courseProgressRows]);

  const handleLessonClick = useCallback((lesson: Lesson) => {
    const canAccess = hasAccess || lesson.is_preview;
    if (!canAccess) {
      sonnerToast.error('You need to enrol to access this lesson');
      return;
    }
    setActiveLesson(lesson);
    setSidebarOpen(false);
  }, [hasAccess]);

  const handleMarkComplete = async () => {
    if (!activeLesson || !profile || completedLessons.has(activeLesson.id) || !courseId) return;
    setMarking(true);

    updateProgressMutation.mutate({
      lessonId: activeLesson.id,
      courseId,
      lastPositionSeconds: videoRef.current ? Math.floor(videoRef.current.currentTime) : 0,
      watchPercentage: 100,
      isCompleted: true,
      completedAt: new Date().toISOString(),
    });

    const newCompleted = new Set(completedLessons).add(activeLesson.id);
    setCompletedLessons(newCompleted);

    // Update legacy tables
    await Promise.all([
      supabase.from('lesson_progress').upsert({ student_id: profile.id, lesson_id: activeLesson.id, course_id: courseId, is_completed: true, watch_percentage: 100 }, { onConflict: 'student_id,lesson_id' }),
      supabase.from('enrollments').update({ progress_percent: progress }).eq('student_id', profile.id).eq('course_id', courseId),
      supabase.from('course_enrollments').update({ progress_percent: progress, last_accessed_at: new Date().toISOString() }).eq('user_id', profile.id).eq('course_id', courseId),
    ]);

    toast.success('Lesson marked as complete!');
    setMarking(false);
  };

  // Memoized sidebar to prevent full re-render on every activeLesson change
  const SidebarContent = useMemo(() => (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-100 dark:border-navy-700">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Course Progress</p>
        <ProgressBar value={progress} />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{completedCount}/{allLessons.length} lessons completed</p>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {sections.map(section => (
          <div key={section.id} className="border-b border-gray-100 dark:border-navy-700 last:border-0">
            <div className="px-4 py-3 bg-gray-50 dark:bg-navy-900/50">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">{section.title}</p>
            </div>
            {section.lessons.map(lesson => (
              <LessonItem
                key={lesson.id}
                lesson={lesson}
                isCompleted={completedLessons.has(lesson.id)}
                isActive={activeLesson?.id === lesson.id}
                canAccess={hasAccess || lesson.is_preview}
                progressPercent={progressMap.get(lesson.id)}
                onClick={handleLessonClick}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  ), [sections, completedLessons, activeLesson?.id, hasAccess, progress, completedCount, allLessons.length, progressMap, handleLessonClick]);

  if (loading || accessLoading) {
    return (
      <DashboardLayout navItems={studentNavItems} title="Loading..." subtitle="">
        <div className="flex items-center justify-center h-64">
          <div className="w-10 h-10 border-4 border-gold-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (!hasAccess && !activeLesson?.is_preview) {
    return (
      <DashboardLayout navItems={studentNavItems} title="Access Denied" subtitle="">
        <div className="text-center py-20">
          <Lock className="w-12 h-12 text-gray-300 dark:text-navy-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Not Enrolled</h3>
          <p className="text-gray-500 dark:text-gray-400 mb-6">You need to enrol in this course to access the content.</p>
          <div className="flex gap-3 justify-center">
            <Link to="/student/courses" className="btn-outline">Browse Courses</Link>
            {course && <Link to={`/courses/${courseId}`} className="btn-primary">View Course Details</Link>}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout navItems={studentNavItems} title={course?.title || 'Course Player'} subtitle="">
      <div className="flex gap-0 -m-4 sm:-m-6 h-[calc(100vh-8rem)]">
        <div className="hidden lg:flex flex-col w-72 border-r border-gray-200 dark:border-navy-700 bg-white dark:bg-navy-800 overflow-hidden">
          {SidebarContent}
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
              {SidebarContent}
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
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{activeLesson.title}</h2>
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                      <span className="capitalize">{activeLesson.type}</span>
                      {activeLesson.duration_minutes > 0 && <span>· {activeLesson.duration_minutes} min</span>}
                      {activeLesson.is_preview && <span className="badge bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Preview</span>}
                      {!hasAccess && activeLesson.is_preview && (
                        <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md">Preview — enrol for full access</span>
                      )}
                    </div>
                  </div>
                  {hasAccess && !completedLessons.has(activeLesson.id) && (
                    <button onClick={handleMarkComplete} disabled={marking} className="btn-primary text-sm shrink-0 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      {marking ? 'Saving...' : 'Mark Complete'}
                    </button>
                  )}
                  {hasAccess && completedLessons.has(activeLesson.id) && (
                    <div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm font-medium">
                      <CheckCircle2 className="w-4 h-4" /> Completed
                    </div>
                  )}
                </div>

                {/* Video lesson */}
                {(activeLesson.type === 'video' || activeLesson.lesson_type === 'video') && (() => {
                  const url = activeLesson.video_url || (activeLesson as unknown as { url?: string }).url || '';
                  if (!url) {
                    return (
                      <div className="rounded-xl bg-gray-900 flex items-center justify-center aspect-video mb-6">
                        <div className="text-center text-gray-400">
                          <Play className="w-12 h-12 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">Video not available</p>
                        </div>
                      </div>
                    );
                  }
                  const ytMatch = url.match(/(?:v=|youtu\.be\/)([^&?\s]+)/);
                  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
                  if (ytMatch) {
                    return (
                      <a href={url} target="_blank" rel="noopener noreferrer"
                        className="block rounded-xl overflow-hidden mb-6 bg-black relative aspect-video group cursor-pointer">
                        <img src={`https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`} alt="Video thumbnail"
                          width={640} height={360} loading="lazy"
                          className="w-full h-full object-cover opacity-75 group-hover:opacity-60 transition-opacity" />
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
                      <a href={url} target="_blank" rel="noopener noreferrer"
                        className="flex flex-col items-center justify-center gap-3 rounded-xl mb-6 bg-gray-900 aspect-video group cursor-pointer hover:bg-gray-800 transition-colors">
                        <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center shadow-2xl">
                          <svg className="w-7 h-7 text-white ml-1" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                        </div>
                        <span className="text-white text-sm font-semibold">Watch on Vimeo</span>
                      </a>
                    );
                  }
                  return (
                    <div className="rounded-xl overflow-hidden mb-6 bg-black">
                      <video
                        ref={videoRef}
                        src={url}
                        controls
                        className="w-full aspect-video"
                        onTimeUpdate={() => {
                          const video = videoRef.current;
                          if (!video || !hasAccess || !activeLesson || !courseId) return;
                          const percent = Math.floor((video.currentTime / video.duration) * 100);
                          // Fire auto-complete exactly once per lesson load
                          if (percent >= 90 && !completedLessons.has(activeLesson.id) && !autoCompleteFired.current.has(activeLesson.id)) {
                            autoCompleteFired.current.add(activeLesson.id);
                            updateProgressMutation.mutate({
                              lessonId: activeLesson.id,
                              courseId,
                              lastPositionSeconds: Math.floor(video.currentTime),
                              watchPercentage: 100,
                              isCompleted: true,
                              completedAt: new Date().toISOString(),
                            });
                            setCompletedLessons(prev => new Set(prev).add(activeLesson.id));
                            sonnerToast.success('Lesson completed!');
                          }
                        }}
                      />
                    </div>
                  );
                })()}

                {/* Text/article lesson */}
                {(activeLesson.type === 'text' || activeLesson.type === 'article' || activeLesson.lesson_type === 'text') && (
                  <div className="prose dark:prose-invert max-w-none bg-white dark:bg-navy-800 rounded-xl p-6 border border-gray-100 dark:border-navy-700 mb-6">
                    <p className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{activeLesson.content}</p>
                  </div>
                )}

                {/* File/PDF lesson */}
                {(activeLesson.type === 'pdf' || activeLesson.type === 'file') && (activeLesson.file_url || (activeLesson as unknown as { url?: string }).url) && (() => {
                  const fileUrl = activeLesson.file_url || (activeLesson as unknown as { url?: string }).url || '';
                  return (
                    <div className="bg-white dark:bg-navy-800 rounded-xl border border-gray-100 dark:border-navy-700 mb-6 overflow-hidden">
                      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-navy-700 bg-gray-50 dark:bg-navy-900/50">
                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                          <FileText className="w-4 h-4 text-red-500" />
                          <span className="font-medium truncate max-w-xs">{activeLesson.title}</span>
                        </div>
                        <a href={fileUrl} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800 shrink-0 ml-3">
                          <LinkIcon className="w-3.5 h-3.5" /> Open
                        </a>
                      </div>
                      <a href={fileUrl} target="_blank" rel="noopener noreferrer"
                        className="flex flex-col items-center justify-center gap-4 py-14 px-6 hover:bg-gray-50 dark:hover:bg-navy-700/30 transition-colors cursor-pointer group">
                        <div className="w-20 h-24 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-lg flex flex-col items-center justify-center gap-1 group-hover:border-red-400 transition-colors">
                          <FileText className="w-8 h-8 text-red-500" />
                          <span className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-wider">PDF</span>
                        </div>
                        <div className="text-center">
                          <p className="font-semibold text-gray-800 dark:text-white text-sm">{activeLesson.title}</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Click to open in a new tab</p>
                        </div>
                      </a>
                    </div>
                  );
                })()}

                <div className="flex items-center justify-between">
                  <button
                    onClick={() => {
                      const idx = allLessons.findIndex(l => l.id === activeLesson.id);
                      if (idx > 0) setActiveLesson(allLessons[idx - 1]);
                    }}
                    className="btn-outline text-sm"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => {
                      const idx = allLessons.findIndex(l => l.id === activeLesson.id);
                      if (idx < allLessons.length - 1) {
                        const next = allLessons[idx + 1];
                        if (!hasAccess && !next.is_preview) {
                          sonnerToast.error('You need to enrol to access this lesson');
                          return;
                        }
                        setActiveLesson(next);
                      }
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
