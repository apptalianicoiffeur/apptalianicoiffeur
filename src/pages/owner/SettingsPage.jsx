/**
 * Owner settings: shop info (name, phone, address) and the three WhatsApp
 * message templates with placeholders, live preview and "reset to default".
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import t from '../../i18n/ar';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { DEFAULT_COUNTRY_CODE, normalizePhone } from '../../utils/phone';
import { DEFAULT_TEMPLATES, TEMPLATE_KEYS, fillTemplate, templateVars } from '../../utils/whatsapp';
import { formatDateLong } from '../../utils/datetime';
import { Field, Spinner } from '../../components/ui';

const TAB_LABELS = {
  accept: t.owner.templateAccept,
  decline: t.owner.templateDecline,
  acceptModified: t.owner.templateAcceptModified,
  delay: t.owner.templateDelay,
};

const PLACEHOLDERS = [
  '{client_name}',
  '{service}',
  '{date}',
  '{time}',
  '{new_date}',
  '{new_time}',
  '{old_time}',
  '{shop_name}',
  '{price}',
];

/** A sample booking used for the live preview. */
const SAMPLE = {
  name: t.owner.sampleClient,
  serviceName: t.owner.sampleService,
  price: 800,
  date: '2026-01-15',
  scheduledStart: '14:00',
  proposedDate: '2026-01-16',
  proposedTime: '16:30',
  durationMinutes: 30,
};

export default function SettingsPage() {
  const { settings, templates, savePublic, saveTemplates } = useSettings();
  const { toast } = useToast();
  const [tab, setTab] = useState('accept');
  const [drafts, setDrafts] = useState(templates);
  const [shop, setShop] = useState({ shopName: '', phone: '', address: '' });
  const [busy, setBusy] = useState(false);
  const [savingTpl, setSavingTpl] = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => setDrafts(templates), [templates]);
  useEffect(
    () =>
      setShop({
        shopName: settings.shopName || '',
        phone: settings.phone || '',
        address: settings.address || '',
      }),
    [settings]
  );

  const previewVars = useMemo(
    () => ({
      ...templateVars(SAMPLE, { shopName: shop.shopName }),
      date: formatDateLong(SAMPLE.date),
      new_date: formatDateLong(SAMPLE.proposedDate),
    }),
    [shop.shopName]
  );

  const insertPlaceholder = (token) => {
    const el = textareaRef.current;
    const pos = el?.selectionStart ?? drafts[tab].length;
    const value = drafts[tab];
    const next = value.slice(0, pos) + token + value.slice(pos);
    setDrafts((d) => ({ ...d, [tab]: next }));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos + token.length, pos + token.length);
    });
  };

  const saveShop = async () => {
    setBusy(true);
    try {
      const phone = normalizePhone(shop.phone) || (shop.phone ? null : '');
      if (shop.phone && !phone) {
        toast(t.validation.phoneInvalid, 'error');
        return;
      }
      await savePublic({ shopName: shop.shopName.trim(), phone, address: shop.address.trim() });
      toast(t.app.saved);
    } catch {
      toast(t.errors.actionFailed, 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveTpl = async () => {
    setSavingTpl(true);
    try {
      await saveTemplates(drafts);
      toast(t.owner.templatesSaved);
    } catch {
      toast(t.errors.actionFailed, 'error');
    } finally {
      setSavingTpl(false);
    }
  };

  const resetTpl = () => {
    setDrafts((d) => ({ ...d, [tab]: DEFAULT_TEMPLATES[tab] }));
  };

  return (
    <div className="animate-fade-in max-w-2xl">
      <h1 className="text-xl sm:text-2xl font-black mb-5">{t.owner.settings}</h1>

      {/* Shop info */}
      <section className="card p-4 mb-5">
        <h2 className="section-title mb-4">{t.owner.shopInfo}</h2>
        <Field label={t.owner.shopName}>
          <input className="input" value={shop.shopName} onChange={(e) => setShop({ ...shop, shopName: e.target.value })} />
        </Field>
        <Field label={t.owner.shopPhone} hint={DEFAULT_COUNTRY_CODE}>
          <input
            className="input"
            dir="ltr"
            inputMode="tel"
            value={shop.phone}
            onChange={(e) => setShop({ ...shop, phone: e.target.value })}
          />
        </Field>
        <Field label={t.owner.shopAddress}>
          <input className="input" value={shop.address} onChange={(e) => setShop({ ...shop, address: e.target.value })} />
        </Field>
        <button className="btn-gold w-full" onClick={saveShop} disabled={busy}>
          {busy ? <Spinner size={16} /> : <Save size={16} />} {t.app.saveChanges}
        </button>
      </section>

      {/* WhatsApp templates */}
      <section className="card p-4">
        <h2 className="section-title mb-1">{t.owner.templates}</h2>
        <p className="text-[11px] text-slate-400 leading-relaxed mb-4">{t.owner.templatesHint}</p>

        <div className="flex gap-1.5 overflow-x-auto no-scrollbar mb-3">
          {TEMPLATE_KEYS.map((key) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`shrink-0 px-3 py-2 rounded-xl text-xs font-extrabold ${
                tab === key ? 'bg-gold-500/15 text-gold-300 border border-gold-500/40' : 'bg-ink-700 text-slate-400 border border-transparent'
              }`}
            >
              {TAB_LABELS[key]}
            </button>
          ))}
        </div>

        <textarea
          ref={textareaRef}
          className="input min-h-44 leading-relaxed"
          value={drafts[tab] || ''}
          onChange={(e) => setDrafts((d) => ({ ...d, [tab]: e.target.value }))}
        />

        <div className="flex flex-wrap gap-1.5 mt-3">
          <span className="text-[11px] text-slate-500 w-full mb-1">{t.owner.insertPlaceholder}:</span>
          {PLACEHOLDERS.map((p) => (
            <button
              key={p}
              onClick={() => insertPlaceholder(p)}
              className="px-2 py-1 rounded-lg bg-ink-700 border border-ink-500 text-[11px] font-bold text-gold-300 hover:border-gold-500/50"
              dir="ltr"
            >
              {p}
            </button>
          ))}
        </div>

        <div className="mt-4">
          <p className="text-xs font-bold text-slate-400 mb-2">{t.owner.preview}</p>
          <div className="bg-[#075E54]/20 border border-emerald-500/30 rounded-2xl p-3 text-xs leading-relaxed text-slate-200 whitespace-pre-wrap">
            {fillTemplate(drafts[tab] || '', previewVars)}
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button className="btn-outline flex-1" onClick={resetTpl}>
            <RotateCcw size={15} /> {t.owner.resetDefault}
          </button>
          <button className="btn-gold flex-1" onClick={saveTpl} disabled={savingTpl}>
            {savingTpl ? <Spinner size={15} /> : <Save size={15} />} {t.app.save}
          </button>
        </div>
      </section>
    </div>
  );
}
