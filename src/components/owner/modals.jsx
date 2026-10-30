/**
 * Owner modals: accept-with-modified-time, decline, and quick walk-in booking.
 */
import { useEffect, useMemo, useState } from 'react';
import { collection, query, where } from 'firebase/firestore';
import t from '../../i18n/ar';
import { db, COLLECTIONS } from '../../services/bootstrap';
import { useCollection } from '../../hooks/useCollection';
import { formatDateLong, todayISO } from '../../utils/datetime';
import { normalizePhone, DEFAULT_COUNTRY_CODE } from '../../utils/phone';
import { generateSlots } from '../../utils/slots';
import { fillTemplate, templateVars } from '../../utils/whatsapp';
import DateStrip from '../DateStrip';
import TimeSlotGrid from '../TimeSlotGrid';
import { Field, Modal, Spinner } from '../ui';
import ServiceCard from '../ServiceCard';

/** Bookings of one date (used to compute free slots inside modals). */
export function useDayBookings(iso, enabled = true) {
  return useCollection(
    () => (enabled && db && iso ? query(collection(db, COLLECTIONS.BOOKINGS), where('date', '==', iso)) : null),
    [iso, enabled]
  );
}

/** 2) Accept with a modified date/time (the client must then confirm). */
export function ModifiedTimeModal({ open, onClose, booking, settings, onConfirm }) {
  const [date, setDate] = useState(booking?.proposedDate || booking?.date || todayISO());
  const [time, setTime] = useState(booking?.proposedTime || '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const { data: dayBookings, loading } = useDayBookings(date, open);

  useEffect(() => {
    if (open) {
      setDate(booking?.proposedDate || booking?.date || todayISO());
      setTime(booking?.proposedTime || '');
      setNote('');
    }
  }, [open, booking]);

  const slots = useMemo(
    () =>
      open
        ? generateSlots({
            settings,
            iso: date,
            bookings: dayBookings,
            duration: booking?.durationMinutes || 30,
            ignoreBookingId: booking?.id,
          })
        : [],
    [open, settings, date, dayBookings, booking]
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t.owner.modifyTitle}
      footer={
        <div className="flex gap-2">
          <button className="btn-ghost flex-1" onClick={onClose}>
            {t.app.cancel}
          </button>
          <button
            className="btn-gold flex-1"
            disabled={!time || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm({ date, time, note: note.trim() });
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Spinner size={16} /> : t.app.confirm}
          </button>
        </div>
      }
    >
      <div className="mb-3 bg-ink-700/60 rounded-xl p-3 flex items-center justify-between">
        <span className="text-xs text-slate-400">{t.owner.originalWillBe}</span>
        <span className="text-sm font-bold">
          {formatDateLong(booking?.date)} — {booking?.scheduledStart}
        </span>
      </div>

      <p className="label">{t.owner.modifyDate}</p>
      <DateStrip settings={settings} value={date} onChange={(iso) => { setDate(iso); setTime(''); }} days={21} />

      <p className="label mt-4">{t.owner.modifyTime}</p>
      <TimeSlotGrid slots={slots} value={time} onSelect={setTime} loading={loading} />

      <div className="mt-4">
        <Field label={t.owner.modifyNote}>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

/** 3) Decline with an optional reason (shown to the client). */
export function DeclineModal({ open, onClose, booking, onConfirm }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t.owner.decline}
      footer={
        <div className="flex gap-2">
          <button className="btn-ghost flex-1" onClick={onClose}>
            {t.app.cancel}
          </button>
          <button
            className="btn-danger flex-1"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(reason.trim());
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Spinner size={16} /> : t.owner.decline}
          </button>
        </div>
      }
    >
      <Field label={t.owner.declineReason}>
        <textarea
          className="input min-h-24"
          value={reason}
          placeholder={t.owner.declineReasonPlaceholder}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
    </Modal>
  );
}

/** Quick add a walk-in / phone client into a free slot. */
export function WalkInModal({ open, onClose, date, services, settings, prefillTime, onConfirm }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [service, setService] = useState(null);
  const [time, setTime] = useState(prefillTime || '');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const { data: dayBookings, loading } = useDayBookings(date, open);

  useEffect(() => {
    if (open) {
      setName('');
      setPhone('');
      setService(services?.[0] || null);
      setTime(prefillTime || '');
      setErrors({});
    }
  }, [open, prefillTime, services]);

  const slots = useMemo(
    () =>
      open && service
        ? generateSlots({
            settings,
            iso: date,
            bookings: dayBookings,
            duration: service.estimatedMinutes || 30,
          })
        : [],
    [open, service, settings, date, dayBookings]
  );

  const submit = async () => {
    const errs = {};
    if (!name.trim() || name.trim().length < 3) errs.name = t.validation.nameTooShort;
    const p = normalizePhone(phone) || normalizePhone(`${DEFAULT_COUNTRY_CODE}${phone}`);
    if (!p) errs.phone = t.validation.phoneInvalid;
    if (!service) errs.service = t.validation.serviceRequired;
    if (!time) errs.time = t.validation.timeRequired;
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    try {
      await onConfirm({ name: name.trim(), phone: p, service, time });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t.owner.walkInTitle}
      footer={
        <div className="flex gap-2">
          <button className="btn-ghost flex-1" onClick={onClose}>
            {t.app.cancel}
          </button>
          <button className="btn-gold flex-1" disabled={busy} onClick={submit}>
            {busy ? <Spinner size={16} /> : t.app.save}
          </button>
        </div>
      }
    >
      <Field label={t.owner.manualName} error={errors.name}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={t.owner.manualPhone} error={errors.phone}>
        <div className="flex gap-2" dir="ltr">
          <span className="input flex items-center justify-center w-24 bg-ink-600 font-bold text-gold-300">
            {DEFAULT_COUNTRY_CODE}
          </span>
          <input
            className="input flex-1"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
      </Field>

      <p className="label">{t.owner.manualService}</p>
      <div className="grid gap-2 mb-2 max-h-56 overflow-y-auto">
        {(services || []).map((s) => (
          <ServiceCard
            key={s.id}
            service={s}
            compact
            selected={service?.id === s.id}
            onSelect={setService}
          />
        ))}
      </div>
      {errors.service && <p className="text-xs text-red-400 mb-2 font-semibold">{errors.service}</p>}

      <p className="label">{t.owner.manualTime}</p>
      {service ? (
        <TimeSlotGrid slots={slots} value={time} onSelect={setTime} loading={loading} />
      ) : (
        <p className="text-xs text-slate-500">{t.booking.chooseService}</p>
      )}
      {errors.time && <p className="text-xs text-red-400 mt-2 font-semibold">{errors.time}</p>}
    </Modal>
  );
}

/** Preview of a WhatsApp message with the current template. */
export function WhatsAppPreview({ template, booking, settings }) {
  const text = fillTemplate(template, {
    ...templateVars(booking, settings),
    date: formatDateLong(booking?.date),
    new_date: booking?.proposedDate ? formatDateLong(booking.proposedDate) : '',
  });
  return (
    <div className="bg-[#075E54]/20 border border-emerald-500/30 rounded-2xl p-3 text-xs leading-relaxed text-slate-200 whitespace-pre-wrap">
      {text}
    </div>
  );
}
