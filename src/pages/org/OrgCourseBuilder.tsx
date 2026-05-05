import { lazy, Suspense } from 'react';
import { orgNavItems } from './orgNav';

const SharedCourseBuilder = lazy(() => import('../shared/CourseBuilder'));

export default function OrgCourseBuilder() {
  return (
    <Suspense fallback={<div className="h-64 flex items-center justify-center text-slate-400">Loading builder...</div>}>
      <SharedCourseBuilder navItems={orgNavItems} role="teacher" />
    </Suspense>
  );
}
