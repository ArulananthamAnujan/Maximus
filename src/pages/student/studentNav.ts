import {
  LayoutDashboard, BookOpen, HelpCircle, FileText, Award, User, Compass, ClipboardList, Sparkles,
} from 'lucide-react';
import type { NavItem } from '../../components/layout/DashboardLayout';

export const studentNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/student', icon: LayoutDashboard },
  { label: 'Explore Courses', href: '/student/courses', icon: Compass },
  { label: 'My Learning', href: '/student/courses', icon: BookOpen },
  { label: 'Quizzes', href: '/student/quizzes', icon: HelpCircle },
  { label: 'Exams', href: '/student/exams', icon: ClipboardList },
  { label: 'Assignments', href: '/student/assignments', icon: FileText },
  { label: 'Certificates', href: '/student/certificates', icon: Award },
  { label: 'AI Assistant', href: '/student/ai-plans', icon: Sparkles },
  { label: 'My Profile', href: '/student/profile', icon: User },
];
