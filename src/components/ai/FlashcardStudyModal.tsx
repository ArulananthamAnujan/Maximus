import { useState } from 'react';
import { X, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';

interface Flashcard {
  id: string;
  front: string;
  back: string;
}

interface Props {
  cards: Flashcard[];
  onClose: () => void;
}

export default function FlashcardStudyModal({ cards, onClose }: Props) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [completed, setCompleted] = useState<Set<number>>(new Set());

  const card = cards[index];
  const total = cards.length;

  const goNext = () => {
    setFlipped(false);
    setCompleted(prev => new Set([...prev, index]));
    setTimeout(() => setIndex(i => Math.min(i + 1, total - 1)), 150);
  };

  const goPrev = () => {
    setFlipped(false);
    setTimeout(() => setIndex(i => Math.max(i - 1, 0)), 150);
  };

  const restart = () => {
    setIndex(0);
    setFlipped(false);
    setCompleted(new Set());
  };

  const isLast = index === total - 1;
  const allDone = completed.size === total;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-900">Study Flashcards</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden w-32">
                <div
                  className="h-full bg-sky-500 rounded-full transition-all duration-300"
                  style={{ width: `${((index + (flipped ? 0.5 : 0)) / total) * 100}%` }}
                />
              </div>
              <span className="text-xs text-slate-500 font-medium">{index + 1} of {total}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Card */}
        <div className="p-8">
          {allDone && isLast && completed.has(total - 1) ? (
            <div className="flex flex-col items-center justify-center py-6 text-center gap-4">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                <span className="text-2xl">🎉</span>
              </div>
              <div>
                <p className="font-bold text-slate-800 text-lg">All done!</p>
                <p className="text-sm text-slate-500 mt-0.5">You reviewed all {total} flashcards</p>
              </div>
              <button onClick={restart} className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg transition-colors border border-sky-200">
                <RotateCcw className="w-4 h-4" /> Study Again
              </button>
            </div>
          ) : (
            <div
              onClick={() => setFlipped(f => !f)}
              className="cursor-pointer select-none"
              style={{ perspective: '1000px' }}
            >
              <div
                className="relative w-full"
                style={{
                  transformStyle: 'preserve-3d',
                  transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                  transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                  minHeight: '180px',
                }}
              >
                {/* Front */}
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-gradient-to-br from-sky-50 to-white border-2 border-sky-200 rounded-2xl"
                  style={{ backfaceVisibility: 'hidden' }}
                >
                  <span className="text-xs font-bold text-sky-400 uppercase tracking-widest mb-4">Question</span>
                  <p className="text-center text-slate-800 font-medium text-base leading-relaxed">{card.front}</p>
                  <p className="text-xs text-slate-400 mt-6">Click to reveal answer</p>
                </div>
                {/* Back */}
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-gradient-to-br from-green-50 to-white border-2 border-green-200 rounded-2xl"
                  style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                >
                  <span className="text-xs font-bold text-green-500 uppercase tracking-widest mb-4">Answer</span>
                  <p className="text-center text-slate-800 font-medium text-base leading-relaxed">{card.back}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        {!(allDone && isLast && completed.has(total - 1)) && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
            <button
              onClick={goPrev}
              disabled={index === 0}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" /> Previous
            </button>

            {!flipped && (
              <button
                onClick={() => setFlipped(true)}
                className="px-5 py-2 text-sm font-medium text-white bg-sky-500 hover:bg-sky-600 rounded-lg transition-colors"
              >
                Show Answer
              </button>
            )}

            {flipped && (
              <button
                onClick={goNext}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-sky-500 hover:bg-sky-600 rounded-lg transition-colors"
              >
                {isLast ? 'Finish' : 'Next'} <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
