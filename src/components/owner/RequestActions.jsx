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
import { fillTemplate, openWhatsApp, telLink, templateVars, waLink } from '../../utils/whatsapp';
import { formatDateLong } from '../../utils/datetime';
import { bookingTrackingUrl } from '../../utils/guestTracking';
import { DeclineModal, ModifiedTimeModal } from './modals';

export default function RequestActions({ booking, onChanged, size = 'sm' }) {
  const { settings, templates } = useSettings();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [modOpen, setModOpen] = useState(false);
  const [decOpen, setDecOpen] = useState(false);

  const cls = size === 'sm' ? 'btn-sm' : '';

  const guard = async (fn, message, whatsapp = null) => {
    if (busy) return;
    const whatsappWindow = whatsapp && bookingTrackingUrl(booking) ? window.open('about:blank', '_blank') : null;
    setBusy(true);
    try {
      await fn();
      if (message) toast(message);
      if (whatsapp) {
        const url = bookingTrackingUrl(booking);
        const text = waText(whatsapp.templateKey, {
          ...whatsapp.extraVars,
          tracking_url: url || '',
          reason: whatsapp.reason || '',
        });
        const withLink =
          url && !templates[whatsapp.templateKey]?.includes('{tracking_url}')
            ? `${text}\nرابط متابعة الحجز: ${url}`
            : text;
        const link = waLink(booking.phone, withLink);
        if (link && whatsappWindow) {
          whatsappWindow.location.href = link;
        } else {
          whatsappWindow?.close();
          if (url && !link) toast(t.validation.phoneInvalid, 'error');
          else if (url) toast(t.owner.whatsappPopupBlocked, 'info');
        }
      }
      onChanged?.();
    } catch {
      whatsappWindow?.close();
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
    const url = bookingTrackingUrl(booking);
    const text = waText(key, { ...extra, tracking_url: url || '' });
    const withLink =
      url && !templates[key]?.includes('{tracking_url}')
        ? `${text}\nرابط متابعة الحجز: ${url}`
        : text;
    const ok = openWhatsApp(booking.phone, withLink);
    if (!ok) toast(t.validation.phoneInvalid, 'error');
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button
          className={`btn-success ${cls}`}
          disabled={busy}
          onClick={() =>
            guard(
              () => ownerAccept(booking, settings),
              t.owner.acceptDone,
              booking.guestTrackingToken ? { templateKey: 'accept' } : null
            )
          }
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
          }, t.owner.modifiedDone, booking.guestTrackingToken ? {
            templateKey: 'acceptModified',
            extraVars: { new_date: formatDateLong(payload.date), new_time: payload.time },
          } : null)
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
          }, t.owner.declineDone, booking.guestTrackingToken ? {
            templateKey: 'decline',
            reason,
            extraVars: { reason },
          } : null)
        }
      />
    </>
  );
}

/** Small helper used by the queue rows to open the right WhatsApp template. */
export function WhatsAppButton({ booking, templateKey = 'accept', label, extraVars = {} }) {
  const { settings, templates } = useSettings();
  const { toast } = useToast();
  const trackingUrl = bookingTrackingUrl(booking);
  const text = fillTemplate(templates[templateKey], {
    ...templateVars(booking, settings),
    date: formatDateLong(booking.date),
    new_date: booking.proposedDate ? formatDateLong(booking.proposedDate) : '',
    tracking_url: trackingUrl || '',
    ...extraVars,
  });
  const message =
    trackingUrl && !templates[templateKey]?.includes('{tracking_url}')
      ? `${text}\nرابط متابعة الحجز: ${trackingUrl}`
      : text;
  return (
    <button
      className="btn-ghost btn-sm !text-emerald-300 hover:!bg-emerald-500/10"
      onClick={() => {
        const ok = openWhatsApp(booking.phone, message);
        if (!ok) toast(t.validation.phoneInvalid, 'error');
      }}
    >
      <MessageCircle size={14} /> {label || t.owner.whatsapp}
    </button>
  );
}
