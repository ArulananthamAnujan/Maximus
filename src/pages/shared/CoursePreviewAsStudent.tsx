import { useLocation, useParams } from 'react-router-dom';
import StudentCoursePlayer from '../student/StudentCoursePlayer';
import { useAuth } from '../../contexts/AuthContext';
import { teacherNavItems } from '../teacher/teacherNav';
import { adminNavItems } from '../admin/adminNav';
import { orgNavItems } from '../org/orgNav';

/** Lets course staff walk through a course exactly as students see it, without saving anything. */
export default function CoursePreviewAsStudent() {
  const { profile } = useAuth();
  const { courseId } = useParams<{ courseId: string }>();
  const location = useLocation();
  const role = profile?.role;
  const nav = role === 'admin' ? adminNavItems : role === 'org_admin' ? orgNavItems : teacherNavItems;
  const builder = role === 'admin' ? '/admin/builder' : role === 'org_admin' ? '/org/builder' : '/teacher/builder';
  const requested = (location.state as { back?: unknown } | null)?.back;
  // Only same-site paths
  const back = typeof requested === 'string' && requested.startsWith('/') && !requested.startsWith('//')
    ? requested
    : `${builder}?courseId=${courseId ?? ''}`;
  return <StudentCoursePlayer preview navItems={nav} backTo={back} />;
}
