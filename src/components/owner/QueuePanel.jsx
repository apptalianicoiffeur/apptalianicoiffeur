/**
 * Live session management (smart queue).
 *
 * - Bookings are ordered by time; each row shows the booked vs expected time.
 * - "Start session" / "End session" record the ACTUAL times.
 * - Ending early opens a gap: pull the next client forward (with the barber's
 *   explicit approval) or insert a walk-in into the free time.
 * - Ending late cascades a delay onto every following appointment; the
 *   affected clients are notified in-app + by push, and a ready WhatsApp
 *   message is offered for each of them.
 */
import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, Loader2, MessageCircle, PhoneCall, Play, Plus, Timer, Users, X } from 'lucide-react';
import t from '../../i18n/ar';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { STATUS } from '../../utils/constants';
import { minToTime, nowMinutes, timeToMin, formatTimeRange } from '../../utils/datetime';
import { cascadeShift, delayMinutes, gapMinutes, pullForwardAmount, todaysQueue } from '../../utils/queue';
import {
  ownerApplyShift,
  ownerCreateWalkIn,
  ownerEndSession,
  ownerPullForward,
  ownerStartSession,
} from '../../services/bookingActions';
import { fillTemplate, telLink } from '../../utils/whatsapp';
import { EmptyState, StatusChip } from '../ui';
import RequestActions, { WhatsAppButton } from './RequestActions';
import { WalkInModal } from './modals';

/** Live elapsed-time chip for the session in progress. */
function Elapsed({ since }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((x) => x + 1), 30000);
    return () => clearInterval(id);
  }, []);
  const mins = Math.max(0, nowMinutes() - timeToMin(since));
  return (
    <span className="text-xs font-bold text-gold-300 flex items-center gap-1">
      <Timer size={13} /> {t.owner.elapsed} {mins} {t.app.minutes}
    </span>
  );
}

export default function QueuePanel({ date, bookings, services, onChanged }) {
  const { settings } = useSettings();
  const { toast } = useToast();
  const [busyId, setBusyId] = useState(null);
  const [result, setResult] = useState(null); // { type: 'gap' | 'delay', ... }
  const [walkIn, setWalkIn] = useState(null); // prefill time for the walk-in modal

  const queue = useMemo(() => todaysQueue(bookings, date), [bookings, date]);
  const current = queue.find((b) => b.status === STATUS.IN_PROGRESS);

  const guard = async (id, fn) => {
    setBusyId(id);
    try {
      await fn();
    } catch {
      toast(t.errors.actionFailed, 'error');
    } finally {
      setBusyId(null);
    }
  };

  /** End the running session and compute the resulting gap / delay. */
  const endSession = (booking) =>
    guard(booking.id, async () => {
      const idx = queue.findIndex((b) => b.id === booking.id);
      const actualEndMin = nowMinutes();
      await ownerEndSession(booking);

      const gap = gapMinutes(booking, actualEndMin);
      const delay = delayMinutes(booking, actualEndMin);

      if (delay > 0) {
        const changes = cascadeShift(queue, idx, delay);
        if (changes.length) {
          await ownerApplyShift(changes, settings);
          toast(fillTemplate(t.owner.shiftApplied, { count: changes.length }), 'info');
        } else {
          toast(t.owner.shiftNoClients, 'info');
        }
        setResult({ type: 'delay', delay, ended: booking, changes });
      } else if (gap > 0) {
        setResult({ type: 'gap', gap, ended: booking, index: idx });
      }
      onChanged?.();
    });

  /** Pull the next client forward into the free gap (explicit approval). */
  const pullForward = () =>
    guard(result?.ended?.id, async () => {
      const amount = pullForwardAmount(queue, result.index, result.gap);
      const next = queue[result.index + 1];
      if (!amount || !next) return;
      const newStart = minToTime(timeToMin(next.expectedStart) - amount);
      await ownerPullForward(next, newStart, settings);
      toast(fillTemplate(t.owner.pulledForward, { name: next.name, time: newStart }));
      setResult((r) => ({ ...r, resolved: true }));
      onChanged?.();
    });

  const nextStartPreview =
    result?.type === 'gap'
      ? minToTime(timeToMin(queue[result.index + 1]?.expectedStart || '00:00') - pullForwardAmount(queue, result.index, result.gap))
      : '';

  if (queue.length === 0) {
    return (
      <EmptyState icon={Users} title={t.owner.queueEmpty} body={t.owner.queueHint} />
    );
  }

  return (
    <div>
      {/* ---------------- Gap / delay result banner ---------------- */}
      {result && !result.resolved && (
        <div
          className={`card p-4 mb-3 animate-fade-up border ${
            result.type === 'gap' ? 'border-emerald-500/40' : 'border-amber-500/40'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-extrabold text-sm">
                {result.type === 'gap'
                  ? `${t.owner.gapDetected} ${result.gap} ${t.owner.gapMinutes}`
                  : `${t.owner.delayDetected} ${result.delay} ${t.owner.gapMinutes}`}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {result.type === 'gap'
                  ? fillTemplate(t.owner.pullForwardHint, { time: nextStartPreview })
                  : t.owner.reviewShift}
              </p>
            </div>
            <button
              className="p-1.5 text-slate-400 hover:text-white"
              onClick={() => setResult(null)}
              aria-label={t.app.close}
            >
              <X size={16} />
            </button>
          </div>

          {result.type === 'gap' && (
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                className="btn-outline btn-sm"
                disabled={!queue[result.index + 1] || pullForwardAmount(queue, result.index, result.gap) === 0}
                onClick={pullForward}
              >
                <Play size={13} /> {t.owner.pullForward}
              </button>
              <button
                className="btn-gold btn-sm"
                onClick={() => setWalkIn(result.ended?.actualEnd || minToTime(nowMinutes()))}
              >
                <Plus size={14} /> {t.owner.insertWalkIn}
              </button>
              <button className="btn-ghost btn-sm" onClick={() => setResult(null)}>
                {t.owner.ignoreGap}
              </button>
            </div>
          )}

          {result.type === 'delay' && result.changes?.length > 0 && (
            <div className="mt-3 space-y-2">
              {result.changes.map((c) => (
                <div
                  key={c.booking.id}
                  className="flex items-center justify-between gap-2 bg-ink-700/60 rounded-xl px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold truncate">{c.booking.name}</p>
                    <p className="text-[11px] text-slate-400">
                      {c.booking.scheduledStart} ← <span className="text-gold-300 font-bold">{c.newStart}</span>
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <WhatsAppButton
                      booking={c.booking}
                      templateKey="delay"
                      extraVars={{ new_time: c.newStart, old_time: c.booking.expectedStart }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---------------- Queue rows ---------------- */}
      <div className="space-y-2.5">
        {queue.map((b, idx) => {
          // Free time between the previous appointment's end and this one.
          const prevEnd =
            idx === 0
              ? null
              : queue
                  .slice(0, idx)
                  .reduce((max, x) => Math.max(max, timeToMin(x.expectedEnd || x.scheduledEnd)), -1);
          const gapBefore = prevEnd !== null ? timeToMin(b.expectedStart) - prevEnd : 0;
          const shifted = b.expectedStart !== b.scheduledStart;
          const isCurrent = b.status === STATUS.IN_PROGRESS;

          return (
            <div key={b.id}>
              {gapBefore > 0 && (
                <div className="flex items-center gap-2 py-1 px-2">
                  <span className="flex-1 border-t border-dashed border-emerald-500/40" />
                  <span className="text-[10px] font-bold text-emerald-400">
                    {gapBefore} {t.app.minutes} {t.owner.legendFree}
                  </span>
                  <span className="flex-1 border-t border-dashed border-emerald-500/40" />
                </div>
              )}

              <div
                className={`card p-4 ${
                  isCurrent ? 'border-gold-500/60 shadow-glow' : ''
                } ${b.status === STATUS.PENDING ? 'border-r-2 border-r-amber-400/70' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <div className="text-center shrink-0 w-16">
                    <p className="text-lg font-black text-gold-300 leading-none">{b.expectedStart}</p>
                    {shifted && (
                      <p className="text-[10px] text-slate-500 line-through mt-1">{b.scheduledStart}</p>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-extrabold truncate">{b.name}</p>
                      <StatusChip status={b.status} />
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">
                      {b.serviceName} · {b.durationMinutes} {t.app.minutes} · {formatTimeRange(b.expectedStart, b.expectedEnd)}
                      {b.source === 'walk_in' ? ` · ${t.owner.walkInTitle}` : ''}
                    </p>
                    {b.status === STATUS.IN_PROGRESS && <div className="mt-1"><Elapsed since={b.actualStart || b.expectedStart} /></div>}
                    {b.clientProposedDate && b.status === STATUS.PENDING && (
                      <p className="text-[11px] text-sky-300 mt-1 font-bold">
                        {t.myBookings.yourProposal}: {b.clientProposedDate} — {b.clientProposedTime}
                      </p>
                    )}
                  </div>
                </div>

                {/* Row actions */}
                <div className="mt-3">
                  {b.status === STATUS.PENDING && (
                    <RequestActions booking={b} onChanged={onChanged} />
                  )}

                  {[STATUS.ACCEPTED, STATUS.ACCEPTED_MODIFIED].includes(b.status) && (
                    <div className="flex flex-wrap gap-2 items-center">
                      <button
                        className="btn-gold btn-sm"
                        disabled={busyId === b.id || Boolean(current)}
                        onClick={() =>
                          guard(b.id, async () => {
                            await ownerStartSession(b);
                            toast(fillTemplate(t.owner.sessionStarted, { name: b.name }));
                            onChanged?.();
                          })
                        }
                        title={current ? t.owner.currentClient : undefined}
                      >
                        {busyId === b.id ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                        {t.owner.startSession}
                      </button>
                      <WhatsAppButton
                        booking={b}
                        templateKey={b.status === STATUS.ACCEPTED_MODIFIED ? 'acceptModified' : 'accept'}
                      />
                      {telLink(b.phone) && (
                        <a className="btn-ghost btn-sm" href={telLink(b.phone)}>
                          <PhoneCall size={13} /> {t.owner.call}
                        </a>
                      )}
                    </div>
                  )}

                  {isCurrent && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="btn-outline btn-sm !border-emerald-500/60 !text-emerald-300"
                        disabled={busyId === b.id}
                        onClick={() => endSession(b)}
                      >
                        {busyId === b.id ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                        {t.owner.endSession}
                      </button>
                      <WhatsAppButton booking={b} templateKey="accept" />
                    </div>
                  )}

                  {b.status === STATUS.COMPLETED && b.actualEnd && (
                    <p className="text-[11px] text-slate-500">
                      {b.actualStart} - {b.actualEnd} (
                      {Math.max(0, timeToMin(b.actualEnd) - timeToMin(b.actualStart))} {t.app.minutes})
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <WalkInModal
        open={Boolean(walkIn)}
        onClose={() => setWalkIn(null)}
        date={date}
        services={services}
        settings={settings}
        prefillTime={walkIn}
        onConfirm={async ({ name, phone, service, time }) => {
          await guard('walkin', async () => {
            await ownerCreateWalkIn(
              {
                name,
                phone,
                serviceId: service.id,
                serviceName: service.name,
                price: Number(service.price) || 0,
                durationMinutes: Number(service.estimatedMinutes) || 30,
                date,
                time,
              },
              settings
            );
            toast(t.owner.manualCreated);
            setWalkIn(null);
            setResult(null);
            onChanged?.();
          });
        }}
      />
    </div>
  );
}

/** Small header used above the queue. */
export function QueueHeader({ bookings, date }) {
  const queue = todaysQueue(bookings, date);
  const pending = queue.filter((b) => b.status === STATUS.PENDING).length;
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="section-title">
        <Users size={17} className="text-gold-400" />
        {t.owner.queue}
        <span className="text-xs font-bold text-slate-400">({queue.length})</span>
      </h2>
      {pending > 0 && (
        <span className="chip bg-amber-500/15 text-amber-300 border border-amber-500/30">
          {pending} {t.owner.pendingCount}
        </span>
      )}
    </div>
  );
}
