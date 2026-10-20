// Teen Patti rules engine. No dependencies.
// The same file runs in the browser (practice mode) and in the Firebase function (online tables).
// If you edit it, copy it to functions/engine.js too.
// All money values are integer cents.

export const MAX_SEATS = 7;
export const SUIT_SYM = { s: '♠', h: '♥', d: '♦', c: '♣' };
const RCH = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const RPL = { 2: 'Twos', 3: 'Threes', 4: 'Fours', 5: 'Fives', 6: 'Sixes', 7: 'Sevens', 8: 'Eights', 9: 'Nines', 10: 'Tens', 11: 'Jacks', 12: 'Queens', 13: 'Kings', 14: 'Aces' };
export const rankLabel = (r) => RCH[r];
export const cardLabel = (c) => RCH[c.r] + SUIT_SYM[c.s];
export function money(cents) {
  const neg = cents < 0;
  const d = Math.abs(cents) / 100;
  return (neg ? '-' : '') + '$' + (Number.isInteger(d) ? String(d) : d.toFixed(2));
}

export const VARIATIONS = [
  { key: 'classic', name: 'Classic', short: 'Normal 3 cards. Best hand wins.' },
  { key: 'muflis', name: 'Muflis', short: 'Rankings flip. Lowest hand wins. A-2-3 is a sequence, so it is a bad hand.' },
  { key: 'mahalaxmi', name: 'Maha Laxmi', short: 'J little, Q little, K little on repeat. One boot, one pot. First to win all three takes the pot. Blinds capped at 2. No rebuys once dealt.' },
  { key: 'ak47', name: 'AK47', short: 'Every A, K, 4 and 7 is a joker.' },
  { key: 'love1942', name: '1942 Love Story', short: 'A, 9, 4, 2 and every heart are jokers.' },
  { key: 'hate1947', name: '1947 Hate Story', short: 'A, 9, 4, 7 and every spade are jokers.' },
  { key: 'mystery', name: 'Mystery Card', short: 'One card flips from the deck. Every card of that rank is a joker.' },
  { key: 'littlejoker', name: 'Little Joker', short: 'Lowest card in your hand is a joker. Ace is dynamic.' },
  { key: 'biggerjoker', name: 'Bigger Joker', short: 'Highest card in your hand is a joker. Ace is dynamic.' },
  { key: 'p999', name: '999', short: 'Make the 3 digit number closest to 999. A = 1, 10 and face cards = 0.' },
  { key: 'four', name: '4 Card', short: 'Get 4 cards, play your best 3.' },
  { key: 'five', name: '5 Card', short: 'Get 5 cards, play your best 3.' },
  { key: 'faceup', name: 'Face Up', short: 'Dealer picks 1 or 2 of each hand to deal face up.' },
  { key: 'exchange', name: 'Draw / Exchange', short: 'Once per round, swap one card with the deck on your turn. Free.' },
  { key: 'ccb_noblind', name: 'Card Color Burst (no blinds)', short: '3 center cards open. Card = that number is a joker. Color = that suit is a joker. Burst = holding that number folds you. Everyone plays seen.' },
  { key: 'ccb_blind', name: 'Card Color Burst (blinds)', short: 'Same as above, blind play allowed. A burst only hits when you see your cards.' },
  { key: 'jua', name: 'Jua', short: 'Players + 1 center cards. Each turn flip (1x boot) or fix (2x boot). Fixed numbers are jokers for everyone. Then normal betting.' },
];
const VMAP = Object.fromEntries(VARIATIONS.map((v) => [v.key, v]));
export const variationName = (k) => (VMAP[k] ? VMAP[k].name : k);
const BOT_NAMES = ['Raju', 'Pinky', 'Chintu', 'Bunty', 'Golu', 'Sweety', 'Monty', 'Babloo', 'Dolly', 'Tinku'];

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
const ALL_CARDS = (() => { const d = []; for (const s of 'shdc') for (let r = 2; r <= 14; r++) d.push({ r, s }); return d; })();
function newDeck() { return shuffle(ALL_CARDS.map((c) => ({ ...c }))); }

// ---------- hand ranking ----------
// Score arrays compare left to right. Bigger is better.
// [6,r] trail, [5,v] pure sequence, [4,v] sequence, [3,h,m,l] color, [2,pair,kicker] pair, [1,h,m,l] high card
export function cmpScore(a, b) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) { const x = a[i] ?? 0, y = b[i] ?? 0; if (x !== y) return x > y ? 1 : -1; }
  return 0;
}
function seqVal(rs, a23High) {
  const [a, b, c] = rs;
  if (a === 14 && b === 13 && c === 12) return a23High ? 14 : 15;
  if (a === 14 && b === 3 && c === 2) return a23High ? 15 : 14;
  if (a - b === 1 && b - c === 1) return a;
  return 0;
}
export function eval3(cards, a23High) {
  const rs = cards.map((c) => c.r).sort((x, y) => y - x);
  const flush = cards[0].s === cards[1].s && cards[1].s === cards[2].s;
  if (rs[0] === rs[2]) return [6, rs[0]];
  const sv = seqVal(rs, a23High);
  if (sv) return [flush ? 5 : 4, sv];
  if (flush) return [3, ...rs];
  if (rs[0] === rs[1]) return [2, rs[0], rs[2]];
  if (rs[1] === rs[2]) return [2, rs[1], rs[0]];
  return [1, ...rs];
}
function combos(n, k) {
  const out = [];
  const rec = (start, acc) => {
    if (acc.length === k) { out.push(acc.slice()); return; }
    for (let i = start; i < n; i++) { acc.push(i); rec(i + 1, acc); acc.pop(); }
  };
  rec(0, []);
  return out;
}
function bestOfN(cards, a23High) {
  if (cards.length === 3) return { score: eval3(cards, a23High), cards };
  let best = null;
  for (const ix of combos(cards.length, 3)) {
    const h = ix.map((i) => cards[i]);
    const s = eval3(h, a23High);
    if (!best || cmpScore(s, best.score) > 0) best = { score: s, cards: h };
  }
  return best;
}
// Best 3 card hand when some cards are jokers. A joker can be any card.
function wild3(cards, flags, a23High) {
  const nat = cards.filter((c, i) => !flags[i]);
  const j = cards.length - nat.length;
  if (j === 0) return { score: eval3(cards, a23High), cards };
  if (j >= 3) return { score: [6, 14], cards: [{ r: 14, s: 's' }, { r: 14, s: 'h' }, { r: 14, s: 'd' }] };
  if (j === 2) {
    const r = nat[0].r;
    return { score: [6, r], cards: [nat[0], ...'shdc'.split('').filter((s) => s !== nat[0].s).slice(0, 2).map((s) => ({ r, s }))] };
  }
  let best = null;
  for (const c of ALL_CARDS) {
    const h = [...nat, c];
    const s = eval3(h, a23High);
    if (!best || cmpScore(s, best.score) > 0) best = { score: s, cards: h };
  }
  return best;
}
function seqName(v, a23High) {
  if (v === 15) return a23High ? 'A-2-3' : 'A-K-Q';
  if (v === 14) return a23High ? 'A-K-Q' : 'A-2-3';
  return `${RCH[v]}-${RCH[v - 1]}-${RCH[v - 2]}`;
}
export function describe(s, a23High) {
  switch (s[0]) {
    case 6: return `Trail of ${RPL[s[1]]}`;
    case 5: return `Pure sequence ${seqName(s[1], a23High)}`;
    case 4: return `Sequence ${seqName(s[1], a23High)}`;
    case 3: return `Color, ${RCH[s[1]]} high`;
    case 2: return `Pair of ${RPL[s[1]]}`;
    default: return `${RCH[s[1]]} high`;
  }
}
function points999(cards) {
  const v = (c) => (c.r === 14 ? 1 : c.r >= 10 ? 0 : c.r);
  const d = cards.map(v).sort((a, b) => b - a);
  return d[0] * 100 + d[1] * 10 + d[2];
}
function wildPredicate(v, ctx) {
  switch (v) {
    case 'ak47': return (c) => [14, 13, 4, 7].includes(c.r);
    case 'love1942': return (c) => [14, 9, 4, 2].includes(c.r) || c.s === 'h';
    case 'hate1947': return (c) => [14, 9, 4, 7].includes(c.r) || c.s === 's';
    case 'mystery': return (c) => c.r === ctx.center.mystery.r;
    case 'ccb_noblind':
    case 'ccb_blind': return (c) => c.r === ctx.center.card.r || c.s === ctx.center.color.s;
    case 'jua': return (c) => ctx.juaRanks.includes(c.r);
    default: return () => false;
  }
}
const PLAIN = ['classic', 'faceup', 'exchange', 'four', 'five'];

// main = score under the variation, nat = score of the dealt cards with no jokers (tie breaker)
export function scoreCards(cards, ctx) {
  const v = ctx.variation, a23 = !!ctx.a23High;
  const natBest = bestOfN(cards, a23);
  const nat = natBest.score;
  if (v === 'muflis') {
    const neg = nat.map((x) => -x);
    return { main: neg, nat: neg, desc: describe(nat, a23), used: cards, jokers: cards.map(() => false) };
  }
  if (v === 'p999') {
    const pts = points999(cards);
    return { main: [pts], nat, desc: `${pts} points`, used: cards, jokers: cards.map(() => false) };
  }
  if (PLAIN.includes(v)) return { main: nat, nat, desc: describe(nat, a23), used: natBest.cards, jokers: cards.map(() => false) };
  if ((v === 'ccb_noblind' || v === 'ccb_blind') && cards.some((c) => c.r === ctx.center.burst.r)) {
    return { main: [-100], nat, desc: 'Burst', burst: true, used: cards, jokers: cards.map(() => false) };
  }
  let res;
  if (v === 'littlejoker' || v === 'biggerjoker' || v === 'mahalaxmi') {
    const R = v === 'mahalaxmi' ? { J: 11, Q: 12, K: 13 }[ctx.mlLetter] : null;
    const base = cards.map((c) => R !== null && c.r === R);
    for (const aceLow of [false, true]) { // ace is dynamic: try it low and high, keep the better hand
      const val = (c) => (c.r === 14 && aceLow ? 1 : c.r);
      const flags = base.slice();
      const cand = cards.map((c, k) => (base[k] ? -1 : k)).filter((k) => k >= 0);
      if (cand.length) {
        const vals = cand.map((k) => val(cards[k]));
        const t = v === 'biggerjoker' ? Math.max(...vals) : Math.min(...vals);
        cand.forEach((k) => { if (val(cards[k]) === t) flags[k] = true; });
      }
      const r = wild3(cards, flags, a23);
      if (!res || cmpScore(r.score, res.score) > 0) res = { ...r, flags };
    }
  } else {
    const isWild = wildPredicate(v, ctx);
    const flags = cards.map(isWild);
    res = { ...wild3(cards, flags, a23), flags };
  }
  const nj = res.flags.filter(Boolean).length;
  return { main: res.score, nat, desc: describe(res.score, a23) + (nj ? ` (${nj} joker${nj > 1 ? 's' : ''})` : ''), used: res.cards, jokers: res.flags };
}
function ctxOf(st) {
  const rd = st.round;
  return {
    variation: rd.variation, a23High: st.settings.a23High, center: rd.center, mlLetter: rd.mlLetter,
    juaRanks: rd.center.jua ? rd.center.jua.piles.filter((p) => p.fixed).map((p) => p.rank) : [],
  };
}
export function scoreHand(st, seat) { return scoreCards(st.round.players[seat].cards, ctxOf(st)); }

// ---------- table setup ----------
export function sanitizeSettings(s = {}) {
  const cents = (v, d) => { const n = Math.round(Number(v) * 100); return Number.isFinite(n) && n > 0 ? n : d; };
  const int = (v, d, lo, hi) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  const buyIn = cents(s.buyIn, 100000);
  let boot = Math.min(cents(s.boot, 1000), buyIn);
  if (boot % 2) boot += 1; // keeps blind half amounts in whole cents
  return {
    buyIn, boot,
    maxBlind: int(s.maxBlind, 3, 0, 20),
    showGoesDown: !!s.showGoesDown,
    allowDeny: s.allowDeny !== false,
    a23High: !!s.a23High,
    mlStart: Math.max(2, cents(s.mlStart, 500) + (cents(s.mlStart, 500) % 2)),
  };
}
const cleanName = (n) => String(n || 'Player').replace(/[<>]/g, '').trim().slice(0, 14) || 'Player';
export function seatOf(st, uid) { return st.seats.findIndex((s) => s && s.uid === uid); }
const seatedCount = (st) => st.seats.filter(Boolean).length;
const nm = (st, i) => (st.seats[i] ? st.seats[i].name : `Seat ${i + 1}`);
function log(st, msg) { st.log.push(msg); if (st.log.length > 80) st.log.splice(0, st.log.length - 80); }

export function createTable(id, hostUid, hostName, settings) {
  const st = {
    id, v: 1, hostUid, settings: sanitizeSettings(settings), seats: Array(MAX_SEATS).fill(null),
    phase: 'lobby', dealerSeat: null, lastFirst: null, round: null, ml: null, mlPrep: null,
    log: [], lastResult: null, roundNum: 0,
  };
  addSeat(st, hostUid, hostName, false);
  log(st, `${nm(st, 0)} opened the table.`);
  return st;
}
function addSeat(st, uid, name, bot) {
  const i = st.seats.findIndex((s) => !s);
  if (i < 0) fail('Table is full (7 seats)');
  st.seats[i] = { uid, name: cleanName(name), bot, stack: st.settings.buyIn, rebuys: 0, boughtIn: st.settings.buyIn };
  return i;
}
function nextOccupied(st, from) {
  for (let k = 1; k <= MAX_SEATS; k++) { const i = (from + k) % MAX_SEATS; if (st.seats[i]) return i; }
  return null;
}

// ---------- round helpers ----------
const isActive = (rd, i) => !!(rd.players[i] && !rd.players[i].packed);
const activeSeats = (rd) => rd.order.filter((i) => isActive(rd, i));
function nextActive(rd, from) {
  for (let k = 1; k <= MAX_SEATS; k++) { const i = (from + k) % MAX_SEATS; if (isActive(rd, i)) return i; }
  return -1;
}
function prevActive(rd, from) {
  for (let k = 1; k <= MAX_SEATS; k++) { const i = (from - k + MAX_SEATS * 2) % MAX_SEATS; if (isActive(rd, i)) return i; }
  return -1;
}
function pay(st, seat, amt) {
  const s = st.seats[seat];
  if (!s || s.stack < amt) fail(`Not enough chips. You need ${money(amt)}.`);
  s.stack -= amt;
  st.round.pot += amt;
  st.round.players[seat].paid += amt;
}
function payout(st, winners, pot) {
  const ws = winners.filter((w) => st.seats[w]);
  if (!ws.length) return;
  const share = Math.floor(pot / ws.length);
  ws.forEach((w, k) => { st.seats[w].stack += share + (k === 0 ? pot - share * ws.length : 0); });
}

function beginRound(st, { variation, tableBoot = false, faceUp = 1, carryPot = 0, noBoot = false, eligible = null, finalShow = false }) {
  const S = st.settings;
  if (!VMAP[variation]) fail('Unknown game');
  const isML = variation === 'mahalaxmi';
  const nCards = variation === 'four' ? 4 : variation === 'five' ? 5 : 3;
  let seats;
  if (eligible) seats = eligible.filter((i) => st.seats[i]);
  else seats = st.seats.map((s, i) => (s ? i : -1)).filter((i) => i >= 0)
    .filter((i) => (tableBoot ? st.seats[i].stack > 0 || i === st.dealerSeat : st.seats[i].stack >= S.boot));
  if (seats.length < 2) fail('Need at least 2 players with enough chips. Someone has to rebuy, or add a bot.');
  if (!noBoot && tableBoot) {
    if (!seats.includes(st.dealerSeat)) seats.push(st.dealerSeat);
    if (st.seats[st.dealerSeat].stack < S.boot * seats.length) fail(`Table boot needs ${money(S.boot * seats.length)}.`);
  }
  const set = new Set(seats);
  const ref = st.lastFirst ?? st.dealerSeat;
  let first = -1;
  for (let k = 1; k <= MAX_SEATS; k++) { const i = (ref + k) % MAX_SEATS; if (set.has(i)) { first = i; break; } }
  const order = [];
  for (let k = 0; k < MAX_SEATS; k++) { const i = (first + k) % MAX_SEATS; if (set.has(i)) order.push(i); }

  const deck = newDeck();
  const players = {};
  order.forEach((i) => { players[i] = { cards: [], seen: false, packed: false, blind: 0, burst: false, exch: false, paid: 0, pub: false }; });
  for (let c = 0; c < nCards; c++) for (const i of order) players[i].cards.push(deck.pop()); // one card at a time, clockwise

  const center = {};
  if (variation === 'mystery') center.mystery = deck.pop();
  if (variation === 'ccb_noblind' || variation === 'ccb_blind') {
    center.card = deck.pop();
    center.color = deck.pop();
    let b = deck.pop();
    while (b.r === center.card.r) b = deck.pop(); // burst can't share the joker number
    center.burst = b;
  }
  if (variation === 'jua') center.jua = { piles: Array.from({ length: order.length + 1 }, () => ({ cards: [deck.pop()], fixed: false, rank: null })), idx: 0 };

  st.lastFirst = first;
  st.roundNum += 1;
  const rd = {
    num: st.roundNum, variation, tableBoot: !!tableBoot && !noBoot, faceUp: variation === 'faceup' ? (Number(faceUp) === 2 ? 2 : 1) : 0,
    nCards, deck, players, order, first, pot: carryPot,
    stake: isML ? S.mlStart : S.boot, step: S.boot,
    maxBlind: isML ? 2 : variation === 'ccb_noblind' ? 0 : S.maxBlind,
    turn: -1, pending: null, reveals: [], center, mlLetter: isML ? 'JQK'[st.ml.sub % 3] : null,
  };
  st.round = rd;
  if (!noBoot) {
    if (tableBoot) {
      const amt = S.boot * order.length;
      st.seats[st.dealerSeat].stack -= amt; rd.pot += amt; players[st.dealerSeat].paid += amt;
    } else {
      for (const i of order) { st.seats[i].stack -= S.boot; players[i].paid += S.boot; rd.pot += S.boot; }
    }
  }
  st.phase = variation === 'jua' ? 'jua' : 'betting';
  const title = isML ? `Maha Laxmi, ${rd.mlLetter} little` : variationName(variation);
  log(st, `Round ${rd.num}: ${title}. ${nm(st, st.dealerSeat)} deals, first card to ${nm(st, first)}.${noBoot ? '' : tableBoot ? ` ${nm(st, st.dealerSeat)} puts the table boot.` : ''}`);
  if (center.mystery) log(st, `Mystery card: ${cardLabel(center.mystery)}. Every ${RCH[center.mystery.r]} is a joker.`);
  if (center.card) log(st, `Card ${cardLabel(center.card)}, Color ${cardLabel(center.color)}, Burst ${cardLabel(center.burst)}.`);
  if (center.jua) log(st, `Jua: ${center.jua.piles.length} center cards. First card: ${cardLabel(center.jua.piles[0].cards[0])}.`);

  if (finalShow) { finalShowdown(st); return; }
  if (variation === 'ccb_noblind') for (const i of order) doSee(st, i, false, true);
  if (checkEnd(st)) return;
  rd.turn = nextActive(rd, first);
  if (st.phase === 'betting') startTurn(st);
}

function doSee(st, i, forced, quiet) {
  const rd = st.round, p = rd.players[i];
  if (p.seen) return;
  p.seen = true;
  if (!quiet) log(st, forced ? `${nm(st, i)} hit the blind limit and has to see.` : `${nm(st, i)} sees their cards.`);
  if ((rd.variation === 'ccb_noblind' || rd.variation === 'ccb_blind') && p.cards.some((c) => c.r === rd.center.burst.r)) {
    p.burst = true; p.packed = true; p.pub = true;
    log(st, `${nm(st, i)} BURST (holding a ${RCH[rd.center.burst.r]}). Folded.`);
  }
}

function startTurn(st) {
  for (let guard = 0; guard < 20; guard++) {
    const rd = st.round;
    if (!rd || st.phase !== 'betting') return;
    const i = rd.turn, p = rd.players[i];
    if (!p.seen && p.blind >= rd.maxBlind) {
      doSee(st, i, true);
      if (p.packed) { if (checkEnd(st)) return; rd.turn = nextActive(rd, i); continue; }
    }
    if (st.ml && rd.variation === 'mahalaxmi') {
      const need = p.seen ? rd.stake : rd.stake / 2;
      if (st.seats[i].stack < need) {
        p.packed = true;
        log(st, `${nm(st, i)} can't cover the chaal and packs.`);
        if (checkEnd(st)) return;
        rd.turn = nextActive(rd, i);
        continue;
      }
    }
    return;
  }
}

function advance(st, from) {
  if (checkEnd(st)) return;
  const rd = st.round;
  rd.turn = nextActive(rd, from);
  if (st.phase === 'betting') startTurn(st);
}

function checkEnd(st) {
  const rd = st.round;
  const act = activeSeats(rd);
  if (act.length === 1) {
    finishRound(st, [act[0]], `${nm(st, act[0])} wins. Everyone else packed.`, []);
    return true;
  }
  if (act.length === 0) {
    if (rd.variation === 'ccb_noblind' || rd.variation === 'ccb_blind') {
      log(st, 'Everyone burst. Redealing with the same pot.');
      st.dealerSeat = st.seats[st.dealerSeat] ? st.dealerSeat : nextOccupied(st, st.dealerSeat);
      beginRound(st, { variation: rd.variation, noBoot: true, carryPot: rd.pot, eligible: rd.order });
    } else {
      finishRound(st, rd.order.filter((i) => st.seats[i]), 'Nobody left in the hand. Pot split.', []);
    }
    return true;
  }
  return false;
}

function finishRound(st, winners, msg, shown) {
  const rd = st.round;
  if (rd.variation === 'mahalaxmi' && st.ml) { mlSubWin(st, winners, msg, shown); return; }
  payout(st, winners, rd.pot);
  st.lastResult = { num: rd.num, variation: rd.variation, winners, amount: rd.pot, msg, shown };
  log(st, `${msg} Pot ${money(rd.pot)}.`);
  endHand(st, winners[0]);
}
function endHand(st, nextDealer) {
  st.round = null;
  st.dealerSeat = st.seats[nextDealer] ? nextDealer : nextOccupied(st, nextDealer ?? 0);
  st.phase = seatedCount(st) >= 2 ? 'choose' : 'lobby';
}

function mlSubWin(st, winners, msg, shown) {
  const rd = st.round, ml = st.ml, L = rd.mlLetter;
  for (const w of winners) { ml.wins[w] = ml.wins[w] || { J: 0, Q: 0, K: 0 }; ml.wins[w][L] += 1; }
  log(st, `${msg} ${winners.map((w) => nm(st, w)).join(' and ')} take${winners.length > 1 ? '' : 's'} ${L} little.`);
  const champs = winners.filter((w) => ['J', 'Q', 'K'].every((x) => ml.wins[w][x] > 0));
  if (champs.length) {
    payout(st, champs, rd.pot);
    const m = `${champs.map((w) => nm(st, w)).join(' and ')} won J, Q and K. Maha Laxmi pot ${money(rd.pot)}.`;
    st.lastResult = { num: rd.num, variation: 'mahalaxmi', winners: champs, amount: rd.pot, msg: m, shown };
    log(st, m);
    st.ml = null;
    endHand(st, champs[0]);
    return;
  }
  st.lastResult = { num: rd.num, variation: 'mahalaxmi', winners, amount: 0, msg: `${msg} ${L} little goes to ${winners.map((w) => nm(st, w)).join(' and ')}.`, shown, ml: true };
  ml.sub += 1;
  st.dealerSeat = st.seats[winners[0]] ? winners[0] : nextOccupied(st, winners[0]);
  const elig = ml.participants.filter((i) => st.seats[i]);
  if (elig.length < 2) {
    payout(st, elig.length ? elig : winners, rd.pot);
    log(st, 'Maha Laxmi ends early, not enough players left.');
    st.ml = null;
    endHand(st, elig[0] ?? winners[0]);
    return;
  }
  // If fewer than 2 players can still afford a blind chaal, nobody can bet. Deal one last hand and show everyone.
  if (elig.filter((i) => st.seats[i].stack >= st.settings.mlStart / 2).length < 2) {
    beginRound(st, { variation: 'mahalaxmi', noBoot: true, carryPot: rd.pot, eligible: elig, finalShow: true });
    return;
  }
  beginRound(st, { variation: 'mahalaxmi', noBoot: true, carryPot: rd.pot, eligible: elig });
}
function finalShowdown(st) {
  const rd = st.round;
  const hands = rd.order.map((i) => ({ i, sc: scoreHand(st, i) }));
  let best = [hands[0]];
  for (const h of hands.slice(1)) {
    let c = cmpScore(h.sc.main, best[0].sc.main);
    if (!c) c = cmpScore(h.sc.nat, best[0].sc.nat);
    if (c > 0) best = [h]; else if (c === 0) best.push(h);
  }
  const winners = best.map((h) => h.i);
  const shown = hands.map((h) => ({ seat: h.i, cards: rd.players[h.i].cards, desc: h.sc.desc, jokers: h.sc.jokers }));
  hands.forEach((h) => { rd.players[h.i].pub = true; });
  payout(st, winners, rd.pot);
  const m = `Nobody has chips left to bet, so everyone shows. ${winners.map((w) => nm(st, w)).join(' and ')} win${winners.length > 1 ? '' : 's'} the Maha Laxmi pot ${money(rd.pot)} with ${best[0].sc.desc}.`;
  st.lastResult = { num: rd.num, variation: 'mahalaxmi', winners, amount: rd.pot, msg: m, shown };
  log(st, m);
  st.ml = null;
  endHand(st, winners[0]);
}

// Tie rules: show goes down -> asker loses. Otherwise better dealt cards. Then split (final show) or card draw (private).
function judge(st, a, b, priv) {
  const ha = scoreHand(st, a), hb = scoreHand(st, b);
  let c = cmpScore(ha.main, hb.main);
  if (c) return { winner: c > 0 ? a : b, note: '', ha, hb };
  if (st.settings.showGoesDown) return { winner: b, note: ' (tie, show goes down)', ha, hb };
  c = cmpScore(ha.nat, hb.nat);
  if (c) return { winner: c > 0 ? a : b, note: ' (tie, better dealt cards)', ha, hb };
  if (!priv) return { split: true, note: ' (tie)', ha, hb };
  const rd = st.round;
  const draw = () => { if (!rd.deck.length) rd.deck = newDeck(); return rd.deck.pop(); };
  for (let g = 0; g < 50; g++) {
    const ca = draw(), cb = draw();
    if (ca.r !== cb.r) return { winner: ca.r > cb.r ? a : b, note: ` (tie, card draw ${cardLabel(ca)} vs ${cardLabel(cb)})`, ha, hb };
  }
  return { winner: b, note: ' (tie)', ha, hb };
}

function resolvePrivate(st, accept) {
  const rd = st.round, pd = rd.pending, { from, to, type } = pd;
  const label = type === 'sideshow' ? 'sideshow' : 'backshow';
  if (!accept) {
    if (!st.settings.allowDeny) fail('Denying is turned off at this table.');
    const cost = (type === 'backshow' ? 2 : 3) * rd.stake;
    pay(st, to, cost);
    rd.pending = null;
    log(st, `${nm(st, to)} denies the ${label} and pays ${money(cost)}.`);
    advance(st, type === 'sideshow' ? to : from);
    return;
  }
  rd.reveals.push([from, to], [to, from]);
  const j = judge(st, from, to, true);
  const loser = j.winner === from ? to : from;
  rd.players[loser].packed = true;
  rd.pending = null;
  log(st, `${label[0].toUpperCase() + label.slice(1)}: ${nm(st, j.winner)} stays in${j.note}. ${nm(st, loser)} packs.`);
  advance(st, from);
}

function fixPile(st, seat, free) {
  const rd = st.round, J = rd.center.jua, pile = J.piles[J.idx];
  const top = pile.cards[pile.cards.length - 1];
  pile.fixed = true; pile.rank = top.r;
  rd.deck.push(...pile.cards.slice(0, -1));
  shuffle(rd.deck);
  pile.cards = [top];
  log(st, `${nm(st, seat)} ${free ? 'gets a free fix (deck ran out)' : `fixes for ${money(2 * rd.step)}`}: ${RCH[top.r]}. Every ${RCH[top.r]} is a joker.`);
  J.idx += 1;
  if (J.idx >= J.piles.length) {
    st.phase = 'betting';
    log(st, 'All center cards fixed. Betting starts.');
    rd.turn = nextActive(rd, rd.first);
    startTurn(st);
  } else {
    log(st, `Next center card: ${cardLabel(J.piles[J.idx].cards[0])}.`);
    rd.turn = nextActive(rd, seat);
  }
}

function foldOut(st, i) {
  const rd = st.round, p = rd.players[i];
  p.packed = true;
  const pd = rd.pending;
  if (pd && (pd.from === i || pd.to === i)) { rd.pending = null; advance(st, pd.from); return; }
  if (rd.turn === i) { advance(st, i); return; }
  checkEnd(st);
}
function removeSeat(st, i) {
  const s = st.seats[i];
  if (!s) return;
  if (st.round && st.round.players[i] && !st.round.players[i].packed) foldOut(st, i);
  st.seats[i] = null;
  log(st, `${s.name} left the table.`);
  if (s.uid === st.hostUid) {
    const h = st.seats.find((x) => x && !x.bot);
    if (h) { st.hostUid = h.uid; log(st, `${h.name} is the host now.`); }
  }
  if (st.ml) st.ml.participants = st.ml.participants.filter((x) => x !== i);
  if ((st.phase === 'choose' || st.phase === 'mlprep') && st.dealerSeat === i) st.dealerSeat = nextOccupied(st, i);
  if (!st.round && st.phase !== 'lobby' && seatedCount(st) < 2) { st.phase = 'lobby'; st.ml = null; st.mlPrep = null; log(st, 'Back to the lobby.'); }
}

function rebuyInfo(st, seat) {
  if (seat < 0) return { allowed: false };
  const s = st.seats[seat];
  const left = 3 - s.rebuys;
  let reason = null;
  if (st.phase === 'lobby') reason = 'Game has not started';
  else if (st.ml) reason = 'No rebuys during Maha Laxmi';
  else if (left <= 0) reason = 'No rebuys left';
  return { allowed: !reason, reason, left, max: st.settings.buyIn * 2 };
}

// What a seat is allowed to do right now. The UI and the bots both read this.
export function actionsFor(st, seat) {
  const out = { rebuy: rebuyInfo(st, seat) };
  if (seat < 0 || !st.seats[seat]) return out;
  const isHost = st.seats[seat].uid === st.hostUid;
  out.isHost = isHost;
  out.canStart = isHost && st.phase === 'lobby' && seatedCount(st) >= 2;
  out.canChoose = st.phase === 'choose' && (seat === st.dealerSeat || isHost);
  out.canMlDeal = st.phase === 'mlprep' && (seat === st.dealerSeat || isHost);
  const rd = st.round;
  if (!rd) return out;
  if (isHost && (st.phase === 'betting' || st.phase === 'jua')) {
    const target = rd.pending ? rd.pending.to : rd.turn;
    if (target !== seat && st.seats[target] && !st.seats[target].bot) out.afkTarget = target;
  }
  const p = rd.players[seat];
  if (!p || p.packed) return out;
  out.canSee = !p.seen;
  const stack = st.seats[seat].stack;
  if (rd.pending) {
    if (rd.pending.to === seat) {
      const dc = (rd.pending.type === 'backshow' ? 2 : 3) * rd.stake;
      out.respond = { type: rd.pending.type, from: rd.pending.from, denyCost: dc, canDeny: st.settings.allowDeny && stack >= dc, denyAllowed: st.settings.allowDeny };
    }
    return out;
  }
  const myTurn = rd.turn === seat;
  if (st.phase === 'jua' && myTurn) {
    out.canPack = true;
    out.jua = { flipCost: rd.step, fixCost: 2 * rd.step, canFlip: stack >= rd.step, canFix: stack >= 2 * rd.step };
    return out;
  }
  if (st.phase !== 'betting' || !myTurn) return out;
  out.canPack = true;
  const blind = !p.seen;
  const base = blind ? rd.stake / 2 : rd.stake;
  const unit = blind ? rd.step / 2 : rd.step;
  out.chaal = { amount: base, unit, blind, canAfford: stack >= base, maxRaise: Math.max(0, Math.floor((stack - base) / unit)) };
  const act = activeSeats(rd);
  if (act.length === 2) {
    const o = act.find((x) => x !== seat);
    const okRule = !(p.seen && !rd.players[o].seen);
    out.showCost = base;
    out.canShow = okRule && stack >= base;
    out.showBlocked = okRule ? null : `${nm(st, o)} is still blind`;
  }
  if (act.length >= 3) {
    const allSeen = act.every((x) => rd.players[x].seen);
    if (allSeen) {
      out.sideCost = rd.stake;
      out.canSideshow = out.canBackshow = stack >= rd.stake;
      out.sideTarget = nextActive(rd, seat);
      out.backTarget = prevActive(rd, seat);
    } else out.privateBlocked = 'No sideshow or backshow until everyone is off blind';
  }
  if (rd.variation === 'exchange' && !p.exch) out.canExchange = true;
  return out;
}

function applyAction(st, seat, uid, a) {
  const t = a && a.type;
  const isHost = uid === st.hostUid;
  const S = st.settings;
  switch (t) {
    case 'join': {
      if (seat >= 0) { if (a.name) st.seats[seat].name = cleanName(a.name); return; }
      const i = addSeat(st, uid, a.name, false);
      log(st, `${nm(st, i)} sat down.${st.phase !== 'lobby' ? ' Dealt in next round.' : ''}`);
      return;
    }
    case 'leave': if (seat >= 0) removeSeat(st, seat); return;
    case 'settings': {
      if (!isHost) fail('Only the host can change table rules');
      if (st.phase !== 'lobby') fail('Rules lock once the game starts');
      st.settings = sanitizeSettings(a.settings);
      st.seats.forEach((s) => { if (s) { s.stack = st.settings.buyIn; s.boughtIn = st.settings.buyIn; s.rebuys = 0; } });
      log(st, 'Host updated the table rules.');
      return;
    }
    case 'addBot': {
      if (!isHost) fail('Only the host can add computer players');
      const used = new Set(st.seats.filter(Boolean).map((s) => s.name));
      const name = BOT_NAMES.find((n) => !used.has('Bot ' + n)) || 'Bot';
      const i = addSeat(st, 'bot-' + Math.random().toString(36).slice(2, 9), 'Bot ' + name, true);
      log(st, `${nm(st, i)} joined.`);
      return;
    }
    case 'removeBot': {
      if (!isHost) fail('Only the host can remove computer players');
      const s = st.seats[a.seat];
      if (!s || !s.bot) fail('That seat is not a computer player');
      removeSeat(st, a.seat);
      return;
    }
    case 'start': {
      if (!isHost) fail('Only the host can start');
      if (st.phase !== 'lobby') fail('Already started');
      if (seatedCount(st) < 2) fail('Need at least 2 players');
      st.dealerSeat = seat; st.lastFirst = null; st.phase = 'choose';
      log(st, `Game on. ${nm(st, seat)} deals the first hand and picks the game.`);
      return;
    }
    case 'choose': {
      if (st.phase !== 'choose') fail('Not time to pick a game');
      if (seat !== st.dealerSeat && !isHost) fail('The dealer picks the game');
      if (!VMAP[a.variation]) fail('Pick a game');
      if (a.variation === 'mahalaxmi') {
        st.mlPrep = { tableBoot: !!a.tableBoot };
        st.phase = 'mlprep';
        log(st, `${nm(st, st.dealerSeat)} picked Maha Laxmi. Rebuy now if you need to. No rebuys once cards are dealt.`);
        return;
      }
      beginRound(st, { variation: a.variation, tableBoot: !!a.tableBoot, faceUp: a.faceUp });
      return;
    }
    case 'mlCancel': {
      if (st.phase !== 'mlprep' || (seat !== st.dealerSeat && !isHost)) fail('Not allowed');
      st.phase = 'choose'; st.mlPrep = null;
      return;
    }
    case 'mlDeal': {
      if (st.phase !== 'mlprep') fail('Not time to deal');
      if (seat !== st.dealerSeat && !isHost) fail('The dealer deals');
      st.ml = { sub: 0, wins: {}, participants: [] };
      try { beginRound(st, { variation: 'mahalaxmi', tableBoot: st.mlPrep && st.mlPrep.tableBoot }); }
      catch (e) { st.ml = null; throw e; }
      st.mlPrep = null;
      if (st.ml && st.round) st.ml.participants = st.round.order.slice();
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
      log(st, `${s.name} rebuys ${money(amt)} (${3 - s.rebuys} left).`);
      return;
    }
    case 'afk': {
      if (!isHost) fail('Only the host can do that');
      const rd = st.round;
      if (!rd || (st.phase !== 'betting' && st.phase !== 'jua')) fail('Nothing to skip');
      if (rd.pending) { log(st, `Host accepted the ${rd.pending.type} for ${nm(st, rd.pending.to)} (away).`); resolvePrivate(st, true); return; }
      const tgt = rd.turn;
      rd.players[tgt].packed = true;
      log(st, `Host packed ${nm(st, tgt)} (away).`);
      advance(st, tgt);
      return;
    }
    default: break;
  }

  if (seat < 0) fail('You are not seated');
  const rd = st.round;
  if (!rd) fail('No hand in progress');
  const p = rd.players[seat];
  if (!p || p.packed) fail('You are not in this hand');
  const A = actionsFor(st, seat);
  const me = nm(st, seat);
  switch (t) {
    case 'see': {
      if (p.seen) return;
      doSee(st, seat, false);
      if (p.packed) { if (checkEnd(st)) return; if (rd.turn === seat) advance(st, seat); }
      return;
    }
    case 'pack': {
      if (!A.canPack) fail('Wait for your turn');
      p.packed = true;
      log(st, `${me} packs.`);
      advance(st, seat);
      return;
    }
    case 'chaal': {
      const c = A.chaal;
      if (!c) fail('Wait for your turn');
      if (!c.canAfford) fail(`You need ${money(c.amount)}. Rebuy or pack.`);
      const k = Math.max(0, Math.floor(Number(a.raise) || 0));
      if (k > c.maxRaise) fail('Not enough chips for that raise');
      const amt = c.amount + k * c.unit;
      pay(st, seat, amt);
      if (k > 0) rd.stake = c.blind ? amt * 2 : amt;
      if (c.blind) p.blind += 1;
      log(st, `${me} ${c.blind ? 'plays blind' : 'plays chaal'} ${money(amt)}${k > 0 ? `. Raise, seen chaal is now ${money(rd.stake)}` : ''}.`);
      advance(st, seat);
      return;
    }
    case 'show': {
      if (!A.canShow) fail(A.showBlocked ? `Can't ask for a show: ${A.showBlocked}` : 'Show is only for the last 2 players');
      pay(st, seat, A.showCost);
      const o = activeSeats(rd).find((x) => x !== seat);
      log(st, `${me} pays ${money(A.showCost)} and asks ${nm(st, o)} for a show.`);
      const j = judge(st, seat, o, false);
      const shown = [{ seat, cards: p.cards, desc: j.ha.desc, jokers: j.ha.jokers }, { seat: o, cards: rd.players[o].cards, desc: j.hb.desc, jokers: j.hb.jokers }];
      if (j.split) finishRound(st, [seat, o], `Show: ${j.ha.desc} vs ${j.hb.desc}. Tie, pot split.`, shown);
      else finishRound(st, [j.winner], `Show: ${nm(st, j.winner)} wins with ${(j.winner === seat ? j.ha : j.hb).desc}${j.note}.`, shown);
      return;
    }
    case 'sideshow':
    case 'backshow': {
      if (!(t === 'sideshow' ? A.canSideshow : A.canBackshow)) fail(A.privateBlocked || 'Not available right now');
      const target = t === 'sideshow' ? A.sideTarget : A.backTarget;
      pay(st, seat, A.sideCost);
      rd.pending = { type: t, from: seat, to: target };
      log(st, `${me} plays chaal ${money(A.sideCost)} and asks ${nm(st, target)} for a ${t}.`);
      return;
    }
    case 'respond': {
      if (!rd.pending || rd.pending.to !== seat) fail('Nothing to answer');
      resolvePrivate(st, !!a.accept);
      return;
    }
    case 'exchange': {
      if (!A.canExchange) fail('Swap not available');
      const idx = Math.floor(Number(a.index));
      if (!(idx >= 0 && idx < p.cards.length)) fail('Pick a card');
      if (!rd.deck.length) fail('Deck is empty');
      p.cards[idx] = rd.deck.pop();
      p.exch = true;
      log(st, `${me} swaps a card.`);
      return;
    }
    case 'flip': {
      if (!A.jua) fail('Wait for your turn');
      if (!rd.deck.length) { fixPile(st, seat, true); return; }
      if (!A.jua.canFlip) fail(`Flip costs ${money(A.jua.flipCost)}. Rebuy or pack.`);
      pay(st, seat, A.jua.flipCost);
      const J = rd.center.jua, pile = J.piles[J.idx];
      pile.cards.push(rd.deck.pop());
      log(st, `${me} flips for ${money(A.jua.flipCost)}. New card: ${cardLabel(pile.cards[pile.cards.length - 1])}.`);
      rd.turn = nextActive(rd, seat);
      return;
    }
    case 'fix': {
      if (!A.jua) fail('Wait for your turn');
      if (!A.jua.canFix) fail(`Fix costs ${money(A.jua.fixCost)}. Rebuy or pack.`);
      pay(st, seat, A.jua.fixCost);
      fixPile(st, seat, false);
      return;
    }
    default: fail('Unknown action');
  }
}

export function dispatch(st, uid, a) {
  applyAction(st, seatOf(st, uid), uid, a || {});
  st.v = (st.v || 0) + 1;
}

// ---------- computer players ----------
function baseStrength(s) {
  switch (s[0]) {
    case 6: return 0.97 + 0.03 * (s[1] / 14);
    case 5: return 0.93 + 0.03 * (s[1] / 15);
    case 4: return 0.86 + 0.06 * (s[1] / 15);
    case 3: return 0.72 + 0.12 * Math.max(0, s[1] - 5) / 9;
    case 2: return 0.45 + 0.25 * (s[1] - 2) / 12;
    default: return Math.max(0, (s[1] - 5) / 9) * 0.42;
  }
}
function botStrength(st, seat) {
  const sc = scoreHand(st, seat), v = st.round.variation;
  if (sc.burst) return 0;
  if (v === 'p999') return sc.main[0] / 999;
  if (v === 'muflis') return 1 - baseStrength(sc.main.map((x) => -x));
  const s = baseStrength(sc.main);
  return PLAIN.includes(v) ? s : Math.max(0, (s - 0.35) / 0.65); // jokers make everyone strong
}
function botAct(st, seat) {
  const rd = st.round, p = rd.players[seat];
  const A = actionsFor(st, seat);
  const buy = st.settings.buyIn / 100;
  if (st.phase === 'jua') {
    const J = rd.center.jua, pile = J.piles[J.idx], top = pile.cards[pile.cards.length - 1];
    const wantFix = p.cards.some((c) => c.r === top.r) || rand(100) < 15;
    if (wantFix && A.jua.canFix) return { type: 'fix' };
    if (A.jua.canFlip) return { type: 'flip' };
    if (A.jua.canFix) return { type: 'fix' };
    if (A.rebuy.allowed) return { type: 'rebuy', amount: buy };
    return { type: 'pack' };
  }
  const c = A.chaal;
  if (!p.seen && ((p.blind >= 1 && rand(100) < 40) || rand(100) < 12)) return { type: 'see' };
  if (!c.canAfford) return A.rebuy.allowed ? { type: 'rebuy', amount: buy } : { type: 'pack' };
  if (!p.seen) {
    if (A.canShow && rand(100) < 25) return { type: 'show' };
    return { type: 'chaal', raise: c.maxRaise > 0 && rd.stake < 6 * rd.step && rand(100) < 10 ? 1 : 0 };
  }
  if (A.canExchange) {
    const idx = p.cards.reduce((m, x, k) => (x.r < p.cards[m].r ? k : m), 0);
    if (botStrength(st, seat) < 0.5) return { type: 'exchange', index: idx };
  }
  const s = botStrength(st, seat);
  if (A.canShow && (s > 0.55 || rand(100) < 15)) return { type: 'show' };
  if (s < 0.2 && rand(100) < 80) return { type: 'pack' };
  if (s < 0.35 && rd.stake > 4 * rd.step && rand(100) < 60) return { type: 'pack' };
  if (A.canSideshow && s > 0.35 && s < 0.7 && rand(100) < 15) return { type: 'sideshow' };
  if (A.canBackshow && s > 0.35 && s < 0.7 && rand(100) < 10) return { type: 'backshow' };
  if (s > 0.8 && c.maxRaise > 0 && rd.stake < 12 * rd.step && rand(100) < 45) return { type: 'chaal', raise: Math.min(c.maxRaise, 1 + rand(2)) };
  return { type: 'chaal', raise: 0 };
}
function botNext(st) {
  const buy = st.settings.buyIn / 100;
  if (st.phase === 'choose' || st.phase === 'mlprep') {
    const low = st.phase === 'mlprep' ? 6 * st.settings.boot : st.settings.boot;
    for (let i = 0; i < MAX_SEATS; i++) {
      const s = st.seats[i];
      if (s && s.bot && s.stack < low && rebuyInfo(st, i).allowed) return { seat: i, a: { type: 'rebuy', amount: buy } };
    }
    if (st.phase === 'choose') {
      const d = st.seats[st.dealerSeat];
      if (d && d.bot) return { seat: st.dealerSeat, a: { type: 'choose', variation: VARIATIONS[rand(VARIATIONS.length)].key, tableBoot: false, faceUp: 1 + rand(2) } };
    }
    return null;
  }
  const rd = st.round;
  if (!rd) return null;
  if (rd.pending) {
    const t = rd.pending.to;
    return st.seats[t] && st.seats[t].bot ? { seat: t, a: { type: 'respond', accept: true } } : null;
  }
  if ((st.phase === 'betting' || st.phase === 'jua') && st.seats[rd.turn] && st.seats[rd.turn].bot) {
    return { seat: rd.turn, a: botAct(st, rd.turn) };
  }
  return null;
}
// Runs bot moves until a human has to act. Returns how many moves were made.
export function runBots(st, max = 400) {
  let n = 0;
  while (n < max) {
    const nx = botNext(st);
    if (!nx) break;
    const uid = st.seats[nx.seat].uid;
    try { applyAction(st, nx.seat, uid, nx.a); }
    catch (e) {
      try { if (st.round && st.round.turn === nx.seat) applyAction(st, nx.seat, uid, { type: 'pack' }); else break; }
      catch (e2) { break; }
    }
    n++;
  }
  if (n) st.v = (st.v || 0) + 1;
  return n;
}

// ---------- what one player is allowed to see ----------
export function viewFor(st, uid) {
  const me = seatOf(st, uid);
  const rd = st.round;
  const seesMe = (i) => rd.reveals.some(([x, y]) => x === me && y === i);
  const seats = st.seats.map((s, i) => {
    if (!s) return null;
    const o = { seat: i, name: s.name, bot: s.bot, stack: s.stack, rebuys: s.rebuys, boughtIn: s.boughtIn, host: s.uid === st.hostUid, me: i === me };
    const p = rd && rd.players[i];
    if (p) {
      const full = (i === me && p.seen) || p.pub || seesMe(i);
      const cards = p.cards.map((c, ci) => (full || ci < rd.faceUp ? c : null));
      o.hand = { seen: p.seen, packed: p.packed, burst: p.burst, blind: p.blind, paid: p.paid, exch: p.exch, cards, revealed: full && i !== me };
      if (full) { const sc = scoreHand(st, i); o.hand.desc = sc.desc; o.hand.jokers = sc.jokers; }
    }
    return o;
  });
  let round = null;
  if (rd) {
    const c = rd.center;
    const center = {};
    if (c.mystery) center.mystery = c.mystery;
    if (c.card) { center.card = c.card; center.color = c.color; center.burst = c.burst; }
    if (c.jua) center.jua = { idx: c.jua.idx, piles: c.jua.piles.map((pl, k) => ({ fixed: pl.fixed, rank: pl.rank, depth: pl.cards.length, top: k <= c.jua.idx ? pl.cards[pl.cards.length - 1] : null })) };
    round = {
      num: rd.num, variation: rd.variation, name: rd.variation === 'mahalaxmi' ? `Maha Laxmi: ${rd.mlLetter} little` : variationName(rd.variation),
      pot: rd.pot, stake: rd.stake, step: rd.step, maxBlind: rd.maxBlind, turn: rd.turn, first: rd.first,
      faceUp: rd.faceUp, nCards: rd.nCards, tableBoot: rd.tableBoot, mlLetter: rd.mlLetter, pending: rd.pending, center,
      deckLeft: rd.deck.length,
    };
  }
  return {
    id: st.id, v: st.v, me, phase: st.phase, settings: st.settings, seats, dealerSeat: st.dealerSeat, round,
    ml: st.ml ? { wins: st.ml.wins, participants: st.ml.participants, letter: 'JQK'[st.ml.sub % 3] } : null,
    mlPrep: st.mlPrep, log: st.log.slice(-40), lastResult: st.lastResult, actions: actionsFor(st, me), variations: VARIATIONS,
  };
}
