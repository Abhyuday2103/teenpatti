// TriLux Blackjack rules engine, lifted unchanged from the page (index.html) so the server runs the exact same rules.
const E = (() => {
// Blackjack + TriLux rules engine. No dependencies.
// The same file runs in the browser (practice mode) and in the Firebase function (online tables).
// If you edit it, copy it to functions/engine.js too.
// All money values are integer cents.

const MAX_SEATS = 5;
const SUIT_SYM = { s: '♠', h: '♥', d: '♦', c: '♣' };
const RCH = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const rankLabel = (r) => RCH[r];
const cardLabel = (c) => RCH[c.r] + SUIT_SYM[c.s];
function money(cents) {
  const neg = cents < 0;
  const d = Math.abs(cents) / 100;
  return (neg ? '-' : '') + '$' + (Number.isInteger(d) ? String(d) : d.toFixed(2));
}
const BOT_NAMES = ['Ruiz', 'Pia', 'Omar', 'Jun', 'Tess', 'Dev', 'Nell'];
const fail = (m) => { throw new Error(m); };

// ---------- randomness ----------
function rand(n) {
  const c = globalThis.crypto;
  if (c && c.getRandomValues) { const a = new Uint32Array(1); c.getRandomValues(a); return a[0] % n; }
  return Math.floor(Math.random() * n);
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function newShoe(decks) {
  const d = [];
  for (let k = 0; k < decks; k++) for (const s of 'shdc') for (let r = 2; r <= 14; r++) d.push({ r, s });
  return shuffle(d);
}

// ---------- hand values ----------
const cardVal = (c) => (c.r === 14 ? 11 : c.r >= 10 ? 10 : c.r);
function handValue(cards) {
  let t = 0, a = 0;
  for (const c of cards) { if (!c) continue; t += cardVal(c); if (c.r === 14) a++; }
  while (t > 21 && a > 0) { t -= 10; a--; }
  return { total: t, soft: a > 0 && t <= 21 };
}
const isBlackjack = (h) => h.cards.length === 2 && !h.split && handValue(h.cards).total === 21;
function handLabel(h) {
  if (h.surrendered) return 'Surrendered';
  const v = handValue(h.cards);
  if (v.total > 21) return 'Bust ' + v.total;
  if (isBlackjack(h)) return 'Blackjack';
  return (v.soft && v.total !== 21 ? 'Soft ' : '') + v.total;
}

// ---------- TriLux ----------
// Both wagers read the player's first two cards plus the dealer up-card.
const PAYS_BONUS = [
  { key: 'sf', name: 'Straight flush', pay: 30 },
  { key: 'trips', name: 'Three of a kind', pay: 20 },
  { key: 'straight', name: 'Straight', pay: 10 },
  { key: 'flush', name: 'Flush', pay: 5 },
];
const PAYS_SUPER3 = [
  { key: 'suited3', name: 'Three-of-a-kind (suited)', pay: 270 },
  { key: 'sf', name: 'Straight flush', pay: 180 },
  { key: 'trips', name: 'Three-of-a-kind', pay: 90 },
];
function threeShape(a, b, up) {
  const suited = a.s === b.s && b.s === up.s;
  const sameRank = a.r === b.r && b.r === up.r;
  const x = [a.r, b.r, up.r].sort((p, q) => p - q);
  const run = (x[1] === x[0] + 1 && x[2] === x[1] + 1) || (x[0] === 2 && x[1] === 3 && x[2] === 14) || (x[0] === 12 && x[1] === 13 && x[2] === 14);
  return { suited, sameRank, run };
}
function evalBonus(a, b, up) {
  const f = threeShape(a, b, up);
  if (f.run && f.suited) return PAYS_BONUS[0];
  if (f.sameRank) return PAYS_BONUS[1];      // suited trips pays here too, it is the better line
  if (f.run) return PAYS_BONUS[2];
  if (f.suited) return PAYS_BONUS[3];
  return null;
}
function evalSuper3(a, b, up) {
  const f = threeShape(a, b, up);
  if (f.sameRank && f.suited) return PAYS_SUPER3[0];
  if (f.run && f.suited) return PAYS_SUPER3[1];
  if (f.sameRank) return PAYS_SUPER3[2];
  return null;
}

// ---------- the book ----------
// Basic strategy, rebuilt for whatever rules the table is running.
// Players can look it up; the bots play from it.
const row = (s) => s.trim().split(/\s+/);
const UPS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const UP_LABEL = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'];
const BASE_HARD = {
  5: row('H  H  H  H  H  H  H  H  H  H'), 6: row('H  H  H  H  H  H  H  H  H  H'),
  7: row('H  H  H  H  H  H  H  H  H  H'), 8: row('H  H  H  H  H  H  H  H  H  H'),
  9: row('H  Dh Dh Dh Dh H  H  H  H  H'), 10: row('Dh Dh Dh Dh Dh Dh Dh Dh H  H'),
  11: row('Dh Dh Dh Dh Dh Dh Dh Dh Dh Dh'), 12: row('H  H  S  S  S  H  H  H  H  H'),
  13: row('S  S  S  S  S  H  H  H  H  H'), 14: row('S  S  S  S  S  H  H  H  H  H'),
  15: row('S  S  S  S  S  H  H  H  Rh Rh'), 16: row('S  S  S  S  S  H  H  Rh Rh Rh'),
  17: row('S  S  S  S  S  S  S  S  S  Rs'), 18: row('S  S  S  S  S  S  S  S  S  S'),
  19: row('S  S  S  S  S  S  S  S  S  S'), 20: row('S  S  S  S  S  S  S  S  S  S'),
  21: row('S  S  S  S  S  S  S  S  S  S'),
};
const BASE_SOFT = {
  12: row('H  H  H  H  H  H  H  H  H  H'), 13: row('H  H  H  Dh Dh H  H  H  H  H'),
  14: row('H  H  H  Dh Dh H  H  H  H  H'), 15: row('H  H  Dh Dh Dh H  H  H  H  H'),
  16: row('H  H  Dh Dh Dh H  H  H  H  H'), 17: row('H  Dh Dh Dh Dh H  H  H  H  H'),
  18: row('Ds Ds Ds Ds Ds S  S  H  H  H'), 19: row('S  S  S  S  Ds S  S  S  S  S'),
  20: row('S  S  S  S  S  S  S  S  S  S'), 21: row('S  S  S  S  S  S  S  S  S  S'),
};
const BASE_PAIR = {
  11: row('P  P  P  P  P  P  P  P  P  P'), 10: row('S  S  S  S  S  S  S  S  S  S'),
  9: row('P  P  P  P  P  S  P  P  S  S'), 8: row('P  P  P  P  P  P  P  P  P  Rp'),
  7: row('P  P  P  P  P  P  H  H  H  H'), 6: row('P  P  P  P  P  H  H  H  H  H'),
  5: row('Dh Dh Dh Dh Dh Dh Dh Dh H  H'), 4: row('H  H  H  P  P  H  H  H  H  H'),
  3: row('P  P  P  P  P  P  H  H  H  H'), 2: row('P  P  P  P  P  P  H  H  H  H'),
};
function buildBook(S) {
  const cp = (o) => { const r = {}; for (const k in o) r[k] = o[k].slice(); return r; };
  const hard = cp(BASE_HARD), soft = cp(BASE_SOFT), pair = cp(BASE_PAIR);
  if (!S.h17) {
    hard[11][9] = 'H'; hard[15][9] = 'H'; hard[17][9] = 'S';
    soft[18][0] = 'S'; soft[19][4] = 'S'; pair[8][9] = 'P';
  }
  if (!S.das) { pair[2][0] = 'H'; pair[2][1] = 'H'; pair[3][0] = 'H'; pair[3][1] = 'H'; pair[4][3] = 'H'; pair[4][4] = 'H'; pair[6][0] = 'H'; }
  if (S.doubleOn !== 'any') {
    const lo = S.doubleOn === '1011' ? 10 : 9;
    const kill = (tbl, totalOf) => { for (const k in tbl) tbl[k] = tbl[k].map((c) => {
      const t = totalOf(k);
      return (c === 'Dh' || c === 'Ds') && (t < lo || t > 11) ? (c === 'Ds' ? 'S' : 'H') : c;
    }); };
    kill(hard, (k) => +k); kill(soft, () => 99); kill(pair, (k) => (+k === 5 ? 10 : 99));
  }
  if (!S.surrender) {
    const fix = (t) => { for (const k in t) t[k] = t[k].map((c) => (c === 'Rh' ? 'H' : c === 'Rs' ? 'S' : c === 'Rp' ? 'P' : c)); };
    fix(hard); fix(soft); fix(pair);
  }
  return { hard, soft, pair };
}
function bookCode(book, cards, up, splittable) {
  const v = handValue(cards), i = UPS.indexOf(up);
  if (splittable && cards.length === 2 && cardVal(cards[0]) === cardVal(cards[1])) return book.pair[cardVal(cards[0])][i];
  const t = v.soft ? book.soft : book.hard;
  return t[Math.min(21, Math.max(v.soft ? 12 : 5, v.total))][i];
}
function resolveCode(book, code, cards, up, can) {
  switch (code) {
    case 'S': return 'stand';
    case 'Dh': return can.double ? 'double' : 'hit';
    case 'Ds': return can.double ? 'double' : 'stand';
    case 'Rh': return can.surrender ? 'surrender' : 'hit';
    case 'Rs': return can.surrender ? 'surrender' : 'stand';
    case 'Rp': return can.surrender ? 'surrender' : (can.split ? 'split' : 'hit');
    case 'P':
      if (can.split) return 'split';
      return resolveCode(book, bookCode(book, cards, up, false), cards, up, { ...can, split: false });
    default: return 'hit';
  }
}
const bookMove = (book, cards, up, can) => resolveCode(book, bookCode(book, cards, up, can.split), cards, up, can);

// ---------- table setup ----------
function sanitizeSettings(s = {}) {
  const cents = (v, d) => { const n = Math.round(Number(v) * 100); return Number.isFinite(n) && n > 0 ? n : d; };
  const int = (v, d, lo, hi) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  const buyIn = cents(s.buyIn, 100000);
  const minBet = Math.min(cents(s.minBet, 500), buyIn);
  return {
    buyIn,
    minBet,
    maxBet: Math.max(minBet, cents(s.maxBet, 50000)),
    maxTriLux: Math.max(minBet, cents(s.maxTriLux, 10000)),
    decks: int(s.decks, 6, 1, 8),
    penetration: int(s.penetration, 75, 50, 90),
    h17: s.h17 !== false,
    das: s.das !== false,
    doubleOn: ['any', '911', '1011'].includes(s.doubleOn) ? s.doubleOn : 'any',
    surrender: s.surrender !== false,
    splitLimit: int(s.splitLimit, 3, 1, 4),          // how many times a hand may be split
    resplitAces: !!s.resplitAces,
    oneCardAces: s.oneCardAces !== false,
    blackjackPays: s.blackjackPays === '6:5' ? '6:5' : '3:2',
    triLux: s.triLux !== false,
  };
}
const bjMultiplier = (S) => (S.blackjackPays === '6:5' ? 1.2 : 1.5);
const cleanName = (n) => String(n || 'Player').replace(/[<>]/g, '').trim().slice(0, 14) || 'Player';
const seatOf = (st, uid) => st.seats.findIndex((s) => s && s.uid === uid);
const seatedCount = (st) => st.seats.filter(Boolean).length;
const nm = (st, i) => (st.seats[i] ? st.seats[i].name : `Seat ${i + 1}`);
function log(st, msg) { st.log.push(msg); if (st.log.length > 80) st.log.splice(0, st.log.length - 80); }

function createTable(id, hostUid, hostName, settings) {
  const st = {
    id, v: 1, hostUid, settings: sanitizeSettings(settings),
    seats: Array(MAX_SEATS).fill(null),
    phase: 'lobby', round: null, shoe: null, log: [], lastResult: null, roundNum: 0,
  };
  addSeat(st, hostUid, hostName, false);
  log(st, `${nm(st, 0)} opened the table.`);
  return st;
}
function addSeat(st, uid, name, bot) {
  const i = st.seats.findIndex((s) => !s);
  if (i < 0) fail(`Table is full (${MAX_SEATS} seats)`);
  st.seats[i] = { uid, name: cleanName(name), bot, stack: st.settings.buyIn, rebuys: 0, boughtIn: st.settings.buyIn, bet: null, ready: false };
  return i;
}
function removeSeat(st, i) {
  const s = st.seats[i];
  if (!s) return;
  const rd = st.round;
  if (rd && rd.players[i]) {
    const pos = rd.order.indexOf(i);
    const wasTurn = rd.turn === i;
    delete rd.players[i];
    rd.order = rd.order.filter((x) => x !== i);
    if (wasTurn) { rd.turn = -1; advanceTurn(st, pos > 0 ? rd.order[pos - 1] : -1); }
    else if (!rd.order.length && st.phase !== 'result' && st.phase !== 'lobby' && st.phase !== 'betting') finishRound(st);
  }
  st.seats[i] = null;
  log(st, `${s.name} left the table.`);
  if (s.uid === st.hostUid) {
    const h = st.seats.find((x) => x && !x.bot);
    if (h) { st.hostUid = h.uid; log(st, `${h.name} is the host now.`); }
  }
  if (seatedCount(st) < 1) { st.phase = 'lobby'; st.round = null; }
}

// ---------- shoe ----------
function ensureShoe(st, force) {
  const S = st.settings;
  if (force || !st.shoe || st.shoe.idx >= st.shoe.cut) {
    const cards = newShoe(S.decks);
    st.shoe = { cards, idx: 0, cut: Math.floor(cards.length * (S.penetration / 100)), size: cards.length };
    log(st, `Shuffle. New ${S.decks} deck shoe, cut card at ${S.penetration}%.`);
    return true;
  }
  return false;
}
function draw(st) {
  if (st.shoe.idx >= st.shoe.cards.length) ensureShoe(st, true);
  return st.shoe.cards[st.shoe.idx++];
}
const shoeLeft = (st) => (st.shoe ? st.shoe.cards.length - st.shoe.idx : 0);

// ---------- round ----------
const newHand = (bet, split) => ({ cards: [], bet, done: false, doubled: false, split: !!split, surrendered: false, result: null, delta: 0, settled: false });

function startBetting(st) {
  st.roundNum += 1;
  st.round = null;
  st.phase = 'betting';
  for (const s of st.seats) if (s) { s.ready = false; if (s.stack < st.settings.minBet) s.bet = null; }
  // bots put their chips out straight away
  for (let i = 0; i < MAX_SEATS; i++) {
    const s = st.seats[i];
    if (!s || !s.bot) continue;
    if (s.stack < st.settings.minBet) { s.bet = null; continue; }
    const units = [1, 1, 1, 2, 2, 4][rand(6)];
    const main = Math.min(s.stack, st.settings.minBet * units);
    let tri = 0, s3 = 0;
    if (st.settings.triLux && rand(100) < 45 && s.stack - main >= st.settings.minBet) {
      tri = Math.min(st.settings.minBet, st.settings.maxTriLux, s.stack - main);
      if (rand(100) < 50 && s.stack - main - tri >= st.settings.minBet) s3 = Math.min(st.settings.minBet, st.settings.maxTriLux, s.stack - main - tri);
    }
    s.bet = { main, tri, s3 };
    s.ready = true;
  }
  log(st, 'Place your bets.');
}

function dealRound(st) {
  const S = st.settings;
  const order = [];
  for (let i = 0; i < MAX_SEATS; i++) {
    const s = st.seats[i];
    if (!s || !s.bet || !s.ready) continue;
    const b = s.bet;
    if (b.main < S.minBet || b.main > S.maxBet) continue;
    if (b.main + b.tri + b.s3 > s.stack) continue;
    order.push(i);
  }
  if (!order.length) fail('Nobody has a bet down');
  ensureShoe(st, false);

  const players = {};
  for (const i of order) {
    const s = st.seats[i], b = s.bet;
    s.stack -= b.main + b.tri + b.s3;
    players[i] = {
      bets: { main: b.main, tri: b.tri, s3: b.s3 },
      hands: [newHand(b.main, false)], act: 0, splits: 0, splitAces: false,
      insurance: 0, insuranceAsked: false, bonusWin: null, super3Win: null, sidePaid: 0, net: 0,
    };
  }
  const rd = {
    num: st.roundNum, order, players, turn: -1,
    dealer: { cards: [], hole: null, holeUp: false },
  };
  st.round = rd;

  for (let pass = 0; pass < 2; pass++) {
    for (const i of order) players[i].hands[0].cards.push(draw(st));
    if (pass === 0) rd.dealer.cards.push(draw(st));
    else rd.dealer.hole = draw(st);
  }
  log(st, `Round ${rd.num}. Dealer shows ${cardLabel(rd.dealer.cards[0])}.`);

  resolveTriLux(st);

  const up = cardVal(rd.dealer.cards[0]);
  const wantsInsurance = up === 11 && order.some((i) => !st.seats[i].bot && st.seats[i].stack >= Math.floor(players[i].hands[0].bet / 2));
  if (wantsInsurance) { st.phase = 'insurance'; log(st, 'Dealer shows an ace. Insurance is open.'); return; }
  peek(st);
}

function resolveTriLux(st) {
  const rd = st.round, up = rd.dealer.cards[0];
  for (const i of rd.order) {
    const p = rd.players[i];
    if (!p.bets.tri && !p.bets.s3) continue;
    const [a, b] = p.hands[0].cards;
    let back = 0;
    if (p.bets.tri) { const w = evalBonus(a, b, up); if (w) { back += p.bets.tri * (w.pay + 1); p.bonusWin = w; } }
    if (p.bets.s3) { const w = evalSuper3(a, b, up); if (w) { back += p.bets.s3 * (w.pay + 1); p.super3Win = w; } }
    p.sidePaid = back;
    st.seats[i].stack += back;
    p.net += back - (p.bets.tri + p.bets.s3);
    if (p.bonusWin || p.super3Win) {
      const parts = [];
      if (p.super3Win) parts.push(`Super 3 ${p.super3Win.name} ${p.super3Win.pay} to 1`);
      if (p.bonusWin) parts.push(`TriLux Bonus ${p.bonusWin.name} ${p.bonusWin.pay} to 1`);
      log(st, `${nm(st, i)} hits ${parts.join(' and ')} for ${money(back)}.`);
    }
  }
}

function peek(st) {
  const rd = st.round, up = cardVal(rd.dealer.cards[0]);
  if ((up === 11 || up === 10) && handValue([rd.dealer.cards[0], rd.dealer.hole]).total === 21) {
    revealHole(st);
    log(st, 'Dealer has blackjack.');
    finishRound(st);
    return;
  }
  st.phase = 'playing';
  rd.turn = -1;
  advanceTurn(st, -1);
}
function revealHole(st) {
  const rd = st.round;
  if (rd.dealer.holeUp) return;
  rd.dealer.cards.push(rd.dealer.hole);
  rd.dealer.holeUp = true;
}

function canFor(st, i, h) {
  const S = st.settings, p = st.round.players[i], s = st.seats[i];
  const first = h.cards.length === 2;
  const v = handValue(h.cards);
  // the pair this hand is showing right now, 0 if it is not a pair
  const pairVal = first && cardVal(h.cards[0]) === cardVal(h.cards[1]) ? cardVal(h.cards[0]) : 0;
  // a hand dealt from a split pair of aces takes one card and is finished, when that rule is on
  const frozenAce = p.splitAces && h.split && S.oneCardAces;
  const totalOk = S.doubleOn === 'any' ? true : (!v.soft && v.total >= (S.doubleOn === '1011' ? 10 : 9) && v.total <= 11);
  return {
    double: first && !frozenAce && s.stack >= h.bet && totalOk && (!h.split || S.das),
    split: !!pairVal && p.splits < S.splitLimit && s.stack >= h.bet &&
           (pairVal !== 11 || !p.splitAces || S.resplitAces),
    surrender: S.surrender && first && !h.split && p.hands.length === 1 && !p.insurance,
  };
}

function liveHand(st, i) {
  const p = st.round.players[i];
  if (!p) return null;
  while (p.act < p.hands.length) {
    const h = p.hands[p.act];
    if (h.done) { p.act++; continue; }
    if (h.cards.length === 1) h.cards.push(draw(st));          // the second card of a split hand
    const S = st.settings;
    if (p.splitAces && h.split && S.oneCardAces && !canFor(st, i, h).split) { h.done = true; p.act++; continue; }
    if (handValue(h.cards).total >= 21) { h.done = true; p.act++; continue; }
    return h;
  }
  return null;
}

function advanceTurn(st, from) {
  const rd = st.round;
  if (!rd) return;
  const start = rd.order.indexOf(from);
  for (let k = start + 1; k < rd.order.length; k++) {
    const i = rd.order[k];
    if (!rd.players[i]) continue;
    rd.players[i].act = 0;
    if (liveHand(st, i)) { rd.turn = i; return; }
  }
  rd.turn = -1;
  dealerPlay(st);
}

function playMove(st, i, move) {
  const rd = st.round, p = rd.players[i], s = st.seats[i];
  const h = liveHand(st, i);
  if (!h) { advanceTurn(st, i); return; }
  const can = canFor(st, i, h);
  if (move === 'double' && !can.double) fail('You cannot double this hand');
  if (move === 'split' && !can.split) fail('You cannot split this hand');
  if (move === 'surrender' && !can.surrender) fail('You cannot surrender this hand');

  if (move === 'hit') {
    h.cards.push(draw(st));
    if (handValue(h.cards).total > 21) { h.done = true; log(st, `${nm(st, i)} busts with ${handValue(h.cards).total}.`); }
  } else if (move === 'stand') {
    h.done = true;
  } else if (move === 'double') {
    s.stack -= h.bet; h.bet *= 2; h.doubled = true;
    h.cards.push(draw(st)); h.done = true;
    const v = handValue(h.cards).total;
    log(st, `${nm(st, i)} doubles for ${money(h.bet)}${v > 21 ? ' and busts' : ''}.`);
  } else if (move === 'split') {
    const moved = h.cards.pop();
    const nh = newHand(h.bet, true);
    nh.cards.push(moved);
    h.split = true;
    p.hands.splice(p.act + 1, 0, nh);
    p.splits += 1;
    if (cardVal(moved) === 11) p.splitAces = true;
    s.stack -= h.bet;
    log(st, `${nm(st, i)} splits ${rankLabel(moved.r)}s (${p.hands.length} hands).`);
  } else if (move === 'surrender') {
    h.surrendered = true; h.done = true;
    log(st, `${nm(st, i)} surrenders.`);
  } else fail('Unknown move');

  if (!liveHand(st, i)) advanceTurn(st, i);
}

function dealerPlay(st) {
  const rd = st.round, S = st.settings;
  st.phase = 'dealer';
  revealHole(st);
  const anyLive = rd.order.some((i) => rd.players[i] && rd.players[i].hands.some((h) => !h.surrendered && handValue(h.cards).total <= 21));
  if (anyLive) {
    for (let guard = 0; guard < 25; guard++) {
      const v = handValue(rd.dealer.cards);
      const mustHit = v.total < 17 || (v.total === 17 && v.soft && S.h17);
      if (!mustHit) break;
      rd.dealer.cards.push(draw(st));
    }
    const v = handValue(rd.dealer.cards);
    log(st, v.total > 21 ? `Dealer busts with ${v.total}.` : `Dealer has ${v.total}.`);
  } else {
    log(st, 'No live hands. The dealer does not draw.');
  }
  finishRound(st);
}

function finishRound(st) {
  const rd = st.round, S = st.settings;
  revealHole(st);
  const dealerHand = { cards: rd.dealer.cards, split: false, surrendered: false };
  const dealerBJ = rd.dealer.cards.length === 2 && handValue(rd.dealer.cards).total === 21;
  const dt = handValue(rd.dealer.cards).total;
  const rows = [];
  for (const i of rd.order) {
    const p = rd.players[i];
    if (!p) continue;
    const s = st.seats[i];
    if (p.insurance) {
      if (dealerBJ) { s.stack += p.insurance * 3; p.net += p.insurance * 2; }
      else p.net -= p.insurance;
    }
    for (const h of p.hands) {
      const pt = handValue(h.cards).total;
      let back = 0;
      if (h.surrendered) { back = Math.floor(h.bet / 2); h.result = 'surrender'; }
      else if (pt > 21) { back = 0; h.result = 'lose'; }
      else if (isBlackjack(h)) {
        if (dealerBJ) { back = h.bet; h.result = 'push'; }
        else { back = h.bet + Math.floor(h.bet * bjMultiplier(S)); h.result = 'blackjack'; }
      } else if (dealerBJ) { back = 0; h.result = 'lose'; }
      else if (dt > 21 || pt > dt) { back = h.bet * 2; h.result = 'win'; }
      else if (pt === dt) { back = h.bet; h.result = 'push'; }
      else { back = 0; h.result = 'lose'; }
      h.delta = back - h.bet;
      h.settled = true;
      s.stack += back;
      p.net += h.delta;
    }
    rows.push({ seat: i, name: s.name, net: p.net, hands: p.hands.map((h) => ({ cards: h.cards, label: handLabel(h), result: h.result, bet: h.bet, delta: h.delta })), bonusWin: p.bonusWin, super3Win: p.super3Win, insurance: p.insurance });
  }
  st.lastResult = {
    num: rd.num,
    dealer: { cards: rd.dealer.cards, label: handLabel(dealerHand) },
    rows,
  };
  st.phase = 'result';
  rd.turn = -1;
}

// ---------- rebuys ----------
function rebuyInfo(st, seat) {
  if (seat < 0 || !st.seats[seat]) return { allowed: false };
  const s = st.seats[seat];
  const left = 3 - s.rebuys;
  let reason = null;
  if (left <= 0) reason = 'No rebuys left';
  else if (st.round && st.round.players[seat] && st.phase !== 'result') reason = 'Wait for the hand to finish';
  return { allowed: !reason, reason, left, max: st.settings.buyIn * 2 };
}

// ---------- what a seat may do right now ----------
// The UI and the bots both read this. Nothing else decides what is legal.
function actionsFor(st, seat) {
  const out = { rebuy: rebuyInfo(st, seat) };
  if (seat < 0 || !st.seats[seat]) return out;
  const s = st.seats[seat], S = st.settings;
  const isHost = s.uid === st.hostUid;
  out.isHost = isHost;
  out.canStart = isHost && st.phase === 'lobby' && seatedCount(st) >= 1;
  out.canEditSettings = isHost && st.phase === 'lobby';
  out.canEditRules = isHost && (st.phase === 'lobby' || st.phase === 'betting' || st.phase === 'result');
  out.canManageSeats = isHost && st.phase !== 'playing' && st.phase !== 'dealer' && st.phase !== 'insurance';
  out.canDealNext = isHost && st.phase === 'result';

  if (st.phase === 'betting') {
    const open = Math.max(0, s.stack);
    out.bet = {
      min: S.minBet, max: Math.min(S.maxBet, open), maxTriLux: Math.min(S.maxTriLux, open),
      current: s.bet || { main: 0, tri: 0, s3: 0 }, ready: s.ready,
      canBet: s.stack >= S.minBet, triLux: S.triLux,
    };
  }
  const rd = st.round;
  if (!rd) return out;
  const p = rd.players[seat];
  if (!p) return out;

  if (st.phase === 'insurance' && !p.insuranceAsked) {
    const cost = Math.floor(p.hands[0].bet / 2);
    out.insurance = { cost, canTake: s.stack >= cost };
  }
  if (isHost && (st.phase === 'playing' || st.phase === 'insurance')) {
    const target = st.phase === 'insurance'
      ? rd.order.find((i) => rd.players[i] && !rd.players[i].insuranceAsked && !st.seats[i].bot)
      : rd.turn;
    if (target !== undefined && target >= 0 && target !== seat && st.seats[target] && !st.seats[target].bot) out.afkTarget = target;
  }
  if (st.phase !== 'playing' || rd.turn !== seat) return out;
  const h = p.hands[p.act];
  if (!h || h.done) return out;
  const can = canFor(st, seat, h);
  out.move = {
    hand: p.act, of: p.hands.length,
    hit: true, stand: true,
    double: can.double, split: can.split, surrender: can.surrender,
    bet: h.bet, label: handLabel(h),
  };
  return out;
}

// ---------- actions ----------
function applyAction(st, seat, uid, a) {
  const t = a && a.type;
  const isHost = uid === st.hostUid;
  const S = st.settings;
  switch (t) {
    case 'join': {
      if (seat >= 0) { if (a.name) st.seats[seat].name = cleanName(a.name); return; }
      const i = addSeat(st, uid, a.name, false);
      log(st, `${nm(st, i)} sat down.${st.phase !== 'lobby' ? ' Dealt in from the next hand.' : ''}`);
      return;
    }
    case 'leave': if (seat >= 0) removeSeat(st, seat); return;
    case 'settings': {
      if (!isHost) fail('Only the host can change the table');
      if (st.phase === 'playing' || st.phase === 'dealer' || st.phase === 'insurance') fail('Rules unlock between hands');
      const before = st.settings;
      st.settings = sanitizeSettings({ ...before, ...a.settings });
      if (st.phase === 'lobby') {
        st.seats.forEach((x) => { if (x) { x.stack = st.settings.buyIn; x.boughtIn = st.settings.buyIn; x.rebuys = 0; } });
      }
      if (st.settings.decks !== before.decks || st.settings.penetration !== before.penetration) ensureShoe(st, true);
      st.seats.forEach((x) => { if (x) x.ready = false; });
      log(st, 'Host changed the table rules.');
      return;
    }
    case 'addBot': {
      if (!isHost) fail('Only the host can add computer players');
      if (st.phase === 'playing' || st.phase === 'dealer' || st.phase === 'insurance') fail('Wait for the hand to finish');
      const used = new Set(st.seats.filter(Boolean).map((x) => x.name));
      const name = BOT_NAMES.find((n) => !used.has(n)) || 'Bot';
      const i = addSeat(st, 'bot-' + Math.random().toString(36).slice(2, 9), name, true);
      log(st, `${name} joined at seat ${i + 1}.`);
      return;
    }
    case 'removeBot': {
      if (!isHost) fail('Only the host can remove computer players');
      const x = st.seats[a.seat];
      if (!x || !x.bot) fail('That seat is not a computer player');
      if (st.phase === 'playing' || st.phase === 'dealer' || st.phase === 'insurance') fail('Wait for the hand to finish');
      removeSeat(st, a.seat);
      return;
    }
    case 'start': {
      if (!isHost) fail('Only the host can start');
      if (st.phase !== 'lobby') fail('Already started');
      if (seatedCount(st) < 1) fail('Somebody has to sit down first');
      ensureShoe(st, true);
      startBetting(st);
      return;
    }
    case 'bet': {
      if (st.phase !== 'betting') fail('Betting is closed');
      if (seat < 0) fail('You are not seated');
      const s = st.seats[seat];
      if (s.ready) fail('Your bet is already in');
      const n = (v) => Math.max(0, Math.round(Number(v) || 0));
      let main = Math.min(n(a.main), S.maxBet);
      let tri = S.triLux ? Math.min(n(a.tri), S.maxTriLux) : 0;
      let s3 = S.triLux ? Math.min(n(a.s3), S.maxTriLux) : 0;
      if (tri <= 0) s3 = 0;                                     // Super 3 needs the Bonus beside it
      if (main + tri + s3 > s.stack) fail('That is more than your stack');
      s.bet = { main, tri, s3 };
      if (a.ready) return applyAction(st, seat, uid, { type: 'ready', on: true });
      return;
    }
    case 'ready': {
      if (st.phase !== 'betting') fail('Betting is closed');
      if (seat < 0) fail('You are not seated');
      const s = st.seats[seat];
      if (!a.on) { s.ready = false; return; }
      if (!s.bet || s.bet.main < S.minBet) fail(`Minimum bet is ${money(S.minBet)}`);
      if (s.bet.main > S.maxBet) fail(`Maximum bet is ${money(S.maxBet)}`);
      if (s.bet.s3 > 0 && s.bet.tri <= 0) fail('Super 3 needs a TriLux Bonus wager beside it');
      if (s.bet.main + s.bet.tri + s.bet.s3 > s.stack) fail('That is more than your stack');
      s.ready = true;
      const waiting = st.seats.some((x) => x && !x.ready && x.stack >= S.minBet);
      if (!waiting) dealRound(st);
      return;
    }
    case 'deal': {
      if (!isHost) fail('Only the host can deal');
      if (st.phase !== 'betting') fail('Not time to deal');
      dealRound(st);
      return;
    }
    case 'move': {
      if (st.phase !== 'playing') fail('Not your turn');
      if (seat < 0 || st.round.turn !== seat) fail('Not your turn');
      playMove(st, seat, a.move);
      return;
    }
    case 'insurance': {
      if (st.phase !== 'insurance') fail('Insurance is closed');
      const p = st.round.players[seat];
      if (!p) fail('You are not in this hand');
      if (p.insuranceAsked) fail('Already answered');
      p.insuranceAsked = true;
      if (a.take) {
        const cost = Math.floor(p.hands[0].bet / 2);
        if (st.seats[seat].stack < cost) fail('Not enough chips for insurance');
        st.seats[seat].stack -= cost;
        p.insurance = cost;
        log(st, `${nm(st, seat)} takes insurance for ${money(cost)}.`);
      }
      closeInsurance(st);
      return;
    }
    case 'rebuy': {
      if (seat < 0) fail('You are not seated');
      const info = rebuyInfo(st, seat);
      if (!info.allowed) fail(info.reason);
      const amt = Math.round(Number(a.amount) * 100);
      if (!(amt > 0)) fail('Enter an amount');
      if (amt > info.max) fail(`Max rebuy is ${money(info.max)}`);
      const s = st.seats[seat];
      s.stack += amt; s.boughtIn += amt; s.rebuys += 1;
      log(st, `${s.name} buys in for ${money(amt)} (${3 - s.rebuys} left).`);
      return;
    }
    case 'next': {
      if (!isHost) fail('Only the host can start the next hand');
      if (st.phase !== 'result') fail('Hand is still live');
      startBetting(st);
      return;
    }
    case 'afk': {
      if (!isHost) fail('Only the host can do that');
      if (st.phase === 'insurance') {
        const i = st.round.order.find((x) => st.round.players[x] && !st.round.players[x].insuranceAsked);
        if (i === undefined) fail('Nobody to skip');
        st.round.players[i].insuranceAsked = true;
        log(st, `Host declined insurance for ${nm(st, i)} (away).`);
        closeInsurance(st);
        return;
      }
      if (st.phase !== 'playing') fail('Nothing to skip');
      const i = st.round.turn;
      log(st, `Host stood ${nm(st, i)} (away).`);
      playMove(st, i, 'stand');
      return;
    }
    default: fail('Unknown action');
  }
}
function closeInsurance(st) {
  const rd = st.round;
  const pending = rd.order.some((i) => rd.players[i] && !rd.players[i].insuranceAsked && !st.seats[i].bot);
  if (!pending) {
    for (const i of rd.order) if (rd.players[i]) rd.players[i].insuranceAsked = true;
    peek(st);
  }
}

function dispatch(st, uid, a) {
  const seat = seatOf(st, uid);
  applyAction(st, seat, uid, a);
  st.v += 1;
  return st;
}

// ---------- bots ----------
// Bots read actionsFor and play the book. They never see the hole card.
function runBots(st, max = 1) {
  let n = 0;
  for (let guard = 0; guard < 40 && n < max; guard++) {
    const rd = st.round;
    let did = false;
    if (st.phase === 'insurance' && rd) {
      const i = rd.order.find((x) => rd.players[x] && !rd.players[x].insuranceAsked && st.seats[x].bot);
      if (i !== undefined) { applyAction(st, i, st.seats[i].uid, { type: 'insurance', take: false }); did = true; }
    } else if (st.phase === 'playing' && rd && rd.turn >= 0 && st.seats[rd.turn] && st.seats[rd.turn].bot) {
      const i = rd.turn, p = rd.players[i], h = p.hands[p.act];
      if (h) {
        const book = buildBook(st.settings);
        const move = bookMove(book, h.cards, cardVal(rd.dealer.cards[0]), canFor(st, i, h));
        applyAction(st, i, st.seats[i].uid, { type: 'move', move });
        did = true;
      }
    }
    if (!did) break;
    n += 1;
    st.v += 1;
  }
  return n;
}

// ---------- the per-player view ----------
// This is all a browser is ever told. The shoe and the hole card stay on the server.
function viewFor(st, uid) {
  const me = seatOf(st, uid);
  const rd = st.round;
  const seats = st.seats.map((s, i) => {
    if (!s) return null;
    const o = { seat: i, name: s.name, bot: s.bot, stack: s.stack, rebuys: s.rebuys, boughtIn: s.boughtIn, host: s.uid === st.hostUid, me: i === me, ready: s.ready };
    if (st.phase === 'betting') o.bet = s.bet;
    const p = rd && rd.players[i];
    if (p) {
      o.bets = p.bets;
      o.insurance = p.insurance;
      o.bonusWin = p.bonusWin;
      o.super3Win = p.super3Win;
      o.net = st.phase === 'result' ? p.net : null;
      o.act = p.act;
      o.hands = p.hands.map((h) => ({
        cards: h.cards, bet: h.bet, done: h.done, doubled: h.doubled, split: h.split,
        surrendered: h.surrendered, result: h.result, delta: h.delta, label: handLabel(h),
        value: handValue(h.cards).total,
      }));
    }
    return o;
  });
  let round = null;
  if (rd) {
    const cards = rd.dealer.cards.slice();
    if (!rd.dealer.holeUp) cards.push(null);                 // the hole card is not in this payload at all
    round = {
      num: rd.num, turn: rd.turn, order: rd.order,
      dealer: { cards, holeUp: rd.dealer.holeUp, up: cardVal(rd.dealer.cards[0]), value: rd.dealer.holeUp ? handValue(rd.dealer.cards).total : null, label: rd.dealer.holeUp ? handLabel({ cards: rd.dealer.cards, split: false, surrendered: false }) : null },
    };
  }
  return {
    id: st.id, v: st.v, me, phase: st.phase, settings: st.settings, seats, round,
    shoe: { left: shoeLeft(st), size: st.shoe ? st.shoe.size : 0, cut: st.shoe ? st.shoe.cut : 0, dealt: st.shoe ? st.shoe.idx : 0 },
    log: st.log.slice(-40), lastResult: st.lastResult, roundNum: st.roundNum,
    actions: actionsFor(st, me),
    book: buildBook(st.settings),
    pays: { bonus: PAYS_BONUS, super3: PAYS_SUPER3 },
    maxSeats: MAX_SEATS,
  };
}

const API = {
  MAX_SEATS, SUIT_SYM, rankLabel, cardLabel, money, handValue, handLabel, isBlackjack, cardVal,
  PAYS_BONUS, PAYS_SUPER3, evalBonus, evalSuper3,
  buildBook, bookMove, bookCode, UPS, UP_LABEL,
  sanitizeSettings, seatOf, createTable, actionsFor, dispatch, applyAction, runBots, viewFor,
  startBetting, dealRound, shoeLeft,
};
// (module.exports line removed for ES module use)

return API;
})();

export default E;
