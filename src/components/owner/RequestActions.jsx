/**
 * The three booking-request actions (accept / accept with modification /
 * decline) plus one-tap call and WhatsApp, shared by the requests page and
 * the live queue.
 */
import { useState } from 'react';
import { CheckCircle2, CalendarClock, PhoneCall, XCircle, MessageCircle, Loader2 } from 'lucide-react';
import t from '../../i18n/ar';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import {
  ownerAccept,
  ownerAcceptModified,
  ownerDecline,
} from '../../services/bookingActions';
import { fillTemplate, openWhatsApp, telLink, templateVars } from '../../utils/whatsapp';
import { formatDateLong } from '../../utils/datetime';
import { DeclineModal, ModifiedTimeModal } from './modals';

export default function RequestActions({ booking, onChanged, size = 'sm' }) {
  const { settings, templates } = useSettings();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [modOpen, setModOpen] = useState(false);
  const [decOpen, setDecOpen] = useState(false);

  const cls = size === 'sm' ? 'btn-sm' : '';

  const guard = async (fn, message) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      if (message) toast(message);
      onChanged?.();
    } catch {
      toast(t.errors.actionFailed, 'error');
    } finally {
      setBusy(false);
    }
  };

  /** Build the WhatsApp text for a given template key. */
  const waText = (key, extra = {}) =>
    fillTemplate(templates[key], {
      ...templateVars(booking, settings),
      date: formatDateLong(booking.date),
      new_date: booking.proposedDate ? formatDateLong(booking.proposedDate) : '',
      ...extra,
    });

  const sendWa = (key, extra) => {
    const ok = openWhatsApp(booking.phone, waText(key, extra));
    if (!ok) toast(t.validation.phoneInvalid, 'error');
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button
          className={`btn-success ${cls}`}
          disabled={busy}
          onClick={() => guard(() => ownerAccept(booking, settings), t.owner.acceptDone)}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
          {t.owner.accept}
        </button>
        <button
          className={`btn-outline ${cls}`}
          disabled={busy}
          onClick={() => setModOpen(true)}
        >
          <CalendarClock size={14} />
          {t.owner.acceptModified}
        </button>
        <button
          className={`btn-danger ${cls}`}
          disabled={busy}
          onClick={() => setDecOpen(true)}
        >
          <XCircle size={14} />
          {t.owner.decline}
        </button>

        <div className="w-full sm:w-auto flex gap-2 mt-1">
          {telLink(booking.phone) && (
            <a
              className={`btn-ghost ${cls} flex-1 sm:flex-none`}
              href={telLink(booking.phone)}
              aria-label={t.owner.call}
            >
              <PhoneCall size={14} /> {t.owner.call}
            </a>
          )}
          <button
            className={`btn-ghost ${cls} flex-1 sm:flex-none !text-emerald-300 hover:!bg-emerald-500/10`}
            onClick={() => sendWa('accept')}
            aria-label={t.owner.whatsapp}
          >
            <MessageCircle size={14} /> {t.owner.whatsapp}
          </button>
        </div>
      </div>

      <ModifiedTimeModal
        open={modOpen}
        onClose={() => setModOpen(false)}
        booking={booking}
        settings={settings}
        onConfirm={(payload) =>
          guard(async () => {
            await ownerAcceptModified(booking, payload, settings);
            setModOpen(false);
          }, t.owner.modifiedDone)
        }
      />
      <DeclineModal
        open={decOpen}
        onClose={() => setDecOpen(false)}
        booking={booking}
        onConfirm={(reason) =>
          guard(async () => {
            await ownerDecline(booking, reason, settings);
            setDecOpen(false);
          }, t.owner.declineDone)
        }
      />
    </>
  );
}

/** Small helper used by the queue rows to open the right WhatsApp template. */
export function WhatsAppButton({ booking, templateKey = 'accept', label, extraVars = {} }) {
  const { settings, templates } = useSettings();
  const { toast } = useToast();
  const text = fillTemplate(templates[templateKey], {
    ...templateVars(booking, settings),
    date: formatDateLong(booking.date),
    new_date: booking.proposedDate ? formatDateLong(booking.proposedDate) : '',
    ...extraVars,
  });
  return (
    <button
      className="btn-ghost btn-sm !text-emerald-300 hover:!bg-emerald-500/10"
      onClick={() => {
        const ok = openWhatsApp(booking.phone, text);
        if (!ok) toast(t.validation.phoneInvalid, 'error');
      }}
    >
      <MessageCircle size={14} /> {label || t.owner.whatsapp}
    </button>
  );
}
