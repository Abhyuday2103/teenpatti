// TriLux Blackjack online tables. Same pattern as the other games: the server shuffles and deals,
// keeps the shoe and the dealer's hole card, and writes each player only their own view.
//   bjtables/{code}               public summary
//   bjtables/{code}/secret/state  full table, shoe included. Nobody's browser can read it.
//   bjtables/{code}/views/{uid}   what that one player may see
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import E from './engine.js';

initializeApp();
const db = getFirestore();
const COL = 'bjtables';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function roomCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}
function writeState(tx, st, extraUids = []) {
  const t = db.collection(COL).doc(st.id);
  tx.set(t.collection('secret').doc('state'), { json: JSON.stringify(st) });
  tx.set(t, { id: st.id, phase: st.phase, hostUid: st.hostUid, seated: st.seats.filter(Boolean).length, updatedAt: FieldValue.serverTimestamp() });
  const uids = new Set([...st.seats.filter((s) => s && !s.bot).map((s) => s.uid), ...extraUids]);
  for (const u of uids) tx.set(t.collection('views').doc(u), { json: JSON.stringify(E.viewFor(st, u)) });
}

export const bj = onCall({ cors: true, maxInstances: 10 }, async (req) => {
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first');
  const d = req.data || {};
  try {
    if (d.op === 'create') {
      for (let k = 0; k < 6; k++) {
        const id = roomCode();
        const ref = db.collection(COL).doc(id).collection('secret').doc('state');
        const view = await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          if (snap.exists) return null;
          const st = E.createTable(id, uid, d.name, d.settings);
          // The page has no lobby screen for online tables (practice starts itself the same way), so open betting now.
          E.dispatch(st, uid, { type: 'start' });
          writeState(tx, st);
          return E.viewFor(st, uid);
        });
        if (view) return { tableId: id, view };
      }
      throw new Error('Could not make a table code. Try again.');
    }
    const id = String(d.tableId || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!id) throw new Error('Type the table code.');
    const ref = db.collection(COL).doc(id).collection('secret').doc('state');
    const action = d.op === 'join' ? { type: 'join', name: d.name } : (d.action || {});
    const view = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('No table with that code. Check it and try again.');
      const st = JSON.parse(snap.data().json);
      E.dispatch(st, uid, action);
      // Computer players finish their turns right away; nothing else asks the server to move them.
      E.runBots(st, 60);
      writeState(tx, st, [uid]);
      return E.viewFor(st, uid);
    });
    return { ok: true, tableId: id, view };
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    throw new HttpsError('failed-precondition', (e && e.message) || 'Something went wrong');
  }
});
