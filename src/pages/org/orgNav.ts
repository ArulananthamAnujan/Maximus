import { LayoutDashboard, Users, GraduationCap, BookOpen, Layers, Coins, Settings } from 'lucide-react';
import type { NavItem } from '../../components/layout/DashboardLayout';

export const orgNavItems: NavItem[] = [
  { label: 'Dashboard',     href: '/org',           icon: LayoutDashboard, group: 'Overview' },
  { label: 'Teachers',      href: '/org/teachers',  icon: Users,           group: 'People' },
  { label: 'Students',      href: '/org/students',  icon: GraduationCap,   group: 'People' },
  { label: 'Courses',       href: '/org/courses',   icon: BookOpen,        group: 'Content' },
  { label: 'Course Builder',href: '/org/builder',   icon: Layers,          group: 'Content' },
  { label: 'Tokens & Plans',href: '/org/tokens',    icon: Coins,           group: 'Billing' },
  { label: 'Settings',      href: '/org/settings',  icon: Settings,        group: 'Billing' },
];
