import { useState } from 'react';
import { Sparkles, ChevronDown, X, Check } from 'lucide-react';
import { useRewriteContent, useTranslateContent, useGenerateLessonContent, useSummarizeLesson } from '../../hooks/useAI';

const LANGUAGES = [
  'English', 'Spanish', 'Hindi', 'Tamil', 'Sinhala',
  'French', 'German', 'Chinese', 'Arabic', 'Portuguese', 'Japanese',
];

const REWRITE_STYLES = [
  { value: 'simpler', label: 'Rewrite Simpler' },
  { value: 'more_detailed', label: 'Rewrite More Detailed' },
  { value: 'more_concise', label: 'Rewrite Shorter' },
  { value: 'more_engaging', label: 'Rewrite More Engaging' },
] as const;

interface PreviewModalProps {
  original: string;
  generated: string;
  onAccept: (content: string) => void;
  onDiscard: () => void;
  title: string;
}

function PreviewModal({ original, generated, onAccept, onDiscard, title }: PreviewModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onDiscard} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="w-8 h-8 bg-sky-100 rounded-xl flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-sky-600" />
          </div>
          <h3 className="font-bold text-slate-900">{title}</h3>
          <button onClick={onDiscard} className="ml-auto p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-hidden flex gap-0 min-h-0">
          <div className="flex-1 flex flex-col border-r border-slate-100 overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wide shrink-0">Current Content</div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="prose prose-sm max-w-none text-slate-600 text-sm leading-relaxed whitespace-pre-wrap"
                dangerouslySetInnerHTML={{ __html: original || '<em class="text-slate-400">No content yet</em>' }} />
            </div>
          </div>
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-4 py-2.5 bg-sky-50 border-b border-sky-100 text-xs font-semibold text-sky-700 uppercase tracking-wide shrink-0 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" /> AI Generated
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="prose prose-sm max-w-none text-slate-800 text-sm leading-relaxed"
                dangerouslySetInnerHTML={{ __html: generated }} />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
          <button onClick={onDiscard} className="px-4 py-2.5 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 font-medium">
            Discard
          </button>
          <button onClick={() => onAccept(generated)} className="btn-primary text-sm py-2.5 px-6 flex items-center gap-2">
            <Check className="w-4 h-4" /> Accept
          </button>
        </div>
      </div>
    </div>
  );
}

interface Props {
  lessonTitle: string;
  courseContext: string;
  targetAudience?: string;
  currentContent: string;
  onContentChange: (html: string) => void;
}

export default function AILessonToolbar({ lessonTitle, courseContext, currentContent, targetAudience = 'professionals', onContentChange }: Props) {
  const [showTranslate, setShowTranslate] = useState(false);
  const [preview, setPreview] = useState<{ title: string; content: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState('');

  const rewriteMutation = useRewriteContent();
  const translateMutation = useTranslateContent();
  const generateMutation = useGenerateLessonContent();
  const summarizeMutation = useSummarizeLesson();

  const withLoading = async (label: string, fn: () => Promise<void>) => {
    setLoading(true);
    setLoadingLabel(label);
    try { await fn(); } finally { setLoading(false); setLoadingLabel(''); }
  };

  const handleGenerate = () => withLoading('Generating full lesson...', async () => {
    const result = await generateMutation.mutateAsync({
      lesson_title: lessonTitle,
      course_context: courseContext,
      target_audience: targetAudience,
      desired_length: 'medium',
    });
    setPreview({ title: 'Generate Full Lesson', content: result.content_html });
  });

  const handleRewrite = (style: typeof REWRITE_STYLES[number]['value']) => withLoading('Rewriting...', async () => {
    const result = await rewriteMutation.mutateAsync({ content: currentContent, style });
    setPreview({ title: `Rewrite — ${REWRITE_STYLES.find(s => s.value === style)?.label}`, content: result.rewritten_content });
  });

  const handleTranslate = (lang: string) => {
    setShowTranslate(false);
    withLoading(`Translating to ${lang}...`, async () => {
      const result = await translateMutation.mutateAsync({ content: currentContent, target_language: lang });
      setPreview({ title: `Translate to ${lang}`, content: result.translated_content });
    });
  };

  const handleSummarize = () => withLoading('Summarizing...', async () => {
    const result = await summarizeMutation.mutateAsync({ lesson_content: currentContent });
    const html = `<h2>Summary</h2><p>${result.summary}</p><h3>Key Takeaways</h3><ul>${result.key_takeaways.map(t => `<li>${t}</li>`).join('')}</ul>`;
    setPreview({ title: 'AI Summary', content: html });
  });

  return (
    <>
      {/* Floating toolbar */}
      <div className="flex flex-wrap items-center gap-1.5 p-2 bg-white border border-slate-200 rounded-xl shadow-sm">
        <div className="flex items-center gap-1 shrink-0">
          <Sparkles className="w-3.5 h-3.5 text-sky-500" />
          <span className="text-xs font-bold text-sky-700 pr-1">AI Assist</span>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-sky-600 font-medium">
            <div className="w-3.5 h-3.5 border-2 border-sky-400 border-t-transparent rounded-full animate-spin shrink-0" />
            {loadingLabel}
          </div>
        ) : (
          <>
            <button onClick={handleGenerate} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg transition-colors whitespace-nowrap">
              <Sparkles className="w-3 h-3" /> Generate Full Lesson
            </button>

            {REWRITE_STYLES.map(style => (
              <button
                key={style.value}
                onClick={() => handleRewrite(style.value)}
                disabled={!currentContent.trim()}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Sparkles className="w-3 h-3 text-sky-400" /> {style.label}
              </button>
            ))}

            {/* Translate dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowTranslate(s => !s)}
                disabled={!currentContent.trim()}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Sparkles className="w-3 h-3 text-sky-400" /> Translate to...
                <ChevronDown className={`w-3 h-3 transition-transform ${showTranslate ? 'rotate-180' : ''}`} />
              </button>
              {showTranslate && (
                <div className="absolute top-full mt-1 left-0 z-20 bg-white border border-slate-200 rounded-xl shadow-lg p-1 min-w-[160px]">
                  {LANGUAGES.map(lang => (
                    <button key={lang} onClick={() => handleTranslate(lang)} className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-sky-50 hover:text-sky-700 rounded-lg transition-colors">
                      {lang}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={handleSummarize}
              disabled={!currentContent.trim()}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Sparkles className="w-3 h-3 text-sky-400" /> Summarize
            </button>
          </>
        )}
      </div>

      {/* Preview modal */}
      {preview && (
        <PreviewModal
          original={currentContent}
          generated={preview.content}
          title={preview.title}
          onAccept={(content) => { onContentChange(content); setPreview(null); }}
          onDiscard={() => setPreview(null)}
        />
      )}
    </>
  );
}
