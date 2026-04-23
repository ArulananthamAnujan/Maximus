import { useState, useEffect } from 'react';
import { BookOpen, Users, FileText, Video, ChevronRight, AlertCircle, Clock, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { teacherNavItems } from './teacherNav';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { DashboardStatSkeleton } from '../../components/ui/LoadingSkeleton';
import type { Course, Assignment, LiveSession } from '../../types';

interface RecentSubmission {
  id: string;
  submitted_at: string;
  assignment: { title: string } | null;
  student: { full_name: string; email: string } | null;
}

export default function TeacherDashboard() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [totalStudents, setTotalStudents] = useState(0);
  const [pendingGrades, setPendingGrades] = useState(0);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [liveSessions, setLiveSessions] = useState<LiveSession[]>([]);
  const [recentSubmissions, setRecentSubmissions] = useState<RecentSubmission[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [loadingActivity, setLoadingActivity] = useState(true);
  const { profile } = useAuth();

  useEffect(() => {
    if (!profile) return;

    const teacherId = profile.id;
    const now = new Date().toISOString();

    setLoadingStats(true);
    setLoadingCourses(true);
    setLoadingActivity(true);

    supabase
      .from('courses')
      .select('id, title, thumbnail_url, total_students, category, is_published, is_archived, created_at')
      .eq('teacher_id', teacherId)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        const list = (data || []) as Course[];
        setCourses(list);
        setLoadingCourses(false);

        if (list.length === 0) {
          setLoadingStats(false);
          setLoadingActivity(false);
          return;
        }

        const courseIds = list.map(c => c.id);

        Promise.all([
          supabase
            .from('enrollments')
            .select('id', { count: 'exact', head: true })
            .in('course_id', courseIds),
          supabase
            .from('live_sessions')
            .select('*')
            .eq('teacher_id', teacherId)
            .gte('scheduled_at', now)
            .order('scheduled_at', { ascending: true })
            .limit(3),
        ]).then(([studRes, sessRes]) => {
          setTotalStudents(studRes.count || 0);
          if (sessRes.data) setLiveSessions(sessRes.data as LiveSession[]);
          setLoadingStats(false);
        });

        Promise.all([
          supabase
            .from('assignments')
            .select('id, title, due_date, course_id')
            .in('course_id', courseIds)
            .gte('due_date', now)
            .order('due_date', { ascending: true })
            .limit(4),
          supabase
            .from('assignment_submissions')
            .select('id, submitted_at, grade, assignment:assignments!inner(title, course_id), student:profiles(full_name, email)')
            .in('assignments.course_id', courseIds)
            .order('submitted_at', { ascending: false })
            .limit(5),
          supabase
            .from('assignment_submissions')
            .select('id', { count: 'exact', head: true })
            .is('grade', null)
            .in('assignments.course_id', courseIds),
        ]).then(([assignRes, subRes, pendRes]) => {
          if (assignRes.data) setAssignments(assignRes.data as Assignment[]);
          if (subRes.data) setRecentSubmissions(subRes.data as RecentSubmission[]);
          setPendingGrades(pendRes.count || 0);
          setLoadingActivity(false);
        });
      });
  }, [profile]);

  const loading = loadingStats && loadingCourses;

  const stats = [
    { title: 'My Courses', value: loadingCourses ? null : courses.length, icon: BookOpen, color: 'bg-gold-500', href: '/teacher/courses' },
    { title: 'Total Students', value: loadingStats ? null : totalStudents, icon: Users, color: 'bg-blue-500', href: '/teacher/students' },
    { title: 'Pending Grades', value: loadingActivity ? null : pendingGrades, icon: FileText, color: 'bg-orange-500', href: '/teacher/assignments' },
    { title: 'Live Sessions', value: loadingStats ? null : liveSessions.length, icon: Video, color: 'bg-teal-500', href: '/teacher/live-sessions' },
  ];

  return (
    <DashboardLayout
      navItems={teacherNavItems}
      title="Teacher Dashboard"
      subtitle={`Welcome back, ${profile?.full_name?.split(' ')[0] || 'Teacher'}!`}
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(stat => (
            stat.value === null ? (
              <DashboardStatSkeleton key={stat.title} />
            ) : (
              <Link key={stat.title} to={stat.href} className="card p-5 hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 group">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{stat.title}</p>
                  <div className={`w-9 h-9 ${stat.color} rounded-xl flex items-center justify-center`}>
                    <stat.icon className="w-4 h-4 text-white" />
                  </div>
                </div>
                <div className="flex items-end justify-between">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white font-playfair">{stat.value}</p>
                  <ArrowUpRight className="w-4 h-4 text-gray-300 dark:text-navy-600 group-hover:text-gray-400 transition-colors mb-0.5" />
                </div>
              </Link>
            )
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="card">
              <div className="p-4 border-b border-gray-100 dark:border-navy-700 flex items-center justify-between">
                <h2 className="font-semibold text-gray-900 dark:text-white">My Courses</h2>
                <Link to="/teacher/courses" className="text-sm text-gold-600 hover:text-gold-700 flex items-center gap-1">
                  View all <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
              {loadingCourses ? (
                <div className="p-4 space-y-3">
                  {[1,2,3].map(i => <div key={i} className="h-12 bg-gray-100 dark:bg-navy-700 rounded-lg animate-pulse" />)}
                </div>
              ) : courses.length === 0 ? (
                <div className="p-10 text-center">
                  <BookOpen className="w-10 h-10 text-gray-300 dark:text-navy-600 mx-auto mb-3" />
                  <p className="text-gray-500 dark:text-gray-400 text-sm">No courses assigned yet</p>
                  <p className="text-xs text-gray-400 mt-1">Contact your admin to get courses assigned</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50 dark:divide-navy-700">
                  {courses.slice(0, 5).map(course => (
                    <div key={course.id} className="flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-navy-700/30 transition-colors">
                      <img
                        src={course.thumbnail_url || 'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg'}
                        alt=""
                        className="w-11 h-11 rounded-lg object-cover shrink-0"
                        loading="lazy"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{course.title}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                            <Users className="w-3 h-3" /> {course.total_students} students
                          </span>
                          <span className="text-xs text-gray-400">{course.category}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${course.is_published ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-navy-700 dark:text-gray-400'}`}>
                          {course.is_published ? 'Live' : 'Draft'}
                        </span>
                        <Link to={`/teacher/builder/${course.id}`} className="text-xs text-gold-600 hover:text-gold-700 font-medium">
                          Edit
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card">
              <div className="p-4 border-b border-gray-100 dark:border-navy-700 flex items-center justify-between">
                <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-orange-500" />
                  Recent Submissions
                  {!loadingActivity && pendingGrades > 0 && (
                    <span className="text-xs bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 px-2 py-0.5 rounded-full font-medium">
                      {pendingGrades} ungraded
                    </span>
                  )}
                </h2>
                <Link to="/teacher/assignments" className="text-sm text-gold-600 hover:text-gold-700 flex items-center gap-1">
                  Grade all <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
              {loadingActivity ? (
                <div className="p-4 space-y-3">
                  {[1,2,3].map(i => <div key={i} className="h-10 bg-gray-100 dark:bg-navy-700 rounded-lg animate-pulse" />)}
                </div>
              ) : recentSubmissions.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">No submissions yet</div>
              ) : (
                <div className="divide-y divide-gray-50 dark:divide-navy-700">
                  {recentSubmissions.map(sub => (
                    <div key={sub.id} className="flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-navy-700/30 transition-colors">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-navy-500 to-navy-800 flex items-center justify-center text-white text-sm font-bold shrink-0">
                        {sub.student?.full_name?.[0] || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {sub.student?.full_name || 'Unknown'}
                        </p>
                        <p className="text-xs text-gray-400 truncate">
                          {sub.assignment?.title || 'Assignment'}
                        </p>
                      </div>
                      <p className="text-xs text-gray-400 shrink-0">
                        {new Date(sub.submitted_at).toLocaleDateString('en-AU')}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="card">
              <div className="p-4 border-b border-gray-100 dark:border-navy-700 flex items-center justify-between">
                <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Video className="w-4 h-4 text-teal-500" />
                  Upcoming Sessions
                </h2>
                <Link to="/teacher/live-sessions" className="text-sm text-gold-600 hover:text-gold-700">
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
              {loadingStats ? (
                <div className="p-4 space-y-2">
                  {[1,2].map(i => <div key={i} className="h-14 bg-gray-100 dark:bg-navy-700 rounded-lg animate-pulse" />)}
                </div>
              ) : liveSessions.length === 0 ? (
                <div className="p-6 text-center">
                  <Video className="w-8 h-8 text-gray-300 dark:text-navy-600 mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">No sessions scheduled</p>
                  <Link to="/teacher/live-sessions" className="text-xs text-gold-600 hover:text-gold-700 mt-1 inline-block">
                    Schedule one
                  </Link>
                </div>
              ) : (
                <div className="divide-y divide-gray-50 dark:divide-navy-700">
                  {liveSessions.map(session => (
                    <div key={session.id} className="p-4">
                      <p className="text-sm font-medium text-gray-900 dark:text-white mb-1 truncate">{session.title}</p>
                      <div className="flex items-center gap-1.5 text-xs text-gray-400">
                        <Clock className="w-3 h-3" />
                        {session.scheduled_at
                          ? new Date(session.scheduled_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
                          : 'TBD'}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs text-gray-400">{session.duration_minutes}min</span>
                        {session.meeting_link && (
                          <a href={session.meeting_link} target="_blank" rel="noreferrer" className="text-xs text-teal-600 hover:text-teal-700 font-medium">
                            Join link
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card">
              <div className="p-4 border-b border-gray-100 dark:border-navy-700">
                <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-orange-500" />
                  Upcoming Deadlines
                </h2>
              </div>
              {loadingActivity ? (
                <div className="p-4 space-y-2">
                  {[1,2,3].map(i => <div key={i} className="h-10 bg-gray-100 dark:bg-navy-700 rounded-lg animate-pulse" />)}
                </div>
              ) : assignments.length === 0 ? (
                <div className="p-6 text-center text-gray-400 text-sm">No upcoming deadlines</div>
              ) : (
                <div className="divide-y divide-gray-50 dark:divide-navy-700">
                  {assignments.map(a => {
                    const daysLeft = a.due_date
                      ? Math.ceil((new Date(a.due_date).getTime() - Date.now()) / 86400000)
                      : null;
                    return (
                      <div key={a.id} className="p-4">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate mb-1">{a.title}</p>
                        {daysLeft !== null && (
                          <p className={`text-xs font-medium ${daysLeft <= 2 ? 'text-red-500' : daysLeft <= 5 ? 'text-orange-500' : 'text-gray-400'}`}>
                            Due in {daysLeft} day{daysLeft !== 1 ? 's' : ''}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="card p-4">
              <h2 className="font-semibold text-gray-900 dark:text-white mb-3 text-sm">Quick Actions</h2>
              <div className="space-y-2">
                {[
                  { label: 'Build a Course', href: '/teacher/builder', color: 'text-gold-600 bg-gold-50 dark:bg-gold-900/20' },
                  { label: 'Create Quiz', href: '/teacher/quizzes', color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' },
                  { label: 'Post Assignment', href: '/teacher/assignments', color: 'text-orange-600 bg-orange-50 dark:bg-orange-900/20' },
                  { label: 'Schedule Session', href: '/teacher/live-sessions', color: 'text-teal-600 bg-teal-50 dark:bg-teal-900/20' },
                ].map(action => (
                  <Link
                    key={action.href}
                    to={action.href}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium ${action.color} hover:opacity-80 transition-opacity`}
                  >
                    {action.label}
                    <ChevronRight className="w-4 h-4 opacity-50" />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
