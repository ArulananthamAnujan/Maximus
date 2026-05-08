import {
  LayoutDashboard, BookOpen, Layers, HelpCircle, FileText, Users, MessageSquare, Video, Award, ClipboardList, DollarSign,
} from 'lucide-react';
import type { NavItem } from '../../components/layout/DashboardLayout';

export const teacherNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/teacher', icon: LayoutDashboard },
  { label: 'My Courses', href: '/teacher/courses', icon: BookOpen },
  { label: 'Course Builder', href: '/teacher/builder', icon: Layers },
  { label: 'Quizzes', href: '/teacher/quizzes', icon: HelpCircle },
  { label: 'Exams', href: '/teacher/exams', icon: ClipboardList },
  { label: 'Assignments', href: '/teacher/assignments', icon: FileText },
  { label: 'Students', href: '/teacher/students', icon: Users },
  { label: 'Discussions', href: '/teacher/discussions', icon: MessageSquare },
  { label: 'Live Sessions', href: '/teacher/live-sessions', icon: Video },
  { label: 'Certificates', href: '/teacher/certificates', icon: Award },
  { label: 'Earnings & AI', href: '/teacher/earnings', icon: DollarSign },
];
