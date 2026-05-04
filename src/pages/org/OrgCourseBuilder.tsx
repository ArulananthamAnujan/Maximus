import { lazy, Suspense } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { orgNavItems } from './orgNav';

// Reuse the existing shared CourseBuilder — it handles its own supabase calls
const SharedCourseBuilder = lazy(() => import('../shared/CourseBuilder'));

export default function OrgCourseBuilder() {
  return (
    <DashboardLayout navItems={orgNavItems} title="Course Builder" subtitle="Create and manage AI-powered courses">
      <Suspense fallback={<div className="h-64 flex items-center justify-center text-slate-400">Loading builder...</div>}>
        <SharedCourseBuilder />
      </Suspense>
    </DashboardLayout>
  );
}
