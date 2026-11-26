import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Search, Plus, Eye, EyeOff, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { orgNavItems } from './orgNav';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Course } from '../../types';

interface CourseWithTeacher extends Omit<Course, 'teacher'> {
  teacher: { full_name: string; email: string } | null;
}

export default function OrgCourses() {
  const { orgMembership } = useAuth();
  const orgId = (orgMembership?.organization as { id?: string })?.id ?? orgMembership?.org_id;
  const [search, setSearch] = useState('');

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ['org-courses', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('courses')
        .select('*, teacher:profiles!teacher_id(full_name, email)')
        .eq('org_id', orgId!)
        .order('created_at', { ascending: false });
      return (data ?? []) as CourseWithTeacher[];
    },
  });

  const filtered = courses.filter(c =>
    c.title.toLowerCase().includes(search.toLowerCase()) ||
    c.category?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout navItems={orgNavItems} title="Courses" subtitle="All courses created by your organisation">
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Search courses..." value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-9" />
          </div>
          <Link to="/org/builder" className="btn-primary flex items-center gap-2 shrink-0">
            <Plus className="w-4 h-4" /> New Course
          </Link>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => <div key={i} className="card h-48 animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="card p-12 text-center">
            <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No courses yet</p>
            <p className="text-sm text-slate-400 mt-1 mb-4">Create your first course with AI generation.</p>
            <Link to="/org/builder" className="btn-primary inline-flex items-center gap-2"><Plus className="w-4 h-4" /> Create Course</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(c => (
              <div key={c.id} className="card overflow-hidden group hover:shadow-md transition-shadow">
                {c.thumbnail_url ? (
                  <img src={c.thumbnail_url} alt={c.title} className="w-full h-36 object-cover" />
                ) : (
                  <div className="w-full h-36 bg-gradient-to-br from-sky-100 to-teal-100 flex items-center justify-center">
                    <BookOpen className="w-8 h-8 text-teal-400" />
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-semibold text-slate-800 text-sm leading-snug line-clamp-2">{c.title}</h3>
                    <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${c.is_published ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {c.is_published ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                      {c.is_published ? 'Published' : 'Draft'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mb-3 line-clamp-2">{c.short_description || 'No description'}</p>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(c.created_at).toLocaleDateString()}</span>
                    <span>{c.teacher?.full_name ?? '—'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
