import {
  LayoutDashboard, Users, BookOpen, GraduationCap, CreditCard, Award,
  Tag, Bell, Settings, Activity, Layers, Sparkles,
} from 'lucide-react';
import type { NavItem } from '../../components/layout/DashboardLayout';

export const adminNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { label: 'Users', href: '/admin/users', icon: Users },
  { label: 'Courses', href: '/admin/courses', icon: BookOpen },
  { label: 'Course Builder', href: '/admin/builder', icon: Layers },
  { label: 'Enrolments', href: '/admin/enrollments', icon: GraduationCap },
  { label: 'Payments', href: '/admin/payments', icon: CreditCard },
  { label: 'Certificates', href: '/admin/certificates', icon: Award },
  { label: 'Promo Codes', href: '/admin/promo-codes', icon: Tag },
  { label: 'Announcements', href: '/admin/announcements', icon: Bell },
  { label: 'Activity Log', href: '/admin/activity', icon: Activity },
  { label: 'AI Usage', href: '/admin/ai-usage', icon: Sparkles },
  { label: 'Settings', href: '/admin/settings', icon: Settings },
];
