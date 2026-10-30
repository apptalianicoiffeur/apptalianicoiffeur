/**
 * Working hours & availability: weekly hours, breaks, weekly days off,
 * specific days off, blocked slots, slot interval, max advance booking and
 * minimum lead time. Only these rules define what clients can book.
 */
import { useEffect, useRef, useState } from 'react';
import { Coffee, Lock, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import t from '../../i18n/ar';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { minToTime, todayISO, WEEKDAY_NAMES } from '../../utils/datetime';
import { Field, FullSpinner, Spinner, Toggle } from '../../components/ui';

/** All 15-minute time options from 06:00 to 23:45. */
const TIME_OPTIONS = (() => {
  const out = [];
  for (let m = 6 * 60; m <= 23 * 60 + 45; m += 15) out.push(minToTime(m));
  return out;
})();

/** Show Saturday first (local convention). */
const DAY_ORDER = [6, 0, 1, 2, 3, 4, 5];

function TimeSelect({ value, onChange }) {
  return (
    <select className="input py-2 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
      {TIME_OPTIONS.map((x) => (
        <option key={x} value={x}>
          {x}
        </option>
      ))}
    </select>
  );
}

/** Build an editable draft copy of the schedule settings. */
function buildDraft(settings) {
  return {
    weeklyHours: JSON.parse(JSON.stringify(settings.weeklyHours || {})),
    breaks: JSON.parse(JSON.stringify(settings.breaks || {})),
    daysOff: [...(settings.daysOff || [])],
    blockedSlots: [...(settings.blockedSlots || [])],
    slotInterval: settings.slotInterval || 30,
    maxAdvanceDays: settings.maxAdvanceDays || 14,
    minLeadMinutes: settings.minLeadMinutes ?? 30,
  };
}

export default function HoursPage() {
  const { settings, loading, savePublic } = useSettings();
  const { toast } = useToast();
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [newDayOff, setNewDayOff] = useState('');
  const [block, setBlock] = useState({ date: todayISO(), start: '10:00', end: '11:00', reason: '' });
  const initedRef = useRef(false);

  // Initialize the draft ONCE when the real settings arrive: any later
  // settings snapshot (open/closed toggle from the dashboard, ownerUid write...)
  // must not discard what the owner is still editing here.
  useEffect(() => {
    if (loading || initedRef.current) return;
    initedRef.current = true;
    setDraft(buildDraft(settings));
  }, [settings, loading]);

  if (!draft) return <FullSpinner />;

  const setDay = (idx, key, value) =>
    setDraft((d) => ({
      ...d,
      weeklyHours: {
        ...d.weeklyHours,
        [idx]: { ...(d.weeklyHours[idx] || { closed: true, open: '09:00', close: '19:00' }), [key]: value },
      },
    }));

  const setBreak = (idx, i, key, value) =>
    setDraft((d) => {
      const list = [...(d.breaks[idx] || [])];
      list[i] = { ...list[i], [key]: value };
      return { ...d, breaks: { ...d.breaks, [idx]: list } };
    });

  const addBreak = (idx) =>
    setDraft((d) => ({
      ...d,
      breaks: { ...d.breaks, [idx]: [...(d.breaks[idx] || []), { start: '13:00', end: '14:00' }] },
    }));

  const removeBreak = (idx, i) =>
    setDraft((d) => {
      const list = (d.breaks[idx] || []).filter((_, x) => x !== i);
      return { ...d, breaks: { ...d.breaks, [idx]: list } };
    });

  const addDayOff = () => {
    if (!newDayOff || draft.daysOff.includes(newDayOff)) return;
    setDraft((d) => ({ ...d, daysOff: [...d.daysOff, newDayOff].sort() }));
    setNewDayOff('');
  };

  const addBlock = () => {
    if (!block.date || !block.start || !block.end) return;
    setDraft((d) => ({
      ...d,
      blockedSlots: [...d.blockedSlots, { ...block, reason: block.reason.trim() }].sort((a, b) =>
        a.date.localeCompare(b.date)
      ),
    }));
    setBlock({ date: todayISO(), start: '10:00', end: '11:00', reason: '' });
  };

  const save = async () => {
    setBusy(true);
    try {
      await savePublic({
        weeklyHours: draft.weeklyHours,
        breaks: draft.breaks,
        daysOff: draft.daysOff,
        blockedSlots: draft.blockedSlots,
        slotInterval: Number(draft.slotInterval) || 30,
        maxAdvanceDays: Number(draft.maxAdvanceDays) || 14,
        minLeadMinutes: Number(draft.minLeadMinutes) || 0,
      });
      toast(t.owner.hoursSaved);
    } catch {
      toast(t.errors.actionFailed, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="animate-fade-in max-w-2xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl sm:text-2xl font-black">{t.owner.hours}</h1>
        <div className="flex gap-2">
          <button
            className="btn-outline btn-sm"
            onClick={() => setDraft(buildDraft(settings))}
            disabled={busy}
          >
            <RotateCcw size={14} /> {t.app.reset}
          </button>
          <button className="btn-gold btn-sm" onClick={save} disabled={busy}>
            {busy ? <Spinner size={14} /> : <Save size={14} />} {t.app.saveChanges}
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-400 mb-5">{t.owner.weeklyHoursHint}</p>

      {/* Weekly hours */}
      <section className="card p-4 mb-4 space-y-3">
        <h2 className="section-title">{t.owner.weeklyHours}</h2>
        {DAY_ORDER.map((idx) => {
          const day = draft.weeklyHours[idx] || { closed: true, open: '09:00', close: '19:00' };
          const breaks = draft.breaks[idx] || [];
          return (
            <div key={idx} className="bg-ink-700/50 rounded-2xl p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-extrabold">{WEEKDAY_NAMES[idx]}</span>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-bold ${day.closed ? 'text-slate-500' : 'text-emerald-300'}`}>
                    {day.closed ? t.owner.dayOff : t.owner.workDay}
                  </span>
                  <Toggle
                    checked={!day.closed}
                    onChange={(v) => setDay(idx, 'closed', !v)}
                    ariaLabel={WEEKDAY_NAMES[idx]}
                  />
                </div>
              </div>

              {!day.closed && (
                <>
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <div>
                      <p className="text-[11px] text-slate-400 mb-1">{t.owner.opensAt}</p>
                      <TimeSelect value={day.open} onChange={(v) => setDay(idx, 'open', v)} />
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-400 mb-1">{t.owner.closesAt}</p>
                      <TimeSelect value={day.close} onChange={(v) => setDay(idx, 'close', v)} />
                    </div>
                  </div>

                  <div className="mt-3">
                    <p className="text-[11px] text-slate-400 mb-1.5 flex items-center gap-1">
                      <Coffee size={12} /> {t.owner.breaks}
                    </p>
                    {breaks.map((br, i) => (
                      <div key={i} className="flex items-center gap-2 mb-2">
                        <TimeSelect value={br.start} onChange={(v) => setBreak(idx, i, 'start', v)} />
                        <span className="text-slate-500">-</span>
                        <TimeSelect value={br.end} onChange={(v) => setBreak(idx, i, 'end', v)} />
                        <button
                          className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg shrink-0"
                          onClick={() => removeBreak(idx, i)}
                          aria-label={t.app.delete}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                    <button className="btn-ghost btn-sm" onClick={() => addBreak(idx)}>
                      <Plus size={13} /> {t.owner.addBreak}
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </section>

      {/* Specific days off */}
      <section className="card p-4 mb-4">
        <h2 className="section-title mb-3">{t.owner.specificDaysOff}</h2>
        <div className="flex gap-2 mb-3">
          <input
            type="date"
            className="input flex-1"
            value={newDayOff}
            onChange={(e) => setNewDayOff(e.target.value)}
          />
          <button className="btn-outline btn-sm" onClick={addDayOff}>
            <Plus size={14} /> {t.owner.addDayOff}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {draft.daysOff.length === 0 && <p className="text-xs text-slate-500">—</p>}
          {draft.daysOff.map((d) => (
            <span key={d} className="chip bg-ink-700 text-slate-300 border border-ink-500">
              {d}
              <button
                className="text-red-400 hover:text-red-300"
                onClick={() => setDraft((x) => ({ ...x, daysOff: x.daysOff.filter((y) => y !== d) }))}
                aria-label={t.app.delete}
              >
                <Trash2 size={12} />
              </button>
            </span>
          ))}
        </div>
      </section>

      {/* Blocked slots */}
      <section className="card p-4 mb-4">
        <h2 className="section-title mb-1">
          <Lock size={16} className="text-gold-400" />
          {t.owner.blockedSlots}
        </h2>
        <p className="text-[11px] text-slate-500 mb-3">{t.owner.blockedHint}</p>

        <div className="bg-ink-700/50 rounded-2xl p-3 mb-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[11px] text-slate-400 mb-1">{t.owner.blockDate}</p>
              <input
                type="date"
                className="input py-2 text-sm"
                value={block.date}
                onChange={(e) => setBlock({ ...block, date: e.target.value })}
              />
            </div>
            <div>
              <p className="text-[11px] text-slate-400 mb-1">{t.owner.blockReason}</p>
              <input
                className="input py-2 text-sm"
                placeholder={t.app.optional}
                value={block.reason}
                onChange={(e) => setBlock({ ...block, reason: e.target.value })}
              />
            </div>
            <div>
              <p className="text-[11px] text-slate-400 mb-1">{t.owner.blockStart}</p>
              <TimeSelect value={block.start} onChange={(v) => setBlock({ ...block, start: v })} />
            </div>
            <div>
              <p className="text-[11px] text-slate-400 mb-1">{t.owner.blockEnd}</p>
              <TimeSelect value={block.end} onChange={(v) => setBlock({ ...block, end: v })} />
            </div>
          </div>
          <button className="btn-outline btn-sm w-full" onClick={addBlock}>
            <Plus size={14} /> {t.owner.addBlocked}
          </button>
        </div>

        {draft.blockedSlots.length === 0 ? (
          <p className="text-xs text-slate-500">—</p>
        ) : (
          <div className="space-y-2">
            {draft.blockedSlots.map((b, i) => (
              <div
                key={`${b.date}${b.start}${i}`}
                className="flex items-center justify-between bg-ink-700/60 rounded-xl px-3 py-2"
              >
                <div className="text-xs">
                  <span className="font-bold">{b.date}</span>
                  <span className="text-slate-400"> · {b.start} - {b.end}</span>
                  {b.reason && <span className="text-slate-500"> · {b.reason}</span>}
                </div>
                <button
                  className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg"
                  onClick={() =>
                    setDraft((x) => ({ ...x, blockedSlots: x.blockedSlots.filter((_, y) => y !== i) }))
                  }
                  aria-label={t.app.delete}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Booking rules */}
      <section className="card p-4">
        <h2 className="section-title mb-3">{t.owner.calendar}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label={t.owner.slotInterval}>
            <select
              className="input"
              value={draft.slotInterval}
              onChange={(e) => setDraft({ ...draft, slotInterval: Number(e.target.value) })}
            >
              {[15, 20, 30, 45, 60].map((x) => (
                <option key={x} value={x}>
                  {x} {t.app.minutes}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t.owner.maxAdvance}>
            <input
              className="input"
              inputMode="numeric"
              value={draft.maxAdvanceDays}
              onChange={(e) => setDraft({ ...draft, maxAdvanceDays: e.target.value })}
            />
          </Field>
          <Field label={t.owner.minLead}>
            <input
              className="input"
              inputMode="numeric"
              value={draft.minLeadMinutes}
              onChange={(e) => setDraft({ ...draft, minLeadMinutes: e.target.value })}
            />
          </Field>
        </div>
      </section>

      <button className="btn-gold w-full mt-4" onClick={save} disabled={busy}>
        {busy ? <Spinner size={16} /> : <Save size={16} />} {t.app.saveChanges}
      </button>
    </div>
  );
}
