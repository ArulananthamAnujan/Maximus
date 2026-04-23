import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Search, Filter, Star, Clock, BookOpen, SlidersHorizontal, X } from 'lucide-react';
import PublicHeader from '../../components/layout/PublicHeader';
import PublicFooter from '../../components/layout/PublicFooter';
import { supabase } from '../../lib/supabase';
import type { Course } from '../../types';
import { CourseCardSkeleton } from '../../components/ui/LoadingSkeleton';

const CATEGORIES = ['All', 'IELTS', 'PTE', 'Language', 'Business', 'Technology', 'Finance', 'Xero', 'General'];
const LEVELS = ['All', 'Beginner', 'Intermediate', 'Advanced'];
const PRICE_FILTERS = ['All', 'Free', 'Paid'];

// Module-level cache so navigating back doesn't refetch
let cachedCourses: Course[] | null = null;

export default function Courses() {
  const [allCourses, setAllCourses] = useState<Course[]>(cachedCourses ?? []);
  const [loading, setLoading] = useState(cachedCourses === null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [level, setLevel] = useState('All');
  const [priceFilter, setPriceFilter] = useState('All');
  const [sortBy, setSortBy] = useState('popular');
  const [showFilters, setShowFilters] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (cachedCourses !== null) return;
    supabase
      .from('courses')
      .select('id,title,short_description,thumbnail_url,price,price_amount,is_free,is_paid,category,level,rating,duration_hours,total_lessons,total_students,created_at,teacher:profiles(full_name)')
      .eq('is_published', true)
      .eq('is_archived', false)
      .then(({ data }) => {
        const courses = (data as Course[]) ?? [];
        cachedCourses = courses;
        setAllCourses(courses);
        setLoading(false);
      });
  }, []);

  // Debounce search input — only update filter after 250ms of no typing
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  // All filtering and sorting is done in memory — zero extra DB calls
  const courses = useMemo(() => {
    let result = allCourses;
    if (category !== 'All') result = result.filter(c => c.category === category);
    if (level !== 'All') result = result.filter(c => c.level?.toLowerCase() === level.toLowerCase());
    if (priceFilter === 'Free') result = result.filter(c => c.is_free);
    if (priceFilter === 'Paid') result = result.filter(c => !c.is_free);
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(c => c.title.toLowerCase().includes(q) || (c.short_description || '').toLowerCase().includes(q));
    }
    switch (sortBy) {
      case 'newest': return [...result].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      case 'price_low': return [...result].sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
      case 'price_high': return [...result].sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
      default: return [...result].sort((a, b) => (b.total_students ?? 0) - (a.total_students ?? 0));
    }
  }, [allCourses, category, level, priceFilter, debouncedSearch, sortBy]);

  return (
    <div className="bg-white min-h-screen">
      <PublicHeader />
      <div className="pt-16 lg:pt-20">
        <div className="bg-slate-900 py-16 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(14,165,233,0.1),transparent_60%)]" />
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <p className="text-sky-400 font-semibold text-sm uppercase tracking-wider mb-2">Learn Anything</p>
            <h1 className="font-playfair text-4xl lg:text-5xl font-bold text-white mb-4">All Courses</h1>
            <p className="text-slate-300 text-lg mb-8">Discover your next skill. Browse our full catalogue of professional courses.</p>
            <div className="max-w-2xl mx-auto relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Search courses..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-12 pr-4 py-4 rounded-xl bg-white border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400 text-lg"
              />
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col lg:flex-row gap-8">
            <aside className={`lg:w-64 shrink-0 ${showFilters ? '' : 'hidden lg:block'}`}>
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 sticky top-24">
                <h3 className="font-bold text-slate-900 mb-5">Filters</h3>

                <div className="mb-5">
                  <p className="text-sm font-semibold text-slate-500 mb-3 uppercase tracking-wide">Category</p>
                  <div className="space-y-1">
                    {CATEGORIES.map(cat => (
                      <button key={cat} onClick={() => setCategory(cat)} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${category === cat ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-5">
                  <p className="text-sm font-semibold text-slate-500 mb-3 uppercase tracking-wide">Level</p>
                  <div className="space-y-1">
                    {LEVELS.map(l => (
                      <button key={l} onClick={() => setLevel(l)} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${level === l ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold text-slate-500 mb-3 uppercase tracking-wide">Price</p>
                  <div className="space-y-1">
                    {PRICE_FILTERS.map(p => (
                      <button key={p} onClick={() => setPriceFilter(p)} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${priceFilter === p ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </aside>

            <div className="flex-1">
              <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <button onClick={() => setShowFilters(!showFilters)} className="lg:hidden flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-700">
                    <SlidersHorizontal className="w-4 h-4" />
                    Filters
                  </button>
                  <p className="text-slate-500 text-sm">
                    <span className="font-bold text-slate-900">{courses.length}</span> courses found
                  </p>
                </div>
                <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="input-field w-auto text-sm py-2">
                  <option value="popular">Most Popular</option>
                  <option value="newest">Newest</option>
                  <option value="price_low">Price: Low to High</option>
                  <option value="price_high">Price: High to Low</option>
                </select>
              </div>

              {loading ? (
                <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {[1,2,3,4,5,6].map(i => <CourseCardSkeleton key={i} />)}
                </div>
              ) : courses.length === 0 ? (
                <div className="text-center py-20">
                  <Filter className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-slate-900 mb-2">No courses found</h3>
                  <p className="text-slate-500 mb-4">Try adjusting your filters or search term.</p>
                  <button onClick={() => { setCategory('All'); setLevel('All'); setPriceFilter('All'); setSearch(''); }} className="text-sky-600 hover:text-sky-700 font-semibold flex items-center gap-1 mx-auto">
                    <X className="w-4 h-4" /> Clear filters
                  </button>
                </div>
              ) : (
                <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {courses.map(course => <CourseCard key={course.id} course={course} />)}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <PublicFooter />
    </div>
  );
}

function CourseCard({ course }: { course: Course }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm group hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden">
      <div className="relative h-44 overflow-hidden">
        <img
          src={course.thumbnail_url || 'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg'}
          alt={course.title}
          width={400}
          height={176}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        <div className="absolute top-3 left-3">
          {course.is_free
            ? <span className="bg-emerald-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">Free</span>
            : <span className="bg-white/90 text-slate-800 text-xs font-bold px-2.5 py-1 rounded-full capitalize">{course.level}</span>
          }
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-center gap-1 mb-2">
          {[1,2,3,4,5].map(i => <Star key={i} className={`w-3 h-3 ${i <= Math.round(course.rating) ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />)}
          <span className="text-xs text-slate-400 ml-1">{course.rating}</span>
        </div>
        <h3 className="font-bold text-slate-900 mb-1.5 line-clamp-2 text-sm leading-snug group-hover:text-sky-600 transition-colors">{course.title}</h3>
        <p className="text-xs text-slate-500 mb-3 line-clamp-2">{course.short_description}</p>
        <div className="flex items-center gap-3 text-xs text-slate-400 mb-3">
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{course.duration_hours}h</span>
          <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" />{course.total_lessons} lessons</span>
        </div>
        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <span className="font-bold text-slate-900 text-sm">{course.is_free ? 'Free' : `A$${course.price}`}</span>
          <Link to={`/courses/${course.id}`} className="px-4 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-lg transition-colors">View Course</Link>
        </div>
      </div>
    </div>
  );
}
