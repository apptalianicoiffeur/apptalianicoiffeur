/**
 * Authentication context: Google and email/password sign-in, the user's
 * Firestore profile, and verified owner-role detection.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  linkWithCredential,
  linkWithPopup,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updatePassword,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db, googleProvider, OWNER_EMAIL } from '../config/firebase';
import { COLLECTIONS } from '../utils/constants';
import { normalizePhone } from '../utils/phone';
import { registerPushToken } from '../services/push';
import t from '../i18n/ar';

const AuthCtx = createContext(null);

function authErrorMessage(err) {
  switch (err?.code) {
    case 'auth/invalid-email':
      return t.auth.invalidEmail;
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return t.auth.invalidCredentials;
    case 'auth/email-already-in-use':
      return t.auth.emailAlreadyInUse;
    case 'auth/weak-password':
      return t.auth.weakPassword;
    case 'auth/requires-recent-login':
      return t.auth.recentLoginRequired;
    case 'auth/user-disabled':
      return t.auth.userDisabled;
    case 'auth/too-many-requests':
      return t.auth.tooManyRequests;
    case 'auth/network-request-failed':
      return t.errors.network;
    case 'auth/operation-not-allowed':
      return t.auth.emailProviderDisabled;
    case 'auth/credential-already-in-use':
    case 'auth/provider-already-linked':
    case 'auth/account-exists-with-different-credential':
      return t.auth.credentialAlreadyInUse;
    default:
      return t.auth.failed;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // Firebase auth user
  const [profile, setProfile] = useState(null); // users/{uid} document
  const [initializing, setInitializing] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [profileSync, setProfileSync] = useState(null);
  // Set when the app must re-open the phone dialog (e.g. booking without a phone).
  const [phonePrompt, setPhonePrompt] = useState(false);

  const isOwner = useMemo(
    () =>
      Boolean(
        user?.emailVerified &&
          user.email &&
          OWNER_EMAIL &&
          user.email.toLowerCase() === OWNER_EMAIL
      ),
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
    const profileName = profileSync?.uid === user.uid ? profileSync.name : '';
    (async () => {
      try {
        const snap = await getDoc(ref);
        if (!alive) return;
        if (!snap.exists()) {
          await setDoc(ref, {
            uid: user.uid,
            name: profileName || user.displayName || '',
            email: (user.email || '').toLowerCase(),
            phone: '',
            role: isOwner ? 'owner' : 'client',
            fcmToken: '',
            phoneAsked: false,
            createdAt: serverTimestamp(),
          });
        } else {
          const current = snap.data();
          const changes = {};
          if (isOwner && current.role !== 'owner') {
            changes.role = 'owner';
          }
          if (profileName && current.name !== profileName) {
            changes.name = profileName;
          }
          if (Object.keys(changes).length) await updateDoc(ref, changes);
        }
        if (profileName && alive) {
          setProfileSync((pending) => (pending?.uid === user.uid ? null : pending));
        }
      } catch (err) {
        console.error('Failed to synchronize the user profile.', err);
      }
    })();
    return onSnapshot(
      ref,
      (snap) => {
        if (alive) setProfile(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      },
      (err) => {
        console.error('Failed to listen to the user profile.', err);
        if (alive) setProfile(null);
      }
    );
  }, [user, isOwner, profileSync]);

  // Save the FCM token for push notifications (best effort).
  useEffect(() => {
    if (
      !user ||
      !profile ||
      profile.fcmToken ||
      typeof Notification === 'undefined' ||
      Notification.permission !== 'granted'
    ) {
      return;
    }
    registerPushToken(user.uid).catch((err) => {
      console.error('Failed to register the push notification token.', err);
    });
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
      let message = authErrorMessage(err);
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

  const signInWithEmail = useCallback(async (email, password) => {
    if (!auth) return { ok: false, error: t.errors.generic };
    setSigningIn(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: authErrorMessage(err) };
    } finally {
      setSigningIn(false);
    }
  }, []);

  const createAccount = useCallback(async ({ name, email, password }) => {
    if (!auth) return { ok: false, error: t.errors.generic };
    setSigningIn(true);
    try {
      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(credential.user, { displayName: name.trim() });
      setProfileSync({ uid: credential.user.uid, name: name.trim() });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: authErrorMessage(err) };
    } finally {
      setSigningIn(false);
    }
  }, []);

  const resetPassword = useCallback(async (email) => {
    if (!auth) return { ok: false, error: t.errors.generic };
    setSigningIn(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      return { ok: true };
    } catch (err) {
      return { ok: false, error: authErrorMessage(err) };
    } finally {
      setSigningIn(false);
    }
  }, []);

  const linkEmailPassword = useCallback(
    async (password) => {
      if (!auth || !user?.email) {
        return { ok: false, error: t.auth.linkPasswordRequiresSignIn };
      }
      setSigningIn(true);
      try {
        const credential = EmailAuthProvider.credential(user.email, password);
        const linked = await linkWithCredential(user, credential);
        setUser(linked.user);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: authErrorMessage(err) };
      } finally {
        setSigningIn(false);
      }
    },
    [user]
  );

  const changeEmailPassword = useCallback(
    async (currentPassword, newPassword) => {
      if (!auth || !user?.email) {
        return { ok: false, error: t.auth.linkPasswordRequiresSignIn };
      }
      setSigningIn(true);
      try {
        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        const freshUser = await reauthenticateWithCredential(user, credential);
        await updatePassword(freshUser.user, newPassword);
        setUser(freshUser.user);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: authErrorMessage(err) };
      } finally {
        setSigningIn(false);
      }
    },
    [user]
  );

  const linkGoogle = useCallback(async () => {
    if (!auth || !user) return { ok: false, error: t.auth.linkPasswordRequiresSignIn };
    setSigningIn(true);
    try {
      const linked = await linkWithPopup(user, googleProvider);
      setUser(linked.user);
      return { ok: true };
    } catch (err) {
      const code = err?.code || '';
      let error = authErrorMessage(err);
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        error = t.auth.popupClosed;
      } else if (code === 'auth/popup-blocked') {
        error = t.auth.popupBlocked;
      } else if (code === 'auth/unauthorized-domain') {
        error = t.auth.unauthorizedDomain;
      }
      return { ok: false, error };
    } finally {
      setSigningIn(false);
    }
  }, [user]);

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

  /** Save editable personal details on the current user's profile. */
  const saveProfile = useCallback(
    async ({ name, phone: inputPhone }) => {
      if (!user || !db) throw new Error('not signed in');
      const trimmedName = String(name || '').trim();
      if (trimmedName.length < 3 || trimmedName.length > 80) {
        throw new Error('invalid name');
      }
      const phone = inputPhone ? normalizePhone(inputPhone) : '';
      if (inputPhone && !phone) throw new Error('invalid phone');
      await updateDoc(doc(db, COLLECTIONS.USERS, user.uid), {
        name: trimmedName,
        phone,
        phoneAsked: true,
      });
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
      signInWithEmail,
      createAccount,
      resetPassword,
      linkEmailPassword,
      changeEmailPassword,
      linkGoogle,
      signOut,
      savePhone,
      saveProfile,
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
      signInWithEmail,
      createAccount,
      resetPassword,
      linkEmailPassword,
      changeEmailPassword,
      linkGoogle,
      signOut,
      savePhone,
      saveProfile,
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
