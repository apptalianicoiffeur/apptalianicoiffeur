/**
 * WhatsApp click-to-chat helpers (no paid API).
 * Builds https://wa.me/<number>?text=<encoded message> links with a ready-made
 * Arabic message that the barber only has to press "Send" on.
 */
import { phoneDigits } from './phone';

/** Default Arabic message templates. Placeholders are replaced at send time. */
export const DEFAULT_TEMPLATES = {
  accept:
    'أهلاً {client_name} 👋\n' +
    'تم قبول حجزك للخدمة {service} يوم {date} على الساعة {time}.\n' +
    'السعر: {price} دج.\n' +
    'نتشرف بزيارتك في {shop_name} ✂️',
  decline:
    'أهلاً {client_name} 👋\n' +
    'للأسف لا يمكننا استقبالك يوم {date} على الساعة {time}.\n' +
    'يمكنك اختيار موعد آخر من التطبيق. شكراً لتفهمك 🙏',
  acceptModified:
    'أهلاً {client_name} 👋\n' +
    'قُبل حجزك للخدمة {service} لكن بتعديل الوقت:\n' +
    '📅 الموعد الجديد: {new_date} على الساعة {new_time}\n' +
    '(الموعد السابق: {date} على الساعة {time})\n' +
    'يرجى تأكيد الموعد الجديد من التطبيق. شكراً لتفهمك 🙏',
  delay:
    'أهلاً {client_name} 👋\n' +
    'نعتذر، الجلسة السابقة تأخرت قليلاً لذلك موعدك المتوقع أصبح {new_time} بدل {old_time}.\n' +
    'نعتذر عن الإزعاج وشكراً لصبرك 🙏',
};

/** The four template keys with their i18n labels. */
export const TEMPLATE_KEYS = ['accept', 'decline', 'acceptModified', 'delay'];

/** Replace {placeholder} tokens with real values (unknown tokens are left as-is). */
export function fillTemplate(template, vars = {}) {
  return String(template || '').replace(/\{(\w+)\}/g, (match, key) =>
    vars[key] !== undefined && vars[key] !== null && vars[key] !== '' ? String(vars[key]) : match
  );
}

/** Build the variables used by all templates from a booking + settings. */
export function templateVars(booking, settings = {}) {
  return {
    client_name: booking?.name || '',
    service: booking?.serviceName || '',
    date: booking?.date || '',
    time: booking?.scheduledStart || '',
    new_date: booking?.proposedDate || '',
    new_time: booking?.proposedTime || booking?.expectedStart || '',
    old_time: booking?.scheduledStart || '',
    shop_name: settings?.shopName || 'تالياني كوفير',
    price: booking?.price ?? '',
  };
}

/** Click-to-chat link. Returns null for missing phone numbers. */
export function waLink(phone, message) {
  const digits = phoneDigits(phone);
  if (!digits) return null;
  const base = `https://wa.me/${digits}`;
  if (!message) return base;
  return `${base}?text=${encodeURIComponent(message)}`;
}

/** Open a WhatsApp chat in a new tab (safe against popup blockers). */
export function openWhatsApp(phone, message) {
  const link = waLink(phone, message);
  if (!link) return false;
  window.open(link, '_blank', 'noopener,noreferrer');
  return true;
}

/** tel: link for the one-tap call button. */
export function telLink(phone) {
  const digits = phoneDigits(phone);
  return digits ? `tel:+${digits}` : null;
}
