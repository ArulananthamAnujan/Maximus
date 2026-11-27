import { useEffect, useRef } from 'react';
import { Bold, Italic, Heading2, Heading3, List, ListOrdered, Code, Link as LinkIcon, Quote, Undo2, Redo2 } from 'lucide-react';
import { sanitizeHtml, safeUrl } from '../../lib/utils';

interface Props {
  /** Initial HTML. The editor keeps its own state after that; give it a new `key` to reset it. */
  value: string;
  onChange: (html: string) => void;
  label: string;
  minHeight?: number;
  compact?: boolean;
}

type Command = { icon: typeof Bold; label: string; run: () => void };

/**
 * A small formatting editor for teachers: headings, bold, italic, lists, quotes, code and
 * links. Output is sanitised HTML. Pasted text arrives as plain text, so formatting from
 * Word or web pages cannot bring hidden styles or scripts with it.
 */
export default function RichTextEditor({ value, onChange, label, minHeight = 260, compact = false }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (ref.current) ref.current.innerHTML = sanitizeHtml(value || '<p></p>');
    // Only on mount: re-setting innerHTML while typing would move the cursor
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = () => { if (ref.current) onChangeRef.current(sanitizeHtml(ref.current.innerHTML)); };
  const exec = (command: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    emit();
  };

  const commands: Command[] = [
    ...(!compact ? [
      { icon: Heading2, label: 'Heading', run: () => exec('formatBlock', 'h2') },
      { icon: Heading3, label: 'Subheading', run: () => exec('formatBlock', 'h3') },
    ] : []),
    { icon: Bold, label: 'Bold', run: () => exec('bold') },
    { icon: Italic, label: 'Italic', run: () => exec('italic') },
    { icon: List, label: 'Bulleted list', run: () => exec('insertUnorderedList') },
    { icon: ListOrdered, label: 'Numbered list', run: () => exec('insertOrderedList') },
    ...(!compact ? [{ icon: Quote, label: 'Quote', run: () => exec('formatBlock', 'blockquote') }] : []),
    { icon: Code, label: 'Code block', run: () => exec('formatBlock', 'pre') },
    {
      icon: LinkIcon, label: 'Link', run: () => {
        const url = safeUrl(window.prompt('Link address (https://…)') || '');
        if (url) exec('createLink', url);
      },
    },
    { icon: Undo2, label: 'Undo', run: () => exec('undo') },
    { icon: Redo2, label: 'Redo', run: () => exec('redo') },
  ];

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white focus-within:ring-2 focus-within:ring-sky-200 focus-within:border-sky-400">
      <div role="toolbar" aria-label={`${label} formatting`} className="flex flex-wrap gap-0.5 px-1.5 py-1 border-b border-slate-100 bg-slate-50">
        {commands.map(c => (
          <button
            key={c.label}
            type="button"
            title={c.label}
            aria-label={c.label}
            onMouseDown={e => e.preventDefault()}
            onClick={c.run}
            className="p-1.5 rounded-md text-slate-500 hover:bg-white hover:text-slate-800"
          >
            <c.icon className="w-3.5 h-3.5" />
          </button>
        ))}
      </div>
      <div
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        onPaste={e => {
          e.preventDefault();
          document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
          emit();
        }}
        style={{ minHeight }}
        className="prose prose-sm max-w-none px-4 py-3 outline-none text-slate-800 [&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-4 [&_h3]:text-sm [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:bg-slate-900 [&_pre]:text-slate-100 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:text-xs [&_pre]:overflow-x-auto [&_blockquote]:border-l-4 [&_blockquote]:border-slate-200 [&_blockquote]:pl-3 [&_a]:text-sky-700 [&_a]:underline"
      />
    </div>
  );
}
