import { useEffect, useMemo, useState } from 'react';
import { fetchPrayerBreaks } from '../services/prayerTimes';

/** Load prayer break windows for one or more local ISO dates. */
export function usePrayerBreaks(settings, dates, enabled = true) {
  const datesKey = useMemo(
    () => [...new Set((Array.isArray(dates) ? dates : [dates]).filter(Boolean))].sort().join(','),
    [Array.isArray(dates) ? dates.join(',') : dates]
  );
  const prayerSettings = settings.prayerBreakSettings;
  const locationKey = `${prayerSettings?.city || ''}|${prayerSettings?.country || ''}|${prayerSettings?.beforeMinutes}|${prayerSettings?.afterMinutes}`;
  const active = enabled && Boolean(prayerSettings?.enabled);
  const [result, setResult] = useState({ datesKey: '', locationKey: '', windows: {}, loading: false, error: null });

  useEffect(() => {
    if (!active) {
      setResult({ datesKey, locationKey, windows: {}, loading: false, error: null });
      return undefined;
    }

    let current = true;
    setResult({ datesKey, locationKey, windows: {}, loading: true, error: null });
    Promise.all(
      datesKey
        .split(',')
        .filter(Boolean)
        .map(async (iso) => [iso, await fetchPrayerBreaks(settings, iso)])
    )
      .then((entries) => {
        if (current) setResult({ datesKey, locationKey, windows: Object.fromEntries(entries), loading: false, error: null });
      })
      .catch((error) => {
        if (current) setResult({ datesKey, locationKey, windows: {}, loading: false, error });
      });

    return () => {
      current = false;
    };
  }, [active, datesKey, locationKey]);

  const isCurrent = result.datesKey === datesKey && result.locationKey === locationKey;
  return {
    windows: isCurrent ? result.windows : {},
    loading: active && (!isCurrent || result.loading),
    error: isCurrent ? result.error : null,
  };
}
