import { useState } from 'react';
import { Sparkles, Send, FileText, Video, Presentation, Upload, ChevronRight } from 'lucide-react';
import { weekStatus, weekLessons, weekLecture, readiness } from '../../lib/workspace';
import type { Workspace } from '../../lib/workspace';

export interface AssistantActions {
  onBuildAll: () => void;
  onOpenPlanner: (opts?: { message?: string; upload?: boolean }) => void;
  onOpenStudio: (sectionIds?: string[]) => void;
  onOpenLectures: () => void;
  onOpenWeekQuiz: (section: { id: string; title: string }) => void;
  onDraftCapstone: () => void;
  onOpenSchedule: () => void;
  onDownloadCourse: () => void;
}

interface Suggestion { key: string; title: string; detail: string; run: () => void }

export default function AssistantPanel({ ws, ...a }: AssistantActions & { ws: Workspace }) {
  const [text, setText] = useState('');
  const { items } = readiness(ws);
  const suggestions: Suggestion[] = [];

  if (ws.sections.length === 0) {
    suggestions.push({ key: 'plan', title: 'Plan this course', detail: 'Talk it through: who it is for and what they should be able to do', run: () => a.onOpenPlanner() });
  }

  const weeksNeedingMaterials = ws.sections.filter(s => weekStatus(s, ws).issues.some(i => /notes|slides/.test(i)));
  const noQuizCount = ws.sections.filter(s => weekLessons(s, ws).length > 0 && !ws.quizzes.some(q => q.section_id === s.id)).length;
  const missingKinds = [weeksNeedingMaterials.length > 0, noQuizCount > 0, ws.sections.some(s => weekLessons(s, ws).length > 0 && weekLecture(s, ws).state === 'none')].filter(Boolean).length;
  if (ws.sections.length > 1 && (weeksNeedingMaterials.length > 1 || missingKinds > 1)) {
    suggestions.push({ key: 'build', title: 'Build the whole course in one go', detail: 'Notes, slides, quizzes, lectures and the capstone for every week', run: a.onBuildAll });
  } else if (weeksNeedingMaterials.length === 1) {
    const s = weeksNeedingMaterials[0];
    suggestions.push({ key: 'finish', title: `Finish "${s.title}"`, detail: weekStatus(s, ws).issues.filter(i => /notes|slides/.test(i)).join(', '), run: () => a.onOpenStudio([s.id]) });
  } else if (weeksNeedingMaterials.length > 1) {
    suggestions.push({ key: 'materials', title: 'Write the missing notes & slides', detail: `${weeksNeedingMaterials.length} weeks have lessons without them`, run: () => a.onOpenStudio(weeksNeedingMaterials.map(s => s.id)) });
  }

  const noQuiz = ws.sections.filter(s => weekLessons(s, ws).length > 0 && !ws.quizzes.some(q => q.section_id === s.id));
  if (noQuiz.length > 0) {
    suggestions.push({ key: 'quiz', title: `Add a quiz to "${noQuiz[0].title}"`, detail: noQuiz.length > 1 ? `${noQuiz.length} weeks have no quiz yet` : 'Check understanding before moving on', run: () => a.onOpenWeekQuiz({ id: noQuiz[0].id, title: noQuiz[0].title }) });
  }

  if (ws.sections.length > 0 && !ws.assignments.some(x => x.kind === 'capstone')) {
    suggestions.push({ key: 'capstone', title: 'Draft the capstone project', detail: 'Brief, deliverables and marking rubric', run: a.onDraftCapstone });
  }

  if (ws.sections.length > 0 && !ws.course.start_date) {
    suggestions.push({ key: 'schedule', title: 'Set the schedule', detail: 'Start date, when each week opens, due dates', run: a.onOpenSchedule });
  }

  const guides = items.find(i => i.key === 'guides');
  if (guides && guides.total > 0 && guides.done < guides.total && weeksNeedingMaterials.length === 0) {
    suggestions.push({ key: 'guides', title: 'Teacher guides for live classes', detail: `${guides.total - guides.done} lessons have no session plan`, run: () => a.onOpenStudio() });
  }

  if (ws.sections.length > 0) {
    suggestions.push({ key: 'more', title: 'Plan more weeks', detail: ws.plan?.brief ? 'Continues from this course\'s plan' : 'Add weeks that build on what is here', run: () => a.onOpenPlanner() });
  }

  const weeksWithLecture = ws.sections.filter(s => weekLecture(s, ws).state === 'ready').length;
  const hasSlides = Array.from(ws.materials.values()).some(m => m.slides);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const message = text.trim();
    a.onOpenPlanner(message ? { message } : undefined);
    setText('');
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-sky-600" />
          <h2 className="font-semibold text-sm text-slate-900">AI course assistant</h2>
        </div>
        <div className="p-4 space-y-2.5">
          {suggestions.length > 0 && <p className="text-xs text-slate-500">Suggested next steps</p>}
          {suggestions.slice(0, 4).map(s => (
            <button key={s.key} onClick={s.run} className="w-full flex items-center gap-2 text-left border border-slate-200 rounded-lg px-3 py-2.5 hover:border-sky-300 hover:bg-sky-50/50 transition-colors">
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-slate-800">{s.title}</span>
                <span className="block text-xs text-slate-500">{s.detail}</span>
              </span>
              <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
            </button>
          ))}
          <form onSubmit={submit} className="flex gap-2 pt-1">
            <label htmlFor="assistant-ask" className="sr-only">Ask the course planner</label>
            <input id="assistant-ask" value={text} onChange={e => setText(e.target.value)} placeholder="Ask to add or change weeks…" className="input-field text-sm flex-1" />
            <button type="submit" aria-label="Open the planner" className="w-10 shrink-0 rounded-lg bg-sky-600 hover:bg-sky-700 text-white flex items-center justify-center"><Send className="w-4 h-4" /></button>
          </form>
          <button onClick={() => a.onOpenPlanner({ upload: true })} className="flex items-center gap-1.5 text-xs font-semibold text-sky-700 hover:underline">
            <Upload className="w-3.5 h-3.5" /> Build from my own material (PDF, Word, PowerPoint)
          </button>
        </div>
      </div>

      {ws.sections.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Whole course</p>
          <button onClick={a.onBuildAll} className="w-full flex items-center gap-2 text-left text-sm font-semibold text-sky-700 hover:text-sky-800 py-1.5">
            <Sparkles className="w-4 h-4" /> Build everything that is missing
          </button>
          <button onClick={() => a.onOpenStudio()} className="w-full flex items-center gap-2 text-left text-sm text-slate-700 hover:text-sky-700 py-1.5">
            <FileText className="w-4 h-4 text-blue-500" /> Notes, slides &amp; teacher guides
          </button>
          <button onClick={a.onOpenLectures} className="w-full flex items-center gap-2 text-left text-sm text-slate-700 hover:text-sky-700 py-1.5">
            <Video className="w-4 h-4 text-sky-500" /> Weekly AI lectures <span className="text-xs text-slate-400 ml-auto">{weeksWithLecture}/{ws.sections.length}</span>
          </button>
          <button onClick={a.onDownloadCourse} disabled={!hasSlides} className="w-full flex items-center gap-2 text-left text-sm text-slate-700 hover:text-sky-700 py-1.5 disabled:opacity-40 disabled:hover:text-slate-700">
            <Presentation className="w-4 h-4 text-slate-500" /> Download course as PowerPoint
          </button>
        </div>
      )}
    </div>
  );
}
