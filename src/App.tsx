import { lazy, Suspense, useEffect, Component, ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; message: string }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(error: unknown) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    return { hasError: true, message };
  }
  componentDidCatch(error: unknown, info: unknown) {
    console.error('ErrorBoundary caught:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8 max-w-md w-full text-center">
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Something went wrong</h2>
            <p className="text-sm text-slate-500 mb-6">{this.state.message}</p>
            <button
              onClick={() => { this.setState({ hasError: false, message: '' }); window.location.reload(); }}
              className="px-6 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const Home = lazy(() => import('./pages/public/Home'));
const Courses = lazy(() => import('./pages/public/Courses'));
const CoursePreview = lazy(() => import('./pages/public/CoursePreview'));
const About = lazy(() => import('./pages/public/About'));
const Contact = lazy(() => import('./pages/public/Contact'));
const BookOnline = lazy(() => import('./pages/public/BookOnline'));
const VerifyCertificate = lazy(() => import('./pages/public/VerifyCertificate'));
const OurMission = lazy(() => import('./pages/public/OurMission'));
const Notifications = lazy(() => import('./pages/public/Notifications'));

const Login = lazy(() => import('./pages/auth/Login'));
const Register = lazy(() => import('./pages/auth/Register'));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'));

const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminCourses = lazy(() => import('./pages/admin/AdminCourses'));
const AdminCourseBuilder = lazy(() => import('./pages/admin/AdminCourseBuilder'));
const AdminEnrollments = lazy(() => import('./pages/admin/AdminEnrollments'));
const AdminPayments = lazy(() => import('./pages/admin/AdminPayments'));
const AdminCertificates = lazy(() => import('./pages/admin/AdminCertificates'));
const AdminPromoCodes = lazy(() => import('./pages/admin/AdminPromoCodes'));
const AdminAnnouncements = lazy(() => import('./pages/admin/AdminAnnouncements'));
const AdminActivityLog = lazy(() => import('./pages/admin/AdminActivityLog'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));
const AdminAIUsage = lazy(() => import('./pages/admin/AdminAIUsage'));
const AdminOrganizations = lazy(() => import('./pages/admin/AdminOrganizations'));
const AdminOrgDetail = lazy(() => import('./pages/admin/AdminOrgDetail'));
const AdminTokenPackages = lazy(() => import('./pages/admin/AdminTokenPackages'));

const OrgDashboard = lazy(() => import('./pages/org/OrgDashboard'));
const OrgTeachers = lazy(() => import('./pages/org/OrgTeachers'));
const OrgStudents = lazy(() => import('./pages/org/OrgStudents'));
const OrgCourses = lazy(() => import('./pages/org/OrgCourses'));
const OrgCourseBuilder = lazy(() => import('./pages/org/OrgCourseBuilder'));
const OrgTokens = lazy(() => import('./pages/org/OrgTokens'));
const OrgSettings = lazy(() => import('./pages/org/OrgSettings'));

const TeacherDashboard = lazy(() => import('./pages/teacher/TeacherDashboard'));
const TeacherCourses = lazy(() => import('./pages/teacher/TeacherCourses'));
const CourseBuilder = lazy(() => import('./pages/teacher/CourseBuilder'));
const TeacherQuizzes = lazy(() => import('./pages/teacher/TeacherQuizzes'));
const TeacherAssignments = lazy(() => import('./pages/teacher/TeacherAssignments'));
const TeacherStudents = lazy(() => import('./pages/teacher/TeacherStudents'));
const TeacherDiscussions = lazy(() => import('./pages/teacher/TeacherDiscussions'));
const TeacherLiveSessions = lazy(() => import('./pages/teacher/TeacherLiveSessions'));
const TeacherCertificates = lazy(() => import('./pages/teacher/TeacherCertificates'));
const TeacherExams = lazy(() => import('./pages/teacher/TeacherExams'));

const StudentDashboard = lazy(() => import('./pages/student/StudentDashboard'));
const StudentCourses = lazy(() => import('./pages/student/StudentCourses'));
const StudentCoursePlayer = lazy(() => import('./pages/student/StudentCoursePlayer'));
const StudentQuizzes = lazy(() => import('./pages/student/StudentQuizzes'));
const StudentAssignments = lazy(() => import('./pages/student/StudentAssignments'));
const StudentCertificates = lazy(() => import('./pages/student/StudentCertificates'));
const StudentProfile = lazy(() => import('./pages/student/StudentProfile'));
const StudentExams = lazy(() => import('./pages/student/StudentExams'));
const StudentAIPlans = lazy(() => import('./pages/student/StudentAIPlans'));

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-navy-900 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-gold-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-white font-medium font-playfair">Loading Maximus Academy...</p>
      </div>
    </div>
  );
}

function roleHome(role: string) {
  if (role === 'admin') return '/admin';
  if (role === 'org_admin') return '/org';
  if (role === 'teacher') return '/teacher';
  return '/student';
}

function DashboardRedirect() {
  const { profile, loading, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate('/login', { replace: true }); return; }
    if (profile) navigate(roleHome(profile.role), { replace: true });
    else navigate('/student', { replace: true });
  }, [profile, loading, user, navigate]);

  return <LoadingScreen />;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (user && profile) return <Navigate to={roleHome(profile.role)} replace />;
  return <>{children}</>;
}

function ProtectedRoute({ children, role }: { children: React.ReactNode; role?: string | string[] }) {
  const { user, profile, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  const roles = role ? (Array.isArray(role) ? role : [role]) : null;
  if (roles && profile && !roles.includes(profile.role)) {
    return <Navigate to={roleHome(profile.role)} replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <Toaster position="top-right" richColors closeButton />
            <ErrorBoundary>
            <Suspense fallback={<LoadingScreen />}>
              <Routes>
                <Route path="/dashboard" element={<DashboardRedirect />} />

                <Route path="/" element={<Home />} />
                <Route path="/courses" element={<Courses />} />
                <Route path="/courses/:id" element={<CoursePreview />} />
                <Route path="/about" element={<About />} />
                <Route path="/our-mission" element={<OurMission />} />
                <Route path="/contact" element={<Contact />} />
                <Route path="/book-online" element={<BookOnline />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/verify/:id" element={<VerifyCertificate />} />
                <Route path="/verify" element={<VerifyCertificate />} />

                <Route path="/login" element={<AuthRoute><Login /></AuthRoute>} />
                <Route path="/register" element={<AuthRoute><Register /></AuthRoute>} />
                <Route path="/forgot-password" element={<ForgotPassword />} />

                <Route path="/admin" element={<ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>} />
                <Route path="/admin/users" element={<ProtectedRoute role="admin"><AdminUsers /></ProtectedRoute>} />
                <Route path="/admin/courses" element={<ProtectedRoute role="admin"><AdminCourses /></ProtectedRoute>} />
                <Route path="/admin/builder" element={<ProtectedRoute role="admin"><AdminCourseBuilder /></ProtectedRoute>} />
                <Route path="/admin/enrollments" element={<ProtectedRoute role="admin"><AdminEnrollments /></ProtectedRoute>} />
                <Route path="/admin/payments" element={<ProtectedRoute role="admin"><AdminPayments /></ProtectedRoute>} />
                <Route path="/admin/certificates" element={<ProtectedRoute role="admin"><AdminCertificates /></ProtectedRoute>} />
                <Route path="/admin/promo-codes" element={<ProtectedRoute role="admin"><AdminPromoCodes /></ProtectedRoute>} />
                <Route path="/admin/announcements" element={<ProtectedRoute role="admin"><AdminAnnouncements /></ProtectedRoute>} />
                <Route path="/admin/activity" element={<ProtectedRoute role="admin"><AdminActivityLog /></ProtectedRoute>} />
                <Route path="/admin/settings" element={<ProtectedRoute role="admin"><AdminSettings /></ProtectedRoute>} />
                <Route path="/admin/ai-usage" element={<ProtectedRoute role="admin"><AdminAIUsage /></ProtectedRoute>} />
                <Route path="/admin/organizations" element={<ProtectedRoute role="admin"><AdminOrganizations /></ProtectedRoute>} />
                <Route path="/admin/organizations/:orgId" element={<ProtectedRoute role="admin"><AdminOrgDetail /></ProtectedRoute>} />
                <Route path="/admin/token-packages" element={<ProtectedRoute role="admin"><AdminTokenPackages /></ProtectedRoute>} />

                <Route path="/org" element={<ProtectedRoute role="org_admin"><OrgDashboard /></ProtectedRoute>} />
                <Route path="/org/teachers" element={<ProtectedRoute role="org_admin"><OrgTeachers /></ProtectedRoute>} />
                <Route path="/org/students" element={<ProtectedRoute role="org_admin"><OrgStudents /></ProtectedRoute>} />
                <Route path="/org/courses" element={<ProtectedRoute role="org_admin"><OrgCourses /></ProtectedRoute>} />
                <Route path="/org/builder" element={<ProtectedRoute role="org_admin"><OrgCourseBuilder /></ProtectedRoute>} />
                <Route path="/org/tokens" element={<ProtectedRoute role="org_admin"><OrgTokens /></ProtectedRoute>} />
                <Route path="/org/settings" element={<ProtectedRoute role="org_admin"><OrgSettings /></ProtectedRoute>} />

                <Route path="/teacher" element={<ProtectedRoute role="teacher"><TeacherDashboard /></ProtectedRoute>} />
                <Route path="/teacher/courses" element={<ProtectedRoute role="teacher"><TeacherCourses /></ProtectedRoute>} />
                <Route path="/teacher/builder" element={<ProtectedRoute role="teacher"><CourseBuilder /></ProtectedRoute>} />
                <Route path="/teacher/builder/:courseId" element={<ProtectedRoute role="teacher"><CourseBuilder /></ProtectedRoute>} />
                <Route path="/teacher/quizzes" element={<ProtectedRoute role="teacher"><TeacherQuizzes /></ProtectedRoute>} />
                <Route path="/teacher/assignments" element={<ProtectedRoute role="teacher"><TeacherAssignments /></ProtectedRoute>} />
                <Route path="/teacher/students" element={<ProtectedRoute role="teacher"><TeacherStudents /></ProtectedRoute>} />
                <Route path="/teacher/discussions" element={<ProtectedRoute role="teacher"><TeacherDiscussions /></ProtectedRoute>} />
                <Route path="/teacher/live-sessions" element={<ProtectedRoute role="teacher"><TeacherLiveSessions /></ProtectedRoute>} />
                <Route path="/teacher/certificates" element={<ProtectedRoute role="teacher"><TeacherCertificates /></ProtectedRoute>} />
                <Route path="/teacher/exams" element={<ProtectedRoute role="teacher"><TeacherExams /></ProtectedRoute>} />

                <Route path="/student" element={<ProtectedRoute role="student"><StudentDashboard /></ProtectedRoute>} />
                <Route path="/student/courses" element={<ProtectedRoute role="student"><StudentCourses /></ProtectedRoute>} />
                <Route path="/student/courses/:courseId" element={<ProtectedRoute role="student"><StudentCoursePlayer /></ProtectedRoute>} />
                <Route path="/student/quizzes" element={<ProtectedRoute role="student"><StudentQuizzes /></ProtectedRoute>} />
                <Route path="/student/assignments" element={<ProtectedRoute role="student"><StudentAssignments /></ProtectedRoute>} />
                <Route path="/student/certificates" element={<ProtectedRoute role="student"><StudentCertificates /></ProtectedRoute>} />
                <Route path="/student/profile" element={<ProtectedRoute role="student"><StudentProfile /></ProtectedRoute>} />
                <Route path="/student/exams" element={<ProtectedRoute role="student"><StudentExams /></ProtectedRoute>} />
                <Route path="/student/ai-plans" element={<ProtectedRoute role="student"><StudentAIPlans /></ProtectedRoute>} />

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
            </ErrorBoundary>
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
    </QueryClientProvider>
  );
}
