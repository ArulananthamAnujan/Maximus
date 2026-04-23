import { useState } from 'react';
import { Plus, Trash2, Sparkles, Save, BookOpen, Loader2 } from 'lucide-react';
import { useGenerateFlashcards } from '../../hooks/useAI';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';
import AILoader from '../ui/AILoader';

interface Flashcard {
  id?: string;
  front: string;
  back: string;
  order_index: number;
  isNew?: boolean;
}

interface Props {
  lessonId: string;
  courseId: string;
  lessonContent: string;
  initialCards: Flashcard[];
  onUpdate: () => void;
}

export default function FlashcardsManager({ lessonId, courseId, lessonContent, initialCards, onUpdate }: Props) {
  const { profile } = useAuth();
  const generateMutation = useGenerateFlashcards(lessonId);

  const [cards, setCards] = useState<Flashcard[]>(initialCards);
  const [generating, setGenerating] = useState(false);
  const [numCards, setNumCards] = useState(8);
  const [saving, setSaving] = useState(false);

  const handleGenerate = async () => {
    if (!lessonContent.trim()) {
      toast.error('Add lesson content before generating flashcards');
      return;
    }
    setGenerating(true);
    try {
      const result = await generateMutation.mutateAsync({
        lesson_content: lessonContent.slice(0, 10000),
        num_cards: numCards,
      });
      const newCards: Flashcard[] = result.cards.map((c, i) => ({
        front: c.front,
        back: c.back,
        order_index: cards.length + i,
        isNew: true,
      }));
      setCards(prev => [...prev, ...newCards]);
    } finally {
      setGenerating(false);
    }
  };

  const addCard = () => {
    const newCard: Flashcard = {
      front: '',
      back: '',
      order_index: cards.length,
      isNew: true,
    };
    setCards(prev => [...prev, newCard]);
  };

  const updateCard = (i: number, patch: Partial<Flashcard>) =>
    setCards(prev => prev.map((c, j) => j === i ? { ...c, ...patch } : c));

  const deleteCard = async (i: number) => {
    const card = cards[i];
    if (card.id) {
      await supabase.from('flashcards').delete().eq('id', card.id);
    }
    setCards(prev => prev.filter((_, j) => j !== i).map((c, j) => ({ ...c, order_index: j })));
    onUpdate();
  };

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const toUpsert = cards.filter(c => c.isNew && c.front.trim() && c.back.trim());
      if (toUpsert.length === 0) {
        toast.info('No new cards to save');
        setSaving(false);
        return;
      }

      const { error } = await supabase.from('flashcards').insert(
        toUpsert.map((c) => ({
          lesson_id: lessonId,
          course_id: courseId,
          front: c.front,
          back: c.back,
          order_index: cards.findIndex(x => x === c),
          created_by: profile.id,
        }))
      );

      if (error) throw error;
      toast.success(`Saved ${toUpsert.length} flashcard${toUpsert.length !== 1 ? 's' : ''}`);
      onUpdate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save flashcards');
    } finally {
      setSaving(false);
    }
  };

  const hasUnsaved = cards.some(c => c.isNew && c.front.trim() && c.back.trim());

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={3}
            max={20}
            value={numCards}
            onChange={e => setNumCards(Number(e.target.value))}
            className="input-field text-sm py-1.5 w-16"
          />
          <span className="text-sm text-slate-500">cards</span>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating || !lessonContent.trim()}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {generating ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
          ) : (
            <><Sparkles className="w-4 h-4" /> Generate Flashcards from Lesson</>
          )}
        </button>
        <button
          onClick={addCard}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Card Manually
        </button>
        {hasUnsaved && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium btn-primary ml-auto"
          >
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><Save className="w-4 h-4" /> Save New Cards</>}
          </button>
        )}
      </div>

      {generating && <AILoader />}

      {/* Card list */}
      {cards.length === 0 && !generating && (
        <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-slate-200 rounded-xl">
          <BookOpen className="w-8 h-8 text-slate-300 mb-3" />
          <p className="text-sm font-medium text-slate-500">No flashcards yet</p>
          <p className="text-xs text-slate-400 mt-0.5">Generate from lesson content or add manually</p>
        </div>
      )}

      <div className="space-y-2.5">
        {cards.map((card, i) => (
          <div key={card.id || `new-${i}`} className={`border rounded-xl overflow-hidden transition-colors ${card.isNew ? 'border-sky-200 bg-sky-50/30' : 'border-slate-200'}`}>
            <div className="grid grid-cols-2 divide-x divide-slate-200">
              <div className="p-3">
                <div className="text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Front</div>
                <textarea
                  value={card.front}
                  onChange={e => updateCard(i, { front: e.target.value })}
                  className="w-full text-sm text-slate-800 bg-transparent border-0 focus:outline-none resize-none p-0 leading-relaxed"
                  rows={2}
                  placeholder="Question or term..."
                />
              </div>
              <div className="p-3">
                <div className="text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Back</div>
                <textarea
                  value={card.back}
                  onChange={e => updateCard(i, { back: e.target.value })}
                  className="w-full text-sm text-slate-700 bg-transparent border-0 focus:outline-none resize-none p-0 leading-relaxed"
                  rows={2}
                  placeholder="Answer or definition..."
                />
              </div>
            </div>
            <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50/60 border-t border-slate-100">
              <span className="text-xs text-slate-400">Card {i + 1}{card.isNew ? ' — unsaved' : ''}</span>
              <button onClick={() => deleteCard(i)} className="p-1 rounded text-slate-300 hover:text-red-500 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
