/**
 * Email/password authentication and same-UID provider linking against Auth emulator.
 */
import './helpers.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  linkWithCredential,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';

import { auth } from './helpers.mjs';

test('email accounts can register, sign in, reset password, and reject duplicates', async () => {
  const email = 'manual-auth-test@example.com';
  const password = 'safe-test-password-2026';
  const created = await createUserWithEmailAndPassword(auth, email, password);
  const uid = created.user.uid;

  assert.ok(uid);
  await sendPasswordResetEmail(auth, email);
  await assert.rejects(
    createUserWithEmailAndPassword(auth, email, password),
    (error) => error.code === 'auth/email-already-in-use'
  );

  await signOut(auth);
  const signedIn = await signInWithEmailAndPassword(auth, email, password);
  assert.equal(signedIn.user.uid, uid);
  await signOut(auth);
});

test('linking email/password to an existing identity keeps its UID', async () => {
  const email = 'linked-auth-test@example.com';
  const password = 'safe-linked-password-2026';
  const anonymous = await signInAnonymously(auth);
  const uid = anonymous.user.uid;
  const linked = await linkWithCredential(
    anonymous.user,
    EmailAuthProvider.credential(email, password)
  );

  assert.equal(linked.user.uid, uid);
  await signOut(auth);
  const signedIn = await signInWithEmailAndPassword(auth, email, password);
  assert.equal(signedIn.user.uid, uid);
  await signOut(auth);
});
