// Firebase function that runs every online table.
// Cards are shuffled and dealt here, so no player's browser ever holds anyone else's cards.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as E from './engine.js';

initializeApp();
const db = getFirestore();

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function roomCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

// Full game state lives in tables/{id}/secret/state (nobody can read it).
// Each player gets their own view at tables/{id}/views/{uid} (only they can read it).
function writeState(tx, st, extraUids = []) {
  const t = db.collection('tables').doc(st.id);
  tx.set(t.collection('secret').doc('state'), { json: JSON.stringify(st) });
  tx.set(t, {
    id: st.id, phase: st.phase, hostUid: st.hostUid,
    seated: st.seats.filter(Boolean).length,
    updatedAt: FieldValue.serverTimestamp(),
  });
  const uids = new Set([...st.seats.filter((s) => s && !s.bot).map((s) => s.uid), ...extraUids]);
  for (const u of uids) tx.set(t.collection('views').doc(u), { json: JSON.stringify(E.viewFor(st, u)) });
}

export const tp = onCall({ cors: true, maxInstances: 10, memory: '256MiB', concurrency: 40 }, async (req) => {
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first');
  const d = req.data || {};
  try {
    if (d.op === 'create') {
      for (let k = 0; k < 6; k++) {
        const id = roomCode();
        const ref = db.collection('tables').doc(id).collection('secret').doc('state');
        const view = await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          if (snap.exists) return null;
          const st = E.createTable(id, uid, d.name, d.settings);
          writeState(tx, st);
          return E.viewFor(st, uid);
        });
        if (view) return { tableId: id, view };
      }
      throw new Error('Could not make a room code. Try again.');
    }
    const id = String(d.tableId || '').toUpperCase().trim();
    const ref = db.collection('tables').doc(id).collection('secret').doc('state');
    // Send the caller's fresh view straight back, so their screen updates without waiting on the live listener.
    const view = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('Table not found. Check the code.');
      const st = JSON.parse(snap.data().json);
      E.dispatch(st, uid, d.action || {});
      E.runBots(st);
      writeState(tx, st, [uid]);
      return E.viewFor(st, uid);
    });
    return { ok: true, view };
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    throw new HttpsError('failed-precondition', (e && e.message) || 'Something went wrong');
  }
});
