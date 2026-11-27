import { ArrowLeft, Eye, Rocket } from 'lucide-react';
import type { ReadinessItem } from '../../lib/workspace';
import { itemComplete } from '../../lib/workspace';

export type WorkspaceTab = 'overview' | 'weeks' | 'assessments' | 'schedule' | 'results' | 'settings';

const TABS: { id: WorkspaceTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'weeks', label: 'Weeks' },
  { id: 'assessments', label: 'Assessments' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'results', label: 'Students & results' },
  { id: 'settings', label: 'Settings' },
];

interface Props {
  title: string;
  /** One line: who it's for, how long, what it leads to. */
  summary: string;
  published: boolean;
  percent: number;
  items: ReadinessItem[];
  tab: WorkspaceTab;
  onTab: (tab: WorkspaceTab) => void;
  onBack: () => void;
  onPreview: () => void;
  onPublish: () => void;
  /** Open the place where a readiness item is fixed. */
  onItem: (item: ReadinessItem) => void;
}

export default function CourseHeader({ title, summary, published, percent, items, tab, onTab, onBack, onPreview, onPublish, onItem }: Props) {
  const chips = items.filter(i => i.total > 0 && (i.level !== 'optional' || i.done > 0));
  return (
    <div className="bg-white border border-slate-200 rounded-2xl px-5 sm:px-6 pt-4">
      <button onClick={onBack} className="flex items-center gap-1 text-xs text-slate-500 hover:text-sky-700 mb-2">
        <ArrowLeft className="w-3.5 h-3.5" /> My courses
      </button>
      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 break-words">{title || 'Untitled course'}</h1>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${published ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
              {published ? 'Published' : 'Draft'}
            </span>
          </div>
          {summary && <p className="text-sm text-slate-500 mt-1">{summary}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={onPreview} className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold border border-slate-300 rounded-lg text-slate-700 bg-white hover:bg-slate-50">
            <Eye className="w-4 h-4" /> Preview as student
          </button>
          <button onClick={onPublish} className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold rounded-lg bg-sky-600 hover:bg-sky-700 text-white">
            <Rocket className="w-4 h-4" /> {published ? 'Publishing options' : 'Publish…'}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-4 flex-wrap">
        <div className="w-40 bg-slate-100 rounded-full h-2" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Course readiness">
          <div className="bg-sky-500 h-2 rounded-full transition-all" style={{ width: `${percent}%` }} />
        </div>
        <span className="text-sm font-semibold text-slate-700 mr-1">{percent}% ready</span>
        {chips.map(item => {
          const complete = itemComplete(item);
          const none = item.done === 0;
          const tone = complete ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            : none && item.level === 'required' ? 'bg-red-50 text-red-700 hover:bg-red-100'
              : 'bg-amber-50 text-amber-800 hover:bg-amber-100';
          const text = item.total === 1
            ? (complete ? item.label : item.todo ?? `No ${item.label.toLowerCase()}`)
            : `${item.label} ${item.done}/${item.total}`;
          return (
            <button key={item.key} onClick={() => onItem(item)} title={item.hint} className={`text-xs px-2 py-1 rounded-md transition-colors ${tone}`}>
              {text}
            </button>
          );
        })}
      </div>

      <nav className="flex gap-5 mt-3 overflow-x-auto -mx-1 px-1" aria-label="Course sections">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => onTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
            className={`pb-3 text-sm whitespace-nowrap border-b-2 transition-colors ${tab === t.id ? 'border-sky-600 text-sky-700 font-semibold' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
