import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';

const MESSAGES = [
  'AI is thinking...',
  'Crafting content...',
  'Generating questions...',
  'Finalizing...',
];

export default function AILoader({ label }: { label?: string }) {
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setMsgIdx(i => (i + 1) % MESSAGES.length);
    }, 2500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-32 gap-4 select-none">
      <div className="relative">
        <div className="w-12 h-12 rounded-full bg-sky-100 flex items-center justify-center">
          <Sparkles className="w-6 h-6 text-sky-500 animate-pulse" />
        </div>
        <div className="absolute inset-0 rounded-full border-4 border-sky-300 border-t-transparent animate-spin" />
      </div>
      <p className="text-sm font-medium text-slate-600 transition-all duration-300 min-h-[20px]">
        {label || MESSAGES[msgIdx]}
      </p>
    </div>
  );
}
