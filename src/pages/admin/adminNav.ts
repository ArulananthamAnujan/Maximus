import {
  LayoutDashboard, Users, BookOpen, GraduationCap, CreditCard, Award,
  Tag, Bell, Settings, Activity, Layers, Sparkles, Building2, Coins,
} from 'lucide-react';
import type { NavItem } from '../../components/layout/DashboardLayout';

export const adminNavItems: NavItem[] = [
  { label: 'Dashboard',      href: '/admin',                   icon: LayoutDashboard, group: 'Platform' },
  { label: 'Users',          href: '/admin/users',             icon: Users,           group: 'Platform' },
  { label: 'Organizations',  href: '/admin/organizations',     icon: Building2,       group: 'Platform' },
  { label: 'Token Packages', href: '/admin/token-packages',    icon: Coins,           group: 'Platform' },
  { label: 'Courses',        href: '/admin/courses',           icon: BookOpen,        group: 'Learning' },
  { label: 'Course Builder', href: '/admin/builder',           icon: Layers,          group: 'Learning' },
  { label: 'Enrolments',     href: '/admin/enrollments',       icon: GraduationCap,   group: 'Learning' },
  { label: 'Certificates',   href: '/admin/certificates',      icon: Award,           group: 'Learning' },
  { label: 'Payments',       href: '/admin/payments',          icon: CreditCard,      group: 'Finance' },
  { label: 'Promo Codes',    href: '/admin/promo-codes',       icon: Tag,             group: 'Finance' },
  { label: 'Announcements',  href: '/admin/announcements',     icon: Bell,            group: 'Comms' },
  { label: 'Activity Log',   href: '/admin/activity',          icon: Activity,        group: 'Comms' },
  { label: 'AI Usage',       href: '/admin/ai-usage',          icon: Sparkles,        group: 'System' },
  { label: 'Settings',       href: '/admin/settings',          icon: Settings,        group: 'System' },
];
