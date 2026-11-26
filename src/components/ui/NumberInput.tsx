import { useEffect, useRef, useState } from 'react';

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min' | 'max'> & {
  value: number | '' | null | undefined;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
};

/**
 * Number field that is comfortable to type in.
 *
 * A plain controlled <input type="number"> bound to a number cannot be emptied: clearing it
 * snaps back to 0, so typing "12" produces "012". This keeps what the user is typing as text
 * while the field has focus, reports each valid number as they type, and only tidies the
 * value (empty -> minimum, out of range -> nearest limit) when they leave the field.
 */
export default function NumberInput({ value, onChange, min, max, onBlur, onFocus, ...rest }: Props) {
  const asText = (v: Props['value']) => (v === '' || v === null || v === undefined || Number.isNaN(v) ? '' : String(v));
  const [text, setText] = useState(asText(value));
  const focused = useRef(false);

  // Follow outside changes (form reset, loaded data) when the user is not typing here
  useEffect(() => {
    if (!focused.current) setText(asText(value));
  }, [value]);

  const clamp = (n: number) => {
    let out = n;
    if (min !== undefined && out < min) out = min;
    if (max !== undefined && out > max) out = max;
    return out;
  };

  return (
    <input
      {...rest}
      type="number"
      inputMode={rest.inputMode ?? 'decimal'}
      min={min}
      max={max}
      value={text}
      onFocus={e => { focused.current = true; onFocus?.(e); }}
      onChange={e => {
        const raw = e.target.value;
        setText(raw);
        if (raw.trim() !== '' && Number.isFinite(Number(raw))) onChange(Number(raw));
      }}
      onBlur={e => {
        focused.current = false;
        const parsed = text.trim() === '' || !Number.isFinite(Number(text)) ? (min ?? 0) : Number(text);
        const final = clamp(parsed);
        setText(String(final));
        if (final !== value) onChange(final);
        onBlur?.(e);
      }}
    />
  );
}
