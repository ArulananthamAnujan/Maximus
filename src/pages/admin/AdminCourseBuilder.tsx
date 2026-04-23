import CourseBuilder from '../shared/CourseBuilder';
import { adminNavItems } from './adminNav';

export default function AdminCourseBuilder() {
  return <CourseBuilder navItems={adminNavItems} role="admin" />;
}
