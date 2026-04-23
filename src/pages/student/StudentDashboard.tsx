import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen, Award, Clock, TrendingUp, Bell, ChevronRight,
  FileText, AlertCircle, PlayCircle, CheckCircle2
} from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { studentNavItems } from './studentNav';
import ProgressBar from '../../components/ui/ProgressBar';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useMyEnrollments } from '../../hooks/useProgress';
import { DashboardStatSkeleton } from '../../components/ui/LoadingSkeleton';
import type { Assignment, Announcement } from '../../types';

export default function StudentDashboard() {
  const { user, profile } = useAuth();
  const { data: enrollments = [], isLoading: enrollmentsLoading } = useMyEnrollments();

  const [certificates, setCertificates] = useState(0);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [sideLoading, setSideLoading] = useState(true);

  // Fetch side-panel data (certs, assignments, announcements) using user.id
  // so it starts immediately without waiting for profile
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const fetchSideData = async () => {
      const courseIds = enrollments.map(e => e.course_id);

      const [certRes, assignRes, annRes] = await Promise.all([
        supabase
          .from('certificates')
          .select('id', { count: 'exact', head: true })
          .eq('student_id', user.id)
          .eq('revoked', false),
        courseIds.length > 0
          ? supabase
              .from('assignments')
              .select('id,title,due_date,course_id')
              .in('course_id', courseIds)
              .not('due_date', 'is', null)
              .gte('due_date', new Date().toISOString())
              .order('due_date', { ascending: true })
              .limit(4)
          : Promise.resolve({ data: [], count: null, error: null, status: 200, statusText: 'OK' }),
        supabase
          .from('announcements')
          .select('id,title,content,created_at')
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(3),
      ]);

      if (cancelled) return;
      setCertificates(certRes.count || 0);
      if (assignRes.data) setAssignments(assignRes.data as Assignment[]);
      if (annRes.data) setAnnouncements(annRes.data as Announcement[]);
      setSideLoading(false);
    };

    fetchSideData();
    return () => { cancelled = true; };
  }, [user, enrollments]);

  const { completed, inProgress, avgProgress } = useMemo(() => {
    const completed = enrollments.filter(e => e.progress_percent === 100).length;
    const inProgress = enrollments.filter(e => e.progress_percent > 0 && e.progress_percent < 100).length;
    const avgProgress = enrollments.length > 0
      ? Math.round(enrollments.reduce((s, e) => s + e.progress_percent, 0) / enrollments.length)
      : 0;
    return { completed, inProgress, avgProgress };
  }, [enrollments]);

  const continueLesson = useMemo(
    () => enrollments.find(e => e.progress_percent > 0 && e.progress_percent < 100),
    [enrollments]
  );

  const stats = useMemo(() => [
    { label: 'Enrolled',     value: enrollments.length, icon: BookOpen,    color: 'bg-blue-500' },
    { label: 'Completed',    value: completed,           icon: CheckCircle2, color: 'bg-emerald-500' },
    { label: 'In Progress',  value: inProgress,          icon: TrendingUp,   color: 'bg-amber-500' },
    { label: 'Certificates', value: certificates,        icon: Award,        color: 'bg-gold-500' },
  ], [enrollments.length, completed, inProgress, certificates]);

  const displayName = profile?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'Learner';

  return (
    <DashboardLayout
      navItems={studentNavItems}
      title="My Dashboard"
      subtitle={`Welcome back, ${displayName}!`}
    >
      <div className="space-y-6">
        {enrollmentsLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <DashboardStatSkeleton key={i} />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map(s => (
              <div key={s.label} className="card p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{s.label}</p>
                  <div className={`w-9 h-9 ${s.color} rounded-xl flex items-center justify-center`}>
                    <s.icon className="w-4 h-4 text-white" />
                  </div>
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white font-playfair">{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {!enrollmentsLoading && continueLesson?.course && (
          <div className="card overflow-hidden">
            <div className="flex items-center gap-4 p-5">
              <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0">
                <img
                  src={continueLesson.course.thumbnail_url || 'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg'}
                  alt=""
                  width={56} height={56}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gold-600 uppercase tracking-wide mb-0.5">Continue Learning</p>
                <p className="font-semibold text-gray-900 dark:text-white truncate">{continueLesson.course.title}</p>
                <div className="mt-2">
                  <ProgressBar value={continueLesson.progress_percent} size="sm" />
                  <p className="text-xs text-gray-400 mt-1">{continueLesson.progress_percent}% complete</p>
                </div>
              </div>
              <Link to={`/student/courses/${continueLesson.course_id}`} className="btn-primary text-sm flex items-center gap-2 shrink-0">
                <PlayCircle className="w-4 h-4" />
                Resume
              </Link>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 card">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-navy-700">
              <h2 className="font-semibold text-gray-900 dark:text-white">My Courses</h2>
              <Link to="/student/courses" className="text-sm text-gold-600 hover:text-gold-700 flex items-center gap-1">
                Browse more <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            {enrollmentsLoading ? (
              <div className="p-5 space-y-4">
                {[1,2,3].map(i => (
                  <div key={i} className="flex gap-4 animate-pulse">
                    <div className="w-16 h-12 bg-gray-200 dark:bg-navy-700 rounded-lg shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-200 dark:bg-navy-700 rounded w-3/4" />
                      <div className="h-3 bg-gray-200 dark:bg-navy-700 rounded w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : enrollments.length === 0 ? (
              <div className="p-10 text-center">
                <BookOpen className="w-10 h-10 text-gray-300 dark:text-navy-600 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400 font-medium mb-2">No courses yet</p>
                <Link to="/student/courses" className="btn-primary text-sm">Browse Courses</Link>
              </div>
            ) : (
              <div className="divide-y divide-gray-50 dark:divide-navy-700">
                {enrollments.slice(0, 5).map(en => en.course && (
                  <div key={en.id} className="flex items-center gap-4 p-4 hover:bg-gray-50 dark:hover:bg-navy-700/50 transition-colors">
                    <img
                      src={en.course.thumbnail_url || 'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg'}
                      alt=""
                      width={64} height={48}
                      loading="lazy"
                      className="w-16 h-12 rounded-lg object-cover shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate mb-1">{en.course.title}</p>
                      <ProgressBar value={en.progress_percent} size="sm" />
                      <p className="text-xs text-gray-400 mt-1">{en.progress_percent}% complete</p>
                    </div>
                    <Link
                      to={`/student/courses/${en.course_id}`}
                      className="text-xs font-medium text-gold-600 hover:text-gold-700 whitespace-nowrap"
                    >
                      {en.progress_percent === 100 ? 'Review' : 'Continue'}
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="card">
              <div className="p-4 border-b border-gray-100 dark:border-navy-700">
                <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-500" />
                  Progress Overview
                </h2>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Average Progress</span>
                  <span className="font-bold text-gray-900 dark:text-white">{avgProgress}%</span>
                </div>
                <ProgressBar value={avgProgress} />
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{completed}</p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">Completed</p>
                  </div>
                  <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{inProgress}</p>
                    <p className="text-xs text-amber-600 dark:text-amber-400">In Progress</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="p-4 border-b border-gray-100 dark:border-navy-700">
                <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-orange-500" />
                  Upcoming Deadlines
                </h2>
              </div>
              {sideLoading ? (
                <div className="p-4 space-y-3">
                  {[1,2].map(i => (
                    <div key={i} className="animate-pulse space-y-1">
                      <div className="h-4 bg-gray-200 dark:bg-navy-700 rounded w-3/4" />
                      <div className="h-3 bg-gray-200 dark:bg-navy-700 rounded w-1/3" />
                    </div>
                  ))}
                </div>
              ) : assignments.length === 0 ? (
                <div className="p-6 text-center text-gray-400 text-sm">No upcoming deadlines</div>
              ) : (
                <div className="divide-y divide-gray-50 dark:divide-navy-700">
                  {assignments.map(a => {
                    const daysLeft = Math.ceil((new Date(a.due_date!).getTime() - Date.now()) / 86400000);
                    return (
                      <div key={a.id} className="p-4">
                        <p className="text-sm font-medium text-gray-900 dark:text-white mb-1 truncate">{a.title}</p>
                        <p className={`text-xs font-medium ${daysLeft <= 3 ? 'text-red-500' : 'text-gray-400'}`}>
                          {daysLeft === 0 ? 'Due today!' : `Due in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="card">
              <div className="p-4 border-b border-gray-100 dark:border-navy-700">
                <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Bell className="w-4 h-4 text-gold-500" />
                  Announcements
                </h2>
              </div>
              {sideLoading ? (
                <div className="p-4 space-y-3">
                  {[1,2].map(i => (
                    <div key={i} className="animate-pulse space-y-1">
                      <div className="h-4 bg-gray-200 dark:bg-navy-700 rounded w-3/4" />
                      <div className="h-3 bg-gray-200 dark:bg-navy-700 rounded w-full" />
                    </div>
                  ))}
                </div>
              ) : announcements.length === 0 ? (
                <div className="p-6 text-center text-gray-400 text-sm">No announcements</div>
              ) : (
                <div className="divide-y divide-gray-50 dark:divide-navy-700">
                  {announcements.map(a => (
                    <div key={a.id} className="p-4">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-gold-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">{a.title}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{a.content}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
