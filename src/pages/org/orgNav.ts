import { LayoutDashboard, Users, BookOpen, Layers, Coins, Settings } from 'lucide-react';
import type { NavItem } from '../../components/layout/DashboardLayout';

export const orgNavItems: NavItem[] = [
  { label: 'Dashboard',     href: '/org',           icon: LayoutDashboard },
  { label: 'Teachers',      href: '/org/teachers',  icon: Users },
  { label: 'Courses',       href: '/org/courses',   icon: BookOpen },
  { label: 'Course Builder',href: '/org/builder',   icon: Layers },
  { label: 'Tokens',        href: '/org/tokens',    icon: Coins },
  { label: 'Settings',      href: '/org/settings',  icon: Settings },
];
