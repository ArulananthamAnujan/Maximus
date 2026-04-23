import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

export default function DarkModeToggle({ className = '' }: { className?: string }) {
  const { isDark, toggle } = useTheme();

  return (
    <button
      onClick={toggle}
      className={`p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-navy-700 transition-colors ${className}`}
      aria-label="Toggle dark mode"
    >
      {isDark ? <Sun className="w-5 h-5 text-gold-400" /> : <Moon className="w-5 h-5" />}
    </button>
  );
}
