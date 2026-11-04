import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import t from '../i18n/ar';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const light = theme === 'light';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="btn-ghost !p-2.5"
      aria-label={light ? t.theme.switchToDark : t.theme.switchToLight}
      title={light ? t.theme.switchToDark : t.theme.switchToLight}
    >
      {light ? <Moon size={18} /> : <Sun size={18} />}
    </button>
  );
}
