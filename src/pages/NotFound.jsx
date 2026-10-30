/**
 * Not-found page (404).
 */
import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import t from '../i18n/ar';

export default function NotFound() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-ink-700 text-gold-400 flex items-center justify-center">
        <Compass size={30} />
      </div>
      <h1 className="text-2xl font-black">{t.errors.notFound}</h1>
      <p className="text-sm text-slate-400">{t.errors.notFoundBody}</p>
      <Link to="/" className="btn-gold mt-2">
        {t.errors.goHome}
      </Link>
    </div>
  );
}
