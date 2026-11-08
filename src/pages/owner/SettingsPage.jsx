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
import { formatDateLong, todayISO } from '../../utils/datetime';
import { fetchPrayerBreaks, fetchPrayerTimings } from '../../services/prayerTimes';
import { Field, Spinner, Toggle } from '../../components/ui';
import ShopLocationMap from '../../components/owner/ShopLocationMap';
import { shopCoordinates } from '../../utils/shopInfo';

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
  '{tracking_url}',
];

const PRAYER_OPTIONS = [
  ['Fajr', t.owner.prayerFajr],
  ['Dhuhr', t.owner.prayerDhuhr],
  ['Asr', t.owner.prayerAsr],
  ['Maghrib', t.owner.prayerMaghrib],
  ['Isha', t.owner.prayerIsha],
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
  const [shop, setShop] = useState({
    shopNameAr: '',
    shopNameFr: '',
    phone: '',
    address: '',
    shopLocationLatitude: '',
    shopLocationLongitude: '',
  });
  const [prayerSettings, setPrayerSettings] = useState(settings.prayerBreakSettings);
  const [busy, setBusy] = useState(false);
  const [savingTpl, setSavingTpl] = useState(false);
  const [savingPrayer, setSavingPrayer] = useState(false);
  const [prayerError, setPrayerError] = useState('');
  const [prayerPreviewDate, setPrayerPreviewDate] = useState(todayISO);
  const [prayerPreview, setPrayerPreview] = useState({ key: '', timings: null, loading: false, error: false });
  const textareaRef = useRef(null);

  useEffect(() => setDrafts(templates), [templates]);
  useEffect(
    () =>
      setShop({
        shopNameAr: settings.shopNameAr || settings.shopName || '',
        shopNameFr: settings.shopNameFr || '',
        phone: settings.phone || '',
        address: settings.address || '',
        shopLocationLatitude: settings.shopLocationLatitude || '',
        shopLocationLongitude: settings.shopLocationLongitude || '',
      }),
    [settings]
  );
  useEffect(() => setPrayerSettings(settings.prayerBreakSettings), [settings.prayerBreakSettings]);

  const prayerPreviewKey = JSON.stringify({
    date: prayerPreviewDate,
    city: prayerSettings.city,
    country: prayerSettings.country,
    latitude: prayerSettings.latitude,
    longitude: prayerSettings.longitude,
    method: prayerSettings.method,
    school: prayerSettings.school,
  });
  const prayerPreviewSettings = useMemo(
    () => ({
      prayerBreakSettings: {
        enabled: true,
        city: prayerSettings.city,
        country: prayerSettings.country,
        latitude: prayerSettings.latitude,
        longitude: prayerSettings.longitude,
        method: prayerSettings.method,
        school: prayerSettings.school,
      },
    }),
    [
      prayerSettings.city,
      prayerSettings.country,
      prayerSettings.latitude,
      prayerSettings.longitude,
      prayerSettings.method,
      prayerSettings.school,
    ]
  );

  useEffect(() => {
    if (!prayerSettings.enabled) {
      setPrayerPreview({ key: prayerPreviewKey, timings: null, loading: false, error: false });
      return undefined;
    }
    if (!prayerPreviewDate) {
      setPrayerPreview({ key: prayerPreviewKey, timings: null, loading: false, error: false });
      return undefined;
    }

    let active = true;
    const timer = setTimeout(() => {
      setPrayerPreview({ key: prayerPreviewKey, timings: null, loading: true, error: false });
      fetchPrayerTimings(prayerPreviewSettings, prayerPreviewDate)
        .then((timings) => {
          if (active) setPrayerPreview({ key: prayerPreviewKey, timings, loading: false, error: false });
        })
        .catch(() => {
          if (active) setPrayerPreview({ key: prayerPreviewKey, timings: null, loading: false, error: true });
        });
    }, 350);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [prayerSettings.enabled, prayerPreviewSettings, prayerPreviewDate, prayerPreviewKey]);

  const visiblePrayerPreview =
    prayerPreview.key === prayerPreviewKey ? prayerPreview : { timings: null, loading: true, error: false };

  const previewVars = useMemo(
    () => ({
      ...templateVars(SAMPLE, { shopNameAr: shop.shopNameAr }),
      date: formatDateLong(SAMPLE.date),
      new_date: formatDateLong(SAMPLE.proposedDate),
      tracking_url: `${window.location.origin}/track?bookingId=sample#token=${'a'.repeat(64)}`,
    }),
    [shop.shopNameAr]
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
      const latitude = String(shop.shopLocationLatitude || '').trim();
      const longitude = String(shop.shopLocationLongitude || '').trim();
      if (Boolean(latitude) !== Boolean(longitude)) {
        toast(t.owner.shopCoordinatesPair, 'error');
        return;
      }
      if (
        latitude &&
        (!Number.isFinite(Number(latitude)) ||
          Number(latitude) < -90 ||
          Number(latitude) > 90 ||
          !Number.isFinite(Number(longitude)) ||
          Number(longitude) < -180 ||
          Number(longitude) > 180)
      ) {
        toast(t.owner.shopCoordinatesInvalid, 'error');
        return;
      }
      const shopNameAr = shop.shopNameAr.trim();
      await savePublic({
        shopName: shopNameAr,
        shopNameAr,
        shopNameFr: shop.shopNameFr.trim(),
        phone,
        address: shop.address.trim(),
        shopLocationLatitude: latitude,
        shopLocationLongitude: longitude,
      });
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

  const savePrayerSettings = async () => {
    const latitude = String(prayerSettings.latitude ?? '').trim();
    const longitude = String(prayerSettings.longitude ?? '').trim();
    const next = {
      ...prayerSettings,
      city: prayerSettings.city.trim(),
      country: prayerSettings.country.trim(),
      latitude,
      longitude,
      method: prayerSettings.method === '' ? '' : Number(prayerSettings.method),
      school: Number(prayerSettings.school),
      beforeMinutes: Number(prayerSettings.beforeMinutes),
      afterMinutes: Number(prayerSettings.afterMinutes),
      adjustments: Object.fromEntries(
        Object.entries(prayerSettings.adjustments).map(([prayer, minutes]) => [prayer, Number(minutes)])
      ),
    };
    const hasLatitude = Boolean(latitude);
    const hasLongitude = Boolean(longitude);
    if (next.enabled && hasLatitude !== hasLongitude) {
      setPrayerError(t.owner.prayerCoordinatesPair);
      return;
    }
    if (next.enabled && !hasLatitude && (!next.city || !next.country)) {
      setPrayerError(t.owner.prayerLocationRequired);
      return;
    }
    if (next.enabled && hasLatitude && !next.country && !next.method) {
      setPrayerError(t.owner.prayerCountryRequired);
      return;
    }
    if (
      hasLatitude &&
      (!Number.isFinite(Number(latitude)) || Number(latitude) < -90 || Number(latitude) > 90 ||
        !Number.isFinite(Number(longitude)) || Number(longitude) < -180 || Number(longitude) > 180)
    ) {
      setPrayerError(t.owner.prayerCoordinatesInvalid);
      return;
    }
    if (
      !Number.isInteger(next.beforeMinutes) ||
      !Number.isInteger(next.afterMinutes) ||
      next.beforeMinutes < 0 ||
      next.afterMinutes < 0 ||
      next.beforeMinutes > 120 ||
      next.afterMinutes > 120
    ) {
      setPrayerError(t.owner.prayerMinutesInvalid);
      return;
    }
    if (
      Object.values(next.adjustments).some(
        (minutes) => !Number.isInteger(minutes) || minutes < -120 || minutes > 120
      )
    ) {
      setPrayerError(t.owner.prayerAdjustmentInvalid);
      return;
    }

    setSavingPrayer(true);
    setPrayerError('');
    try {
      if (next.enabled) {
        try {
          await fetchPrayerBreaks({ prayerBreakSettings: next }, todayISO());
        } catch {
          setPrayerError(t.owner.prayerTimesError);
          return;
        }
      }
      await savePublic({ prayerBreakSettings: next });
      toast(t.owner.prayerSettingsSaved);
    } catch {
      toast(t.errors.actionFailed, 'error');
    } finally {
      setSavingPrayer(false);
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
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label={t.owner.shopNameAr}>
            <input
              className="input"
              value={shop.shopNameAr}
              onChange={(e) => setShop((draft) => ({ ...draft, shopNameAr: e.target.value }))}
            />
          </Field>
          <Field label={t.owner.shopNameFr}>
            <input
              className="input"
              dir="ltr"
              value={shop.shopNameFr}
              onChange={(e) => setShop((draft) => ({ ...draft, shopNameFr: e.target.value }))}
            />
          </Field>
        </div>
        <Field label={t.owner.shopPhone} hint={DEFAULT_COUNTRY_CODE}>
          <input
            className="input"
            dir="ltr"
            inputMode="tel"
            value={shop.phone}
            onChange={(e) => setShop((draft) => ({ ...draft, phone: e.target.value }))}
          />
        </Field>
        <Field label={t.owner.shopAddress}>
          <input
            className="input"
            value={shop.address}
            onChange={(e) => setShop((draft) => ({ ...draft, address: e.target.value }))}
          />
        </Field>
        <p className="label">{t.owner.shopLocation}</p>
        <p className="text-[11px] text-slate-400 leading-relaxed mb-3">{t.owner.shopLocationHint}</p>
        <ShopLocationMap
          position={shopCoordinates(shop)}
          onChange={([latitude, longitude]) =>
            setShop((draft) => ({
              ...draft,
              shopLocationLatitude: latitude.toFixed(7),
              shopLocationLongitude: longitude.toFixed(7),
            }))
          }
        />
        <div className="grid sm:grid-cols-2 gap-3 mt-4">
          <Field label={t.owner.shopLatitude}>
            <input
              className="input"
              type="number"
              min="-90"
              max="90"
              step="any"
              dir="ltr"
              inputMode="decimal"
              value={shop.shopLocationLatitude}
              onChange={(e) =>
                setShop((draft) => ({ ...draft, shopLocationLatitude: e.target.value }))
              }
            />
          </Field>
          <Field label={t.owner.shopLongitude}>
            <input
              className="input"
              type="number"
              min="-180"
              max="180"
              step="any"
              dir="ltr"
              inputMode="decimal"
              value={shop.shopLocationLongitude}
              onChange={(e) =>
                setShop((draft) => ({ ...draft, shopLocationLongitude: e.target.value }))
              }
            />
          </Field>
        </div>
        <button className="btn-gold w-full" onClick={saveShop} disabled={busy}>
          {busy ? <Spinner size={16} /> : <Save size={16} />} {t.app.saveChanges}
        </button>
      </section>

      <section className="card p-4 mb-5">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div>
            <h2 className="section-title mb-1">{t.owner.prayerBreaks}</h2>
            <p className="text-[11px] text-slate-400 leading-relaxed">{t.owner.prayerBreaksHint}</p>
          </div>
          <Toggle
            checked={prayerSettings.enabled}
            onChange={(enabled) => setPrayerSettings((draft) => ({ ...draft, enabled }))}
            ariaLabel={t.owner.prayerBreaks}
          />
        </div>

        {prayerSettings.enabled && (
          <>
            <div className="grid sm:grid-cols-2 gap-3 mt-4">
              <Field label={t.owner.prayerCity}>
                <input
                  className="input"
                  value={prayerSettings.city}
                  onChange={(e) => setPrayerSettings((draft) => ({ ...draft, city: e.target.value }))}
                  autoComplete="address-level2"
                />
              </Field>
              <Field label={t.owner.prayerCountry}>
                <input
                  className="input"
                  value={prayerSettings.country}
                  onChange={(e) => setPrayerSettings((draft) => ({ ...draft, country: e.target.value }))}
                  autoComplete="country-name"
                />
              </Field>
            </div>

            <p className="text-[11px] text-slate-500 -mt-2 mb-4">{t.owner.prayerCoordinatesHint}</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label={t.owner.prayerLatitude}>
                <input
                  className="input"
                  type="number"
                  min="-90"
                  max="90"
                  step="any"
                  dir="ltr"
                  inputMode="decimal"
                  value={prayerSettings.latitude}
                  onChange={(e) => setPrayerSettings((draft) => ({ ...draft, latitude: e.target.value }))}
                />
              </Field>
              <Field label={t.owner.prayerLongitude}>
                <input
                  className="input"
                  type="number"
                  min="-180"
                  max="180"
                  step="any"
                  dir="ltr"
                  inputMode="decimal"
                  value={prayerSettings.longitude}
                  onChange={(e) => setPrayerSettings((draft) => ({ ...draft, longitude: e.target.value }))}
                />
              </Field>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <Field label={t.owner.prayerMethod}>
                <select
                  className="input"
                  value={prayerSettings.method}
                  onChange={(e) => setPrayerSettings((draft) => ({ ...draft, method: e.target.value }))}
                >
                  <option value="">{t.owner.prayerMethodAuto}</option>
                  <option value="19">{t.owner.prayerMethodAlgeria}</option>
                  <option value="18">{t.owner.prayerMethodTunisia}</option>
                  <option value="21">{t.owner.prayerMethodMorocco}</option>
                  <option value="12">{t.owner.prayerMethodFrance}</option>
                  <option value="3">{t.owner.prayerMethodMwl}</option>
                  <option value="2">{t.owner.prayerMethodIsna}</option>
                  <option value="4">{t.owner.prayerMethodUmmAlQura}</option>
                  <option value="5">{t.owner.prayerMethodEgypt}</option>
                  <option value="1">{t.owner.prayerMethodKarachi}</option>
                </select>
              </Field>
              <Field label={t.owner.prayerSchool}>
                <select
                  className="input"
                  value={prayerSettings.school}
                  onChange={(e) => setPrayerSettings((draft) => ({ ...draft, school: Number(e.target.value) }))}
                >
                  <option value="0">{t.owner.prayerSchoolStandard}</option>
                  <option value="1">{t.owner.prayerSchoolHanafi}</option>
                </select>
              </Field>
            </div>
            <p className="text-[11px] text-slate-500 -mt-2 mb-4">{t.owner.prayerCalculationHint}</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label={t.owner.prayerBefore}>
                <input
                  className="input"
                  type="number"
                  min="0"
                  max="120"
                  step="1"
                  value={prayerSettings.beforeMinutes}
                  onChange={(e) => setPrayerSettings((draft) => ({ ...draft, beforeMinutes: e.target.value }))}
                />
              </Field>
              <Field label={t.owner.prayerAfter}>
                <input
                  className="input"
                  type="number"
                  min="0"
                  max="120"
                  step="1"
                  value={prayerSettings.afterMinutes}
                  onChange={(e) => setPrayerSettings((draft) => ({ ...draft, afterMinutes: e.target.value }))}
                />
              </Field>
            </div>
            <div className="rounded-2xl border border-ink-500/70 bg-ink-700/40 p-4 mb-5">
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-3">
                <div>
                  <p className="text-sm font-extrabold text-slate-100">{t.owner.prayerPreview}</p>
                  <p className="text-[11px] text-slate-400 mt-1">{t.owner.prayerPreviewHint}</p>
                </div>
                <Field label={t.owner.prayerPreviewDate}>
                  <input
                    className="input"
                    type="date"
                    value={prayerPreviewDate}
                    onChange={(e) => setPrayerPreviewDate(e.target.value)}
                  />
                </Field>
              </div>
              {visiblePrayerPreview.loading && (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Spinner size={15} /> {t.app.loading}
                </div>
              )}
              {visiblePrayerPreview.error && (
                <p className="text-xs text-red-400 font-semibold">{t.owner.prayerPreviewError}</p>
              )}
              {visiblePrayerPreview.timings && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  {PRAYER_OPTIONS.map(([prayer, label]) => (
                    <div key={prayer} className="rounded-xl bg-ink-800/80 px-3 py-2.5 text-center">
                      <p className="text-[11px] text-slate-400">{label.replace(' (دقائق)', '')}</p>
                      <p className="mt-1 text-lg font-black text-gold-300" dir="ltr">
                        {String(visiblePrayerPreview.timings[prayer]).match(/^\d{1,2}:\d{2}/)?.[0] || '—'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs font-bold text-slate-300 mb-2">{t.owner.prayerAdjustments}</p>
            <p className="text-[11px] text-slate-500 mb-3">{t.owner.prayerAdjustmentsHint}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {PRAYER_OPTIONS.map(([prayer, label]) => (
                <Field key={prayer} label={label}>
                  <input
                    className="input"
                    type="number"
                    min="-120"
                    max="120"
                    step="1"
                    value={prayerSettings.adjustments[prayer]}
                    onChange={(e) =>
                      setPrayerSettings((draft) => ({
                        ...draft,
                        adjustments: { ...draft.adjustments, [prayer]: e.target.value },
                      }))
                    }
                  />
                </Field>
              ))}
            </div>
          </>
        )}

        {prayerError && <p className="text-xs text-red-400 mb-3 font-semibold">{prayerError}</p>}
        <button className="btn-gold w-full" onClick={savePrayerSettings} disabled={savingPrayer}>
          {savingPrayer ? <Spinner size={16} /> : <Save size={16} />} {t.app.saveChanges}
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
