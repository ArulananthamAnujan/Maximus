interface ProgressBarProps {
  value: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

export default function ProgressBar({ value, max = 100, size = 'md', showLabel = false, className = '' }: ProgressBarProps) {
  const percent = Math.min(Math.max(0, (value / max) * 100), 100);

  const heights = { sm: 'h-1.5', md: 'h-2.5', lg: 'h-4' };

  return (
    <div className={`w-full ${className}`}>
      <div className={`w-full bg-gray-200 dark:bg-navy-600 rounded-full overflow-hidden ${heights[size]}`}>
        <div
          className="h-full bg-gradient-to-r from-gold-500 to-gold-400 rounded-full transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      {showLabel && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 text-right">{Math.round(percent)}%</p>
      )}
    </div>
  );
}
