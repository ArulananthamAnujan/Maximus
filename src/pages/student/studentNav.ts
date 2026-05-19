import {
  LayoutDashboard, BookOpen, HelpCircle, FileText, Award, User,
  ClipboardList, Sparkles, Video,
} from 'lucide-react';
import type { NavItem } from '../../components/layout/DashboardLayout';

export const studentNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/student', icon: LayoutDashboard, group: 'Overview' },
  { label: 'My Courses', href: '/student/courses', icon: BookOpen, group: 'Learning' },
  { label: 'Quizzes', href: '/student/quizzes', icon: HelpCircle, group: 'Learning' },
  { label: 'Exams', href: '/student/exams', icon: ClipboardList, group: 'Learning' },
  { label: 'Assignments', href: '/student/assignments', icon: FileText, group: 'Learning' },
  { label: 'Certificates', href: '/student/certificates', icon: Award, group: 'Achievements' },
  { label: 'AI Assistant', href: '/student/ai-plans', icon: Sparkles, group: 'Tools' },
  { label: 'Face-to-Face', href: '/student/f2f', icon: Video, group: 'Tools' },
  { label: 'My Profile', href: '/student/profile', icon: User, group: 'Account' },
];
