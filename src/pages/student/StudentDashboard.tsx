import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen, Award, TrendingUp, ChevronRight,
  FileText, AlertCircle, PlayCircle, CheckCircle2,
  Sparkles, Clock, Zap, Target, BarChart2, Bell,
  ArrowRight, Calendar, Video, ExternalLink, CalendarDays,
} from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { studentNavItems } from './studentNav';
import ProgressBar from '../../components/ui/ProgressBar';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useMyEnrollments } from '../../hooks/useProgress';
import { DashboardStatSkeleton } from '../../components/ui/LoadingSkeleton';
import type { Assignment, Announcement } from '../../types';

interface LegacyEnrollmentWithCourse {
  id: string;
  course_id: string;
  progress_percent: number;
  enrolled_at: string;
  course: {
    id: string;
    title: string;
    thumbnail_url: string;
    total_lessons: number;
    category: string;
  };
}

const PEXELS_FALLBACK = 'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=400';

function getGreeting(name: string) {
  const h = new Date().getHours();
  const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return `${greeting}, ${name}!`;
}

export default function StudentDashboard() {
  const { profile } = useAuth();
  const { data: newEnrollments = [], isLoading: newEnrollmentsLoading } = useMyEnrollments();

  const [legacyEnrollments, setLegacyEnrollments] = useState<LegacyEnrollmentWithCourse[]>([]);
  const [certificates, setCertificates] = useState(0);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [confirmedSessions, setConfirmedSessions] = useState<Array<{
    id: string; meeting_link: string | null; scheduled_at: string | null;
    duration_minutes: number; teacher_notes: string | null;
    course: { title: string } | null; teacher: { full_name: string } | null;
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    const fetchData = async () => {
      const [enrollRes, certRes, assignRes, annRes, tokensRes, f2fRes] = await Promise.all([
        supabase
          .from('enrollments')
          .select('id,course_id,progress_percent,enrolled_at,course:courses(id,title,thumbnail_url,total_lessons,category)')
          .eq('student_id', profile.id)
          .order('enrolled_at', { ascending: false }),
        supabase.from('certificates').select('id', { count: 'exact' }).eq('student_id', profile.id).eq('revoked', false),
        supabase
          .from('assignments')
          .select('*')
          .in(
            'course_id',
            (await supabase.from('enrollments').select('course_id').eq('student_id', profile.id)).data?.map(e => e.course_id) ?? []
          )
          .not('due_date', 'is', null)
          .gte('due_date', new Date().toISOString())
          .order('due_date', { ascending: true })
          .limit(4),
        supabase.from('announcements').select('*').eq('is_active', true).order('created_at', { ascending: false }).limit(3),
        supabase.from('student_ai_credits').select('token_balance').eq('user_id', profile.id).maybeSingle(),
        supabase
          .from('f2f_requests')
          .select('id, meeting_link, scheduled_at, duration_minutes, teacher_notes, course:courses(title), teacher:profiles!f2f_requests_teacher_id_fkey(full_name)')
          .eq('student_id', profile.id)
          .eq('status', 'approved')
          .order('scheduled_at', { ascending: true }),
      ]);

      if (enrollRes.data) setLegacyEnrollments(enrollRes.data as unknown as LegacyEnrollmentWithCourse[]);
      setCertificates(certRes.count || 0);
      if (assignRes.data) setAssignments(assignRes.data as Assignment[]);
      if (annRes.data) setAnnouncements(annRes.data as Announcement[]);
      setTokenBalance(tokensRes.data?.token_balance ?? 0);
      if (f2fRes.data) setConfirmedSessions(f2fRes.data as unknown as typeof confirmedSessions);
      setLoading(false);
    };
    fetchData();
  }, [profile]);

  const newEnrollmentCourseIds = new Set(newEnrollments.map(e => e.course_id));
  const legacyOnly = legacyEnrollments.filter(e => !newEnrollmentCourseIds.has(e.course_id));

  const allEnrollments = [
    ...newEnrollments.map(e => ({
      id: e.id,
      course_id: e.course_id,
      progress_percent: e.progress_percent,
      last_accessed_at: e.last_accessed_at,
      course: e.course ? {
        id: e.course.id,
        title: e.course.title,
        thumbnail_url: e.course.thumbnail_url ?? '',
        total_lessons: e.course.total_lessons ?? 0,
        category: e.course.category ?? '',
      } : null,
    })).filter(e => e.course),
    ...legacyOnly.map(e => ({
      id: e.id,
      course_id: e.course_id,
      progress_percent: e.progress_percent,
      last_accessed_at: e.enrolled_at,
      course: e.course,
    })),
  ].sort((a, b) => new Date(b.last_accessed_at).getTime() - new Date(a.last_accessed_at).getTime());

  const isLoading = loading || newEnrollmentsLoading;
  const totalEnrolled = allEnrollments.length;
  const completed = allEnrollments.filter(e => e.progress_percent === 100).length;
  const inProgress = allEnrollments.filter(e => e.progress_percent > 0 && e.progress_percent < 100).length;
  const avgProgress = totalEnrolled > 0
    ? Math.round(allEnrollments.reduce((s, e) => s + e.progress_percent, 0) / totalEnrolled)
    : 0;

  const continueLesson = allEnrollments.find(e => e.progress_percent > 0 && e.progress_percent < 100)
    || allEnrollments[0];

  const firstName = profile?.full_name?.split(' ')[0] || 'Learner';

  return (
    <DashboardLayout
      navItems={studentNavItems}
      title="Dashboard"
      subtitle={getGreeting(firstName)}
    >
      <div className="space-y-6">

        {/* Confirmed F2F session banner */}
        {confirmedSessions.length > 0 && (
          <div className="rounded-2xl overflow-hidden border border-emerald-300 dark:border-emerald-700 shadow-md">
            <div className="flex items-center gap-3 px-5 py-3 bg-emerald-600">
              <Video className="w-5 h-5 text-white shrink-0" />
              <p className="text-sm font-bold text-white flex-1">
                {confirmedSessions.length === 1
                  ? 'You have a confirmed face-to-face session!'
                  : `${confirmedSessions.length} confirmed face-to-face sessions`}
              </p>
              <Link to="/student/face-to-face" className="text-xs font-semibold text-emerald-100 hover:text-white underline shrink-0">
                View all
              </Link>
            </div>
            {confirmedSessions.slice(0, 2).map(session => (
              <div key={session.id} className="px-5 py-4 bg-emerald-50 dark:bg-emerald-900/20 flex flex-col sm:flex-row sm:items-center gap-3 border-t border-emerald-200 dark:border-emerald-800 first:border-t-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">{session.course?.title}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-xs text-emerald-700 dark:text-emerald-400">with {session.teacher?.full_name}</span>
                    {session.scheduled_at && (
                      <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                        <CalendarDays className="w-3 h-3" />
                        {new Date(session.scheduled_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}
                        · {session.duration_minutes} min
                      </span>
                    )}
                  </div>
                  {session.teacher_notes && (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 italic">"{session.teacher_notes}"</p>
                  )}
                </div>
                {session.meeting_link && (
                  <a
                    href={session.meeting_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Join Session
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Hero Welcome Banner */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-sky-600 via-sky-500 to-blue-600 text-white shadow-lg">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white rounded-full -translate-y-32 translate-x-32" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white rounded-full translate-y-24 -translate-x-24" />
          </div>
          <div className="relative p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sky-200 text-sm font-medium">
                  {new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}
                </span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-1">{getGreeting(firstName)}</h2>
              <p className="text-sky-100 text-sm">
                {totalEnrolled > 0
                  ? `You have ${inProgress} course${inProgress !== 1 ? 's' : ''} in progress. Keep it up!`
                  : 'Start your learning journey today.'}
              </p>
              {totalEnrolled > 0 && (
                <div className="mt-4 flex items-center gap-4">
                  <div>
                    <p className="text-xs text-sky-200 mb-1">Overall Progress</p>
                    <div className="flex items-center gap-3">
                      <div className="w-40 h-2 bg-white/20 rounded-full overflow-hidden">
                        <div className="h-full bg-white rounded-full transition-all" style={{ width: `${avgProgress}%` }} />
                      </div>
                      <span className="text-sm font-bold">{avgProgress}%</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            {continueLesson?.course && (
              <div className="sm:shrink-0 sm:w-72">
                <p className="text-xs text-sky-200 font-semibold uppercase tracking-wide mb-2">Continue where you left off</p>
                <div className="bg-white/15 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                  <div className="flex items-center gap-3">
                    <img
                      src={continueLesson.course.thumbnail_url || PEXELS_FALLBACK}
                      alt=""
                      className="w-12 h-12 rounded-lg object-cover shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{continueLesson.course.title}</p>
                      <p className="text-xs text-sky-200 mt-0.5">{continueLesson.progress_percent}% complete</p>
                    </div>
                  </div>
                  <Link
                    to={`/student/courses/${continueLesson.course_id}`}
                    className="mt-3 flex items-center justify-center gap-2 w-full py-2 bg-white text-sky-700 rounded-lg text-sm font-bold hover:bg-sky-50 transition-colors"
                  >
                    <PlayCircle className="w-4 h-4" /> Resume Learning
                  </Link>
                </div>
              </div>
            )}
            {totalEnrolled === 0 && !isLoading && (
              <Link to="/student/courses"
                className="sm:shrink-0 flex items-center gap-2 px-6 py-3 bg-white text-sky-700 rounded-xl font-bold text-sm hover:bg-sky-50 transition-colors shadow-lg">
                <BookOpen className="w-4 h-4" /> Browse Courses
              </Link>
            )}
          </div>
        </div>

        {/* Stats row */}
        {isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <DashboardStatSkeleton key={i} />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Enrolled', value: totalEnrolled, icon: BookOpen, color: 'text-sky-600', bg: 'bg-sky-50 dark:bg-sky-900/20', border: 'border-sky-100 dark:border-sky-800/50' },
              { label: 'Completed', value: completed, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-100 dark:border-emerald-800/50' },
              { label: 'In Progress', value: inProgress, icon: TrendingUp, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-100 dark:border-amber-800/50' },
              { label: 'Certificates', value: certificates, icon: Award, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-100 dark:border-blue-800/50' },
            ].map(s => (
              <div key={s.label} className={`card p-5 border ${s.border} hover:shadow-md transition-shadow`}>
                <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center mb-3`}>
                  <s.icon className={`w-5 h-5 ${s.color}`} />
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{s.value}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Quick Actions */}
        <div>
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Quick Actions</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'My Courses', desc: 'Continue learning', icon: BookOpen, href: '/student/courses', color: 'text-sky-600', bg: 'bg-sky-50 dark:bg-sky-900/20' },
              { label: 'Quizzes', desc: 'Test yourself', icon: Target, href: '/student/quizzes', color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
              { label: 'AI Assistant', desc: `${tokenBalance ?? 0} tokens`, icon: Sparkles, href: '/student/ai-plans', color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20' },
              { label: 'Certificates', desc: `${certificates} earned`, icon: Award, href: '/student/certificates', color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
            ].map(qa => (
              <Link key={qa.href} to={qa.href}
                className="card p-4 flex flex-col gap-2 hover:shadow-md hover:-translate-y-0.5 transition-all group">
                <div className={`w-9 h-9 rounded-xl ${qa.bg} flex items-center justify-center`}>
                  <qa.icon className={`w-4.5 h-4.5 ${qa.color}`} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800 dark:text-white">{qa.label}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{qa.desc}</p>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 dark:group-hover:text-gray-400 mt-auto self-end transition-colors" />
              </Link>
            ))}
          </div>
        </div>

        {/* Main 2-col grid */}
        <div className="grid lg:grid-cols-3 gap-6">

          {/* My Courses list */}
          <div className="lg:col-span-2 card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-navy-700">
              <div className="flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-sky-500" />
                <h2 className="font-semibold text-gray-900 dark:text-white text-sm">My Learning</h2>
              </div>
              <Link to="/student/courses" className="flex items-center gap-1 text-xs text-sky-600 dark:text-sky-400 font-semibold hover:underline">
                View all <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {isLoading ? (
              <div className="p-5 space-y-4">
                {[1,2,3].map(i => (
                  <div key={i} className="flex gap-4 animate-pulse">
                    <div className="w-16 h-12 bg-gray-200 dark:bg-navy-700 rounded-lg shrink-0" />
                    <div className="flex-1 space-y-2 pt-1">
                      <div className="h-3.5 bg-gray-200 dark:bg-navy-700 rounded w-2/3" />
                      <div className="h-2 bg-gray-200 dark:bg-navy-700 rounded w-full" />
                      <div className="h-2 bg-gray-200 dark:bg-navy-700 rounded w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : allEnrollments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="w-16 h-16 rounded-2xl bg-sky-50 dark:bg-sky-900/20 flex items-center justify-center mb-4">
                  <BookOpen className="w-8 h-8 text-sky-400" />
                </div>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">No courses yet</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Explore our catalog and start learning today.</p>
                <Link to="/student/courses" className="btn-primary text-sm">Browse Courses</Link>
              </div>
            ) : (
              <div className="divide-y divide-gray-50 dark:divide-navy-700/60">
                {allEnrollments.slice(0, 5).map(en => en.course && (
                  <Link key={en.id} to={`/student/courses/${en.course_id}`}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 dark:hover:bg-navy-700/40 transition-colors group">
                    <div className="w-16 h-12 rounded-xl overflow-hidden shrink-0 border border-gray-100 dark:border-navy-700">
                      <img
                        src={en.course.thumbnail_url || PEXELS_FALLBACK}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate mb-1.5">{en.course.title}</p>
                      <ProgressBar value={en.progress_percent} size="sm" />
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-xs text-gray-400">{en.progress_percent}% complete</p>
                        {en.progress_percent === 100 && (
                          <span className="flex items-center gap-1 text-xs text-emerald-600 font-semibold">
                            <CheckCircle2 className="w-3 h-3" /> Done
                          </span>
                        )}
                        {en.progress_percent > 0 && en.progress_percent < 100 && (
                          <span className="text-xs text-sky-600 font-semibold group-hover:underline">Continue →</span>
                        )}
                        {en.progress_percent === 0 && (
                          <span className="text-xs text-gray-400 font-medium group-hover:text-sky-600 transition-colors">Start →</span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="space-y-5">

            {/* Progress overview */}
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-navy-700">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" />
                  <h2 className="font-semibold text-gray-900 dark:text-white text-sm">Progress Overview</h2>
                </div>
              </div>
              <div className="p-5">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-gray-500 dark:text-gray-400 text-xs">Average completion</span>
                  <span className="font-bold text-gray-900 dark:text-white">{avgProgress}%</span>
                </div>
                <div className="w-full bg-gray-100 dark:bg-navy-700 rounded-full h-2.5 mb-4 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-sky-500 to-blue-500 rounded-full transition-all duration-700" style={{ width: `${avgProgress}%` }} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center p-3 bg-sky-50 dark:bg-sky-900/20 rounded-xl">
                    <p className="text-lg font-bold text-sky-600 dark:text-sky-400">{totalEnrolled}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Enrolled</p>
                  </div>
                  <div className="text-center p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl">
                    <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{completed}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Done</p>
                  </div>
                  <div className="text-center p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl">
                    <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{inProgress}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Active</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Upcoming deadlines */}
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-navy-700">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-rose-500" />
                  <h2 className="font-semibold text-gray-900 dark:text-white text-sm">Upcoming Deadlines</h2>
                </div>
              </div>
              {assignments.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <Clock className="w-8 h-8 text-gray-200 dark:text-navy-600 mx-auto mb-2" />
                  <p className="text-xs text-gray-400">No upcoming deadlines</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50 dark:divide-navy-700/60">
                  {assignments.map(a => {
                    const daysLeft = Math.ceil((new Date(a.due_date!).getTime() - Date.now()) / 86400000);
                    return (
                      <div key={a.id} className="flex items-center gap-3 px-5 py-3.5">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${daysLeft <= 1 ? 'bg-red-500' : daysLeft <= 3 ? 'bg-amber-500' : 'bg-emerald-400'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{a.title}</p>
                          <p className={`text-xs font-medium mt-0.5 ${daysLeft <= 1 ? 'text-red-500' : daysLeft <= 3 ? 'text-amber-500' : 'text-gray-400'}`}>
                            {daysLeft === 0 ? 'Due today!' : daysLeft === 1 ? 'Due tomorrow' : `${daysLeft} days left`}
                          </p>
                        </div>
                        <FileText className="w-4 h-4 text-gray-300 shrink-0" />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Announcements */}
            {announcements.length > 0 && (
              <div className="card overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 dark:border-navy-700">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-sky-500" />
                    <h2 className="font-semibold text-gray-900 dark:text-white text-sm">Announcements</h2>
                  </div>
                </div>
                <div className="divide-y divide-gray-50 dark:divide-navy-700/60">
                  {announcements.map(a => (
                    <div key={a.id} className="px-5 py-4">
                      <div className="flex items-start gap-2.5">
                        <AlertCircle className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-white mb-0.5">{a.title}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">{a.content}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
