import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';

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

const TeacherDashboard = lazy(() => import('./pages/teacher/TeacherDashboard'));
const TeacherCourses = lazy(() => import('./pages/teacher/TeacherCourses'));
const CourseBuilder = lazy(() => import('./pages/teacher/CourseBuilder'));
const TeacherQuizzes = lazy(() => import('./pages/teacher/TeacherQuizzes'));
const TeacherAssignments = lazy(() => import('./pages/teacher/TeacherAssignments'));
const TeacherStudents = lazy(() => import('./pages/teacher/TeacherStudents'));
const TeacherDiscussions = lazy(() => import('./pages/teacher/TeacherDiscussions'));
const TeacherLiveSessions = lazy(() => import('./pages/teacher/TeacherLiveSessions'));
const TeacherCertificates = lazy(() => import('./pages/teacher/TeacherCertificates'));

const StudentDashboard = lazy(() => import('./pages/student/StudentDashboard'));
const StudentCourses = lazy(() => import('./pages/student/StudentCourses'));
const StudentCoursePlayer = lazy(() => import('./pages/student/StudentCoursePlayer'));
const StudentQuizzes = lazy(() => import('./pages/student/StudentQuizzes'));
const StudentAssignments = lazy(() => import('./pages/student/StudentAssignments'));
const StudentCertificates = lazy(() => import('./pages/student/StudentCertificates'));
const StudentProfile = lazy(() => import('./pages/student/StudentProfile'));

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

function DashboardRedirect() {
  const { profile, loading, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate('/login', { replace: true }); return; }
    if (profile) {
      if (profile.role === 'admin') navigate('/admin', { replace: true });
      else if (profile.role === 'teacher') navigate('/teacher', { replace: true });
      else navigate('/student', { replace: true });
    } else {
      navigate('/student', { replace: true });
    }
  }, [profile, loading, user, navigate]);

  return <LoadingScreen />;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (user && profile) {
    if (profile.role === 'admin') return <Navigate to="/admin" replace />;
    if (profile.role === 'teacher') return <Navigate to="/teacher" replace />;
    return <Navigate to="/student" replace />;
  }
  return <>{children}</>;
}

function ProtectedRoute({ children, role }: { children: React.ReactNode; role?: string }) {
  const { user, profile, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (role && profile && profile.role !== role) {
    if (profile.role === 'admin') return <Navigate to="/admin" replace />;
    if (profile.role === 'teacher') return <Navigate to="/teacher" replace />;
    return <Navigate to="/student" replace />;
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

                <Route path="/student" element={<ProtectedRoute role="student"><StudentDashboard /></ProtectedRoute>} />
                <Route path="/student/courses" element={<ProtectedRoute role="student"><StudentCourses /></ProtectedRoute>} />
                <Route path="/student/courses/:courseId" element={<ProtectedRoute role="student"><StudentCoursePlayer /></ProtectedRoute>} />
                <Route path="/student/quizzes" element={<ProtectedRoute role="student"><StudentQuizzes /></ProtectedRoute>} />
                <Route path="/student/assignments" element={<ProtectedRoute role="student"><StudentAssignments /></ProtectedRoute>} />
                <Route path="/student/certificates" element={<ProtectedRoute role="student"><StudentCertificates /></ProtectedRoute>} />
                <Route path="/student/profile" element={<ProtectedRoute role="student"><StudentProfile /></ProtectedRoute>} />

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
    </QueryClientProvider>
  );
}
