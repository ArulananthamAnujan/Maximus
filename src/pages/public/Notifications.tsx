import { useState } from 'react';
import { Bell, BookOpen, Award, Calendar, Info, ChevronRight, GraduationCap } from 'lucide-react';
import { Link } from 'react-router-dom';
import PublicHeader from '../../components/layout/PublicHeader';
import PublicFooter from '../../components/layout/PublicFooter';

type NotifCategory = 'all' | 'courses' | 'events' | 'announcements';

interface Notification {
  id: number;
  type: 'course' | 'event' | 'announcement';
  title: string;
  message: string;
  date: string;
  isNew?: boolean;
}

const NOTIFICATIONS: Notification[] = [
  {
    id: 1,
    type: 'announcement',
    title: 'Welcome to Maximus Academy!',
    message: 'We are excited to launch our new learning platform. Explore our 8 expert-led courses and start your journey today. Use promo code WELCOME20 for 20% off!',
    date: '2026-04-09',
    isNew: true,
  },
  {
    id: 2,
    type: 'course',
    title: 'New Course: IELTS Preparation Now Available',
    message: 'Our comprehensive IELTS Preparation course is now open for enrolment. Limited seats available — secure your place today.',
    date: '2026-04-08',
    isNew: true,
  },
  {
    id: 3,
    type: 'course',
    title: 'PTE Academic Preparation — Enrol Now',
    message: 'Get exam-ready with our PTE Academic Preparation course. AI-scored mock tests, expert strategies, and personalised feedback.',
    date: '2026-04-07',
    isNew: true,
  },
  {
    id: 4,
    type: 'event',
    title: 'Free IELTS Information Session',
    message: 'Join our free online information session to learn about the IELTS exam format, scoring, and how our course can help you achieve your target band score.',
    date: '2026-04-15',
    isNew: true,
  },
  {
    id: 5,
    type: 'course',
    title: 'Language Courses Now Available',
    message: 'Japanese, French, and Spanish language courses are now live. Start from beginner level and build real conversational skills.',
    date: '2026-04-06',
  },
  {
    id: 6,
    type: 'course',
    title: 'Xero Beginner Course — Get Job-Ready',
    message: 'Learn Xero cloud accounting from scratch. Ideal for small business owners and professionals seeking an in-demand skill.',
    date: '2026-04-05',
  },
  {
    id: 7,
    type: 'announcement',
    title: 'Promo Code: WELCOME20 — 20% Off All Courses',
    message: 'As a special launch offer, all new students can use the promo code WELCOME20 at checkout to receive 20% off any paid course.',
    date: '2026-04-04',
  },
  {
    id: 8,
    type: 'event',
    title: 'Book a Free Consultation',
    message: 'Not sure which course is right for you? Book a free 30-minute consultation with our academic advisors.',
    date: '2026-04-03',
  },
];

const TYPE_ICONS = {
  course: BookOpen,
  event: Calendar,
  announcement: Bell,
};

const TYPE_COLORS = {
  course: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  event: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
  announcement: 'bg-gold-100 text-gold-700 dark:bg-gold-900/30 dark:text-gold-400',
};

export default function Notifications() {
  const [activeCategory, setActiveCategory] = useState<NotifCategory>('all');

  const filtered = NOTIFICATIONS.filter(n => {
    if (activeCategory === 'all') return true;
    if (activeCategory === 'courses') return n.type === 'course';
    if (activeCategory === 'events') return n.type === 'event';
    if (activeCategory === 'announcements') return n.type === 'announcement';
    return true;
  });

  const newCount = NOTIFICATIONS.filter(n => n.isNew).length;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-navy-950">
      <PublicHeader />

      {/* Hero */}
      <section className="pt-28 pb-12 bg-navy-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="w-16 h-16 bg-gold-500/20 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Bell className="w-8 h-8 text-gold-400" />
          </div>
          <h1 className="font-playfair text-4xl sm:text-5xl font-bold text-white mb-3">Notifications</h1>
          <p className="text-gray-400">Stay up to date with the latest news, course launches, and events from Maximus Academy.</p>
          {newCount > 0 && (
            <div className="inline-flex items-center gap-2 mt-4 bg-gold-500/20 border border-gold-500/30 rounded-full px-4 py-1.5">
              <span className="w-2 h-2 bg-gold-400 rounded-full animate-pulse" />
              <span className="text-gold-300 text-sm font-medium">{newCount} new notifications</span>
            </div>
          )}
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Filter Tabs */}
        <div className="flex gap-2 p-1 bg-white dark:bg-navy-800 rounded-xl w-fit mb-8 shadow-sm border border-gray-100 dark:border-navy-700">
          {([
            { key: 'all', label: 'All' },
            { key: 'announcements', label: 'Announcements' },
            { key: 'courses', label: 'Courses' },
            { key: 'events', label: 'Events' },
          ] as { key: NotifCategory; label: string }[]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveCategory(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeCategory === tab.key ? 'bg-navy-900 dark:bg-gold-500 text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Notifications List */}
        <div className="space-y-4">
          {filtered.map(notif => {
            const Icon = TYPE_ICONS[notif.type];
            return (
              <div
                key={notif.id}
                className={`bg-white dark:bg-navy-800 rounded-2xl border p-6 transition-all hover:shadow-md ${notif.isNew ? 'border-gold-200 dark:border-gold-800/50' : 'border-gray-100 dark:border-navy-700'}`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${TYPE_COLORS[notif.type]}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h3 className="font-semibold text-navy-900 dark:text-white">{notif.title}</h3>
                      <div className="flex items-center gap-2 shrink-0">
                        {notif.isNew && (
                          <span className="text-xs font-bold text-gold-600 dark:text-gold-400 bg-gold-50 dark:bg-gold-900/30 px-2 py-0.5 rounded-full">New</span>
                        )}
                        <span className="text-xs text-gray-400 whitespace-nowrap">{formatDate(notif.date)}</span>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{notif.message}</p>
                    {notif.type === 'course' && (
                      <Link to="/courses" className="inline-flex items-center gap-1 mt-3 text-sm text-gold-600 dark:text-gold-400 font-medium hover:text-gold-700 dark:hover:text-gold-300">
                        Browse Courses <ChevronRight className="w-4 h-4" />
                      </Link>
                    )}
                    {notif.type === 'event' && (
                      <Link to="/book-online" className="inline-flex items-center gap-1 mt-3 text-sm text-gold-600 dark:text-gold-400 font-medium hover:text-gold-700 dark:hover:text-gold-300">
                        Book Now <ChevronRight className="w-4 h-4" />
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-20">
            <Info className="w-12 h-12 text-gray-300 dark:text-navy-600 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">No notifications in this category.</p>
          </div>
        )}

        {/* CTA */}
        <div className="mt-12 bg-navy-900 rounded-2xl p-8 text-center">
          <GraduationCap className="w-10 h-10 text-gold-400 mx-auto mb-4" />
          <h3 className="font-playfair text-2xl font-bold text-white mb-3">Ready to Start Learning?</h3>
          <p className="text-gray-400 mb-6">Browse our full course catalogue and find the program that matches your goals.</p>
          <Link to="/courses" className="btn-primary px-8 py-3">View All Courses</Link>
        </div>
      </div>

      <PublicFooter />
    </div>
  );
}
