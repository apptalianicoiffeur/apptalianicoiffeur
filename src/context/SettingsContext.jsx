/**
 * Settings context: real-time shop settings (public) and WhatsApp templates
 * (private, owner only).
 */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, COLLECTIONS, SETTINGS_DOCS } from '../services/bootstrap';
import { withDefaults } from '../utils/slots';
import { DEFAULT_TEMPLATES } from '../utils/whatsapp';
import { useAuth } from './AuthContext';

const SettingsCtx = createContext(null);

const publicRef = () => doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOCS.PUBLIC);
const privateRef = () => doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOCS.PRIVATE);

export function SettingsProvider({ children }) {
  const { isOwner } = useAuth();
  const [pub, setPub] = useState(null);
  const [priv, setPriv] = useState(null);
  const [loading, setLoading] = useState(true);

  // Public settings: everyone (even guests) reads them in real time.
  useEffect(() => {
    if (!db) {
      setLoading(false);
      return undefined;
    }
    return onSnapshot(
      publicRef(),
      (snap) => {
        setPub(withDefaults(snap.exists() ? snap.data() : {}));
        setLoading(false);
      },
      () => {
        // Offline / rules error: fall back to defaults so the app still renders.
        setPub(withDefaults({}));
        setLoading(false);
      }
    );
  }, []);

  // Private settings (WhatsApp templates): owner only.
  useEffect(() => {
    if (!isOwner || !db) {
      setPriv(null);
      return undefined;
    }
    return onSnapshot(
      privateRef(),
      (snap) => setPriv(snap.exists() ? snap.data() : {}),
      () => setPriv({})
    );
  }, [isOwner]);

  const templates = useMemo(
    () => ({ ...DEFAULT_TEMPLATES, ...(priv?.whatsappTemplates || {}) }),
    [priv]
  );

  const value = useMemo(
    () => ({
      settings: pub || withDefaults({}),
      loading,
      templates,
      /** Merge-patch the public settings (owner session required by rules). */
      savePublic: async (patch) => {
        await setDoc(publicRef(), patch, { merge: true });
      },
      /** Save the four WhatsApp templates. */
      saveTemplates: async (next) => {
        await setDoc(privateRef(), { whatsappTemplates: next }, { merge: true });
      },
      /** Convenience: flip the shop open/closed switch. */
      setShopOpen: async (open) => {
        await setDoc(publicRef(), { shopOpen: Boolean(open) }, { merge: true });
      },
    }),
    [pub, loading, templates]
  );

  return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsCtx);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
