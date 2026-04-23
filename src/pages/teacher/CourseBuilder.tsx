import CourseBuilder from '../shared/CourseBuilder';
import { teacherNavItems } from './teacherNav';

export default function TeacherCourseBuilder() {
  return <CourseBuilder navItems={teacherNavItems} role="teacher" />;
}
