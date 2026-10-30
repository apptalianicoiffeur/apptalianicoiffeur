/**
 * Authentication context: Google Sign-In, the user's Firestore profile and
 * the owner (barber) role detection based on VITE_OWNER_EMAIL.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db, googleProvider, OWNER_EMAIL } from '../config/firebase';
import { COLLECTIONS } from '../utils/constants';
import { normalizePhone } from '../utils/phone';
import { registerPushToken } from '../services/push';
import t from '../i18n/ar';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // Firebase auth user
  const [profile, setProfile] = useState(null); // users/{uid} document
  const [initializing, setInitializing] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  // Set when the app must re-open the phone dialog (e.g. booking without a phone).
  const [phonePrompt, setPhonePrompt] = useState(false);

  const isOwner = useMemo(
    () => Boolean(user?.email && OWNER_EMAIL && user.email.toLowerCase() === OWNER_EMAIL),
    [user]
  );

  // Follow the Firebase auth state.
  useEffect(() => {
    if (!auth) {
      setInitializing(false);
      return undefined;
    }
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setInitializing(false);
    });
  }, []);

  // Follow the user's profile document (and create it on first login).
  useEffect(() => {
    if (!user || !db) {
      setProfile(null);
      return undefined;
    }
    let alive = true;
    const ref = doc(db, COLLECTIONS.USERS, user.uid);
    (async () => {
      try {
        const snap = await getDoc(ref);
        if (!alive) return;
        if (!snap.exists()) {
          await setDoc(ref, {
            uid: user.uid,
            name: user.displayName || '',
            email: (user.email || '').toLowerCase(),
            phone: '',
            role: isOwner ? 'owner' : 'client',
            fcmToken: '',
            phoneAsked: false,
            createdAt: serverTimestamp(),
          });
        } else if (isOwner && snap.data()?.role !== 'owner') {
          // The owner email always gets the owner role (rules enforce it too).
          await updateDoc(ref, { role: 'owner' });
        }
      } catch {
        /* rules/network errors are surfaced by the snapshot listener below */
      }
    })();
    return onSnapshot(
      ref,
      (snap) => {
        if (alive) setProfile(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      },
      () => {
        if (alive) setProfile(null);
      }
    );
  }, [user, isOwner]);

  // Save the FCM token for push notifications (best effort).
  useEffect(() => {
    if (!user || !profile || profile.fcmToken) return;
    registerPushToken(user.uid).catch(() => {});
  }, [user, profile]);

  /** Sign in with Google (popup). Returns { ok, error? } with an Arabic message. */
  const signInWithGoogle = useCallback(async () => {
    if (!auth) return { ok: false, error: t.errors.generic };
    setSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
      return { ok: true };
    } catch (err) {
      const code = err?.code || '';
      let message = t.auth.failed;
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        message = t.auth.popupClosed;
      } else if (code === 'auth/popup-blocked') {
        message = t.auth.popupBlocked;
      } else if (code === 'auth/unauthorized-domain') {
        message = t.auth.unauthorizedDomain;
      }
      return { ok: false, error: message };
    } finally {
      setSigningIn(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    if (auth) await firebaseSignOut(auth);
  }, []);

  /** Save the phone number on the profile (asked once after first login). */
  const savePhone = useCallback(
    async (input) => {
      const phone = normalizePhone(input);
      if (!phone || !user) throw new Error('invalid phone');
      await updateDoc(doc(db, COLLECTIONS.USERS, user.uid), { phone, phoneAsked: true });
      setPhonePrompt(false);
    },
    [user]
  );

  /** Remember that the phone dialog was skipped (it will not be asked again). */
  const skipPhoneAsk = useCallback(async () => {
    setPhonePrompt(false);
    if (!user || !db) return;
    await updateDoc(doc(db, COLLECTIONS.USERS, user.uid), { phoneAsked: true }).catch(() => {});
  }, [user]);

  /** Force the phone dialog open (used when a phone number is required). */
  const askPhone = useCallback(() => setPhonePrompt(true), []);

  const value = useMemo(
    () => ({
      user,
      profile,
      initializing,
      signingIn,
      isOwner,
      signInWithGoogle,
      signOut,
      savePhone,
      skipPhoneAsk,
      askPhone,
      // True for a Google user who never gave a phone number yet (or when the
      // app explicitly re-asks through `askPhone`).
      needsPhone: Boolean(
        user && profile && !profile.phone && !isOwner && (phonePrompt || !profile.phoneAsked)
      ),
    }),
    [
      user,
      profile,
      initializing,
      signingIn,
      isOwner,
      phonePrompt,
      signInWithGoogle,
      signOut,
      savePhone,
      skipPhoneAsk,
      askPhone,
    ]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
