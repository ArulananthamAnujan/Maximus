import {
  LayoutDashboard, Users, GraduationCap, CreditCard, Award, BookOpen,
  MessageSquare, HelpCircle,
} from 'lucide-react';
import type { NavItem } from '../../components/layout/DashboardLayout';

export const coAdminNavItems: NavItem[] = [
  { label: 'Dashboard',        href: '/co-admin',                    icon: LayoutDashboard, group: 'Overview' },
  { label: 'Students',         href: '/co-admin/students',           icon: GraduationCap,   group: 'People' },
  { label: 'Teachers',         href: '/co-admin/teachers',           icon: BookOpen,        group: 'People' },
  { label: 'Enrolments',       href: '/co-admin/enrollments',        icon: Users,           group: 'Learning' },
  { label: 'Certificates',     href: '/co-admin/certificates',       icon: Award,           group: 'Learning' },
  { label: 'Payments',         href: '/co-admin/payments',           icon: CreditCard,      group: 'Finance' },
  { label: 'Contact Messages', href: '/co-admin/contact-messages',   icon: MessageSquare,   group: 'Support' },
  { label: 'FAQ Manager',      href: '/co-admin/faqs',               icon: HelpCircle,      group: 'Support' },
];
