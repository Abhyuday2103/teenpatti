import * as E from './engine.js';
import { firebaseConfig } from './firebase-config.js';

// ---------- small helpers ----------
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const M = E.money;
const store = {
  get(k, d) { try { const v = localStorage.getItem('tp_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('tp_' + k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
};
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}

// ---------- servers ----------
// Practice: the whole game runs in this browser with bots.
class LocalServer {
  constructor(name, settings, bots) {
    this.mode = 'local';
    this.uid = 'me';
    this.st = E.createTable('PRACTICE', 'me', name, settings);
    for (let i = 0; i < bots; i++) E.dispatch(this.st, 'me', { type: 'addBot' });
    this.timer = null;
  }
  watch(cb) { this.cb = cb; this.emit(); }
  emit() { if (this.cb) this.cb(E.viewFor(this.st, this.uid)); }
  async act(a) {
    const snap = structuredClone(this.st);
    try { E.dispatch(this.st, this.uid, a); } catch (e) { this.st = snap; throw e; }
    this.emit();
    this.pump();
  }
  pump() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      let n = 0;
      try { n = E.runBots(this.st, 1); } catch (e) { console.error(e); }
      if (n) { this.emit(); this.pump(); }
    }, 750);
  }
  stop() { clearTimeout(this.timer); }
}

// Online: Firebase function deals and runs the table. This browser only sees its own view.
let fb = null;
async function firebase() {
  if (fb) return fb;
  if (!firebaseConfig) throw new Error('Online play is not set up yet. Add your Firebase config (see README).');
  const base = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const [appM, authM, fsM, fnM] = await Promise.all(['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js', 'firebase-functions.js'].map((f) => import(base + f)));
  const app = appM.initializeApp(firebaseConfig);
  const auth = authM.getAuth(app);
  await auth.authStateReady();
  if (!auth.currentUser) await authM.signInAnonymously(auth);
  const db = fsM.getFirestore(app);
  const call = fnM.httpsCallable(fnM.getFunctions(app), 'tp');
  fb = {
    uid: auth.currentUser.uid,
    call: async (data) => { try { return (await call(data)).data; } catch (e) { throw new Error(e.message || 'Request failed'); } },
    watch: (id, cb) => fsM.onSnapshot(fsM.doc(db, 'tables', id, 'views', auth.currentUser.uid), (s) => { if (s.exists()) cb(JSON.parse(s.data().json)); }),
  };
  return fb;
}
class CloudServer {
  constructor(api, code) { this.mode = 'cloud'; this.api = api; this.code = code; this.uid = api.uid; }
  watch(cb) { this.unsub = this.api.watch(this.code, cb); }
  act(a) { return this.api.call({ op: 'act', tableId: this.code, action: a }); }
  stop() { if (this.unsub) this.unsub(); }
}

// ---------- app state ----------
let server = null;
let view = null;
const ui = { raise: 0, swap: false, logOpen: false, modal: null, choice: null, autoChoose: 0, busy: false };

async function act(a) {
  if (!server || ui.busy) return;
  ui.busy = true;
  try { await server.act(a); ui.raise = 0; ui.swap = false; }
  catch (e) { toast(e.message); }
  finally { ui.busy = false; render(); }
}

// ---------- home screen ----------
const DEFAULTS = { buyIn: 1000, boot: 10, maxBlind: 3, showGoesDown: true, allowDeny: true, a23High: false, mlStart: 5 };
function settingsForm(prefix, s) {
  const v = { ...DEFAULTS, ...s };
  const num = (id, label, val, hint, step = '1') => `<label class="field"><span>${label}</span><input id="${prefix}-${id}" type="number" inputmode="decimal" min="0" step="${step}" value="${val}"><small>${hint}</small></label>`;
  const tog = (id, label, val, hint) => `<label class="toggle"><input id="${prefix}-${id}" type="checkbox" ${val ? 'checked' : ''}><span><b>${label}</b><small>${hint}</small></span></label>`;
  return `<div class="grid2">
    ${num('buyIn', 'Buy-in ($)', v.buyIn, 'Starting chips. Rebuy up to 2x, max 3 times.')}
    ${num('boot', 'Boot ($)', v.boot, 'Also the minimum bet and the raise gap.')}
    ${num('maxBlind', 'Blind rounds', v.maxBlind, 'Max blind chaals before you must see.')}
    ${num('mlStart', 'Maha Laxmi chaal ($)', v.mlStart, 'Starting chaal for Maha Laxmi.')}
  </div>
  ${tog('showGoesDown', 'Show goes down', v.showGoesDown, 'Tie on a show: the asker loses. Off: pot splits.')}
  ${tog('allowDeny', 'Deny private showdowns', v.allowDeny, 'Backshow deny costs 2x chaal, sideshow deny 3x.')}
  ${tog('a23High', 'A-2-3 beats A-K-Q', v.a23High, 'Off: A-K-Q is the top sequence.')}`;
}
function readSettings(prefix) {
  const g = (id) => document.getElementById(`${prefix}-${id}`);
  return {
    buyIn: g('buyIn').value, boot: g('boot').value, maxBlind: g('maxBlind').value, mlStart: g('mlStart').value,
    showGoesDown: g('showGoesDown').checked, allowDeny: g('allowDeny').checked, a23High: g('a23High').checked,
  };
}

function renderHome() {
  const name = store.get('name', '');
  const code = new URLSearchParams(location.search).get('t') || '';
  const online = !!firebaseConfig;
  $('#app').innerHTML = `
  <main class="home">
    <header class="brand">
      <div class="brand-cards" aria-hidden="true">${cardHTML({ r: 14, s: 's' })}${cardHTML({ r: 14, s: 'h' })}${cardHTML({ r: 14, s: 'd' })}</div>
      <h1>Teen Patti</h1>
      <p>Up to 7 seats. Boot, blind, chaal, sideshow, backshow, and 17 games for the dealer to call.</p>
    </header>
    <label class="field wide"><span>Your name</span><input id="name" maxlength="14" autocomplete="nickname" value="${esc(name)}" placeholder="What the table calls you"></label>
    <section class="panel">
      <div class="tabs" role="tablist">
        <button class="tab on" data-tab="practice">Practice vs bots</button>
        <button class="tab" data-tab="host">Host a table</button>
        <button class="tab" data-tab="join">Join</button>
      </div>
      <div data-pane="practice">
        <label class="field"><span>Computer players</span><input id="p-bots" type="number" min="1" max="6" value="4"></label>
        ${settingsForm('p', store.get('settings', {}))}
        <button class="btn primary big" id="go-practice">Sit down</button>
      </div>
      <div data-pane="host" hidden>
        ${online ? '' : '<p class="note">Online tables need the Firebase setup from the README. Practice mode works right now.</p>'}
        ${settingsForm('h', store.get('settings', {}))}
        <button class="btn primary big" id="go-host" ${online ? '' : 'disabled'}>Open table</button>
      </div>
      <div data-pane="join" hidden>
        ${online ? '' : '<p class="note">Online tables need the Firebase setup from the README.</p>'}
        <label class="field"><span>Table code</span><input id="code" maxlength="5" autocapitalize="characters" value="${esc(code)}" placeholder="5 letters"></label>
        <button class="btn primary big" id="go-join" ${online ? '' : 'disabled'}>Join table</button>
      </div>
    </section>
  </main>`;
  if (code) switchTab('join');
}
function switchTab(t) {
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  document.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== t; });
}
function myName() {
  const n = ($('#name').value || '').trim();
  if (!n) { toast('Enter your name first'); $('#name').focus(); return null; }
  store.set('name', n);
  return n;
}
async function startPractice() {
  const name = myName(); if (!name) return;
  const s = readSettings('p'); store.set('settings', s);
  const bots = Math.max(1, Math.min(6, parseInt($('#p-bots').value, 10) || 4));
  server = new LocalServer(name, s, bots);
  server.watch(onView);
}
async function hostTable() {
  const name = myName(); if (!name) return;
  const s = readSettings('h'); store.set('settings', s);
  try {
    const api = await firebase();
    const r = await api.call({ op: 'create', name, settings: s });
    enterCloud(api, r.tableId);
  } catch (e) { toast(e.message); }
}
async function joinTable() {
  const name = myName(); if (!name) return;
  const code = ($('#code').value || '').trim().toUpperCase();
  if (code.length !== 5) { toast('Table codes are 5 letters'); return; }
  try {
    const api = await firebase();
    await api.call({ op: 'act', tableId: code, action: { type: 'join', name } });
    enterCloud(api, code);
  } catch (e) { toast(e.message); }
}
function enterCloud(api, code) {
  try { history.replaceState(null, '', `${location.pathname}?t=${code}`); } catch (e) { /* not allowed here */ }
  server = new CloudServer(api, code);
  server.watch(onView);
}
function onView(v) {
  view = v;
  if (v.phase === 'choose' && v.actions.canChoose && v.seats[v.me] && v.dealerSeat === v.me && ui.autoChoose !== (v.lastResult ? v.lastResult.num : -1)) {
    ui.autoChoose = v.lastResult ? v.lastResult.num : -1;
    openChooser();
  }
  if (v.phase !== 'choose' && ui.modal === 'choose') ui.modal = null;
  render();
}
function leave() {
  if (server && server.mode === 'cloud') server.act({ type: 'leave' }).catch(() => {});
  if (server) server.stop();
  server = null; view = null; ui.modal = null;
  try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignore */ }
  renderHome();
}

// ---------- cards ----------
function cardHTML(c, o = {}) {
  const cls = ['card', o.size || ''];
  if (!c) return `<div class="${cls.join(' ')} back"${o.idx != null ? ` data-swap="${o.idx}"` : ''}></div>`;
  if (c.s === 'h' || c.s === 'd') cls.push('red');
  if (o.joker) cls.push('joker');
  if (o.pick) cls.push('pick');
  return `<div class="${cls.join(' ')}"${o.idx != null ? ` data-swap="${o.idx}"` : ''} aria-label="${E.cardLabel(c)}"><b>${E.rankLabel(c.r)}</b><i>${E.SUIT_SYM[c.s]}</i>${o.joker ? '<em>J</em>' : ''}</div>`;
}

// ---------- table ----------
const POS = Array.from({ length: 7 }, (_, k) => {
  const a = Math.PI / 2 + (k * 2 * Math.PI) / 7;
  return { x: 50 + 41 * Math.cos(a), y: 50 + 40 * Math.sin(a) };
});

function seatHTML(s, v) {
  const anchor = v.me >= 0 ? v.me : 0;
  const rel = (s.seat - anchor + 7) % 7;
  const p = POS[rel];
  const rd = v.round;
  const h = s.hand;
  const turn = rd && (v.phase === 'betting' || v.phase === 'jua') && rd.turn === s.seat && h && !h.packed;
  const pend = rd && rd.pending && (rd.pending.to === s.seat);
  let tag = '';
  if (h) {
    if (h.burst) tag = '<span class="tag bad">Burst</span>';
    else if (h.packed) tag = '<span class="tag dim">Packed</span>';
    else if (h.seen) tag = '<span class="tag seen">Seen</span>';
    else tag = `<span class="tag blind">Blind ${h.blind}/${rd.maxBlind}</span>`;
  } else if (v.phase !== 'lobby') tag = '<span class="tag dim">Sitting out</span>';
  const cards = h && !s.me ? `<div class="mini">${h.cards.map((c, i) => cardHTML(c, { size: 'sm', joker: h.jokers && h.jokers[i] })).join('')}</div>` : '';
  const desc = h && h.revealed && h.desc ? `<div class="sdesc">${esc(h.desc)}</div>` : '';
  const ml = v.ml && v.ml.wins[s.seat] ? `<div class="mlw">${['J', 'Q', 'K'].map((L) => `<span class="${v.ml.wins[s.seat][L] ? 'on' : ''}">${L}</span>`).join('')}</div>` : '';
  return `<div class="seat ${turn ? 'turn' : ''} ${pend ? 'pend' : ''} ${h && h.packed ? 'out' : ''} ${s.me ? 'me' : ''}" style="left:${p.x}%;top:${p.y}%">
    ${cards}
    <div class="plate">
      ${v.dealerSeat === s.seat && v.phase !== 'lobby' ? '<span class="dchip" title="Dealer">D</span>' : ''}
      <div class="nm">${esc(s.name)}${s.me ? ' <small>(you)</small>' : ''}${s.bot ? ' <small>bot</small>' : ''}${s.host ? ' <small>host</small>' : ''}</div>
      <div class="stk">${M(s.stack)}</div>
      <div class="row">${tag}${h && h.paid ? `<span class="in">in ${M(h.paid)}</span>` : ''}</div>
      ${ml}${desc}
    </div>
  </div>`;
}

function centerHTML(v) {
  const rd = v.round;
  if (!rd) {
    if (v.phase === 'lobby') return `<div class="cmid"><div class="vname">Lobby</div><div class="sub">${v.seats.filter(Boolean).length} seated. Host starts when ready.</div></div>`;
    const r = v.lastResult;
    if (!r) return `<div class="cmid"><div class="vname">${v.phase === 'mlprep' ? 'Maha Laxmi next' : 'Pick a game'}</div></div>`;
    return `<div class="cmid result">
      <div class="sub">Round ${r.num} · ${esc(E.variationName(r.variation))}</div>
      <div class="rmsg">${esc(r.msg)}</div>
      ${r.amount ? `<div class="pot">${M(r.amount)}</div>` : ''}
      ${r.shown && r.shown.length ? `<div class="shown">${r.shown.map((x) => `<div><div class="mini">${x.cards.map((c, i) => cardHTML(c, { size: 'sm', joker: x.jokers && x.jokers[i] })).join('')}</div><small>${esc(v.seats[x.seat] ? v.seats[x.seat].name : '')}: ${esc(x.desc)}</small></div>`).join('')}</div>` : ''}
    </div>`;
  }
  const c = rd.center;
  let extra = '';
  if (c.mystery) extra = `<div class="ctr"><div class="lab">Mystery</div>${cardHTML(c.mystery, { size: 'md' })}</div>`;
  if (c.card) extra = `<div class="ccb">${[['Card', c.card], ['Color', c.color], ['Burst', c.burst]].map(([l, x]) => `<div class="ctr ${l === 'Burst' ? 'burst' : ''}"><div class="lab">${l}</div>${cardHTML(x, { size: 'md' })}</div>`).join('')}</div>`;
  if (c.jua) extra = `<div class="jua">${c.jua.piles.map((pl, k) => `<div class="pile ${pl.fixed ? 'fixed' : ''} ${k === c.jua.idx ? 'live' : ''}">${cardHTML(pl.top, { size: 'sm' })}${pl.depth > 1 ? `<small>x${pl.depth}</small>` : ''}</div>`).join('')}</div>`;
  const blindAmt = rd.stake / 2;
  return `<div class="cmid">
    <div class="vname">${esc(rd.name)}</div>
    <div class="pot">${M(rd.pot)}</div>
    <div class="sub">Chaal ${M(rd.stake)} · Blind ${M(blindAmt)}${rd.tableBoot ? ' · table boot' : ''}</div>
    ${extra}
  </div>`;
}

function myHandHTML(v) {
  const s = v.seats[v.me];
  if (!s || !s.hand) return '';
  const h = s.hand;
  const swapMode = ui.swap && v.actions.canExchange;
  const cards = h.cards.map((c, i) => cardHTML(c, { size: 'lg', joker: h.jokers && h.jokers[i], pick: swapMode, idx: swapMode ? i : null })).join('');
  let line = '';
  if (h.burst) line = '<span class="bad">Burst. You are out this hand.</span>';
  else if (h.packed) line = 'Packed';
  else if (h.seen && h.desc) line = esc(h.desc);
  else if (!h.seen) line = `Playing blind (${h.blind}/${v.round.maxBlind})`;
  return `<div class="myhand ${h.packed ? 'out' : ''} ${swapMode ? 'swapping' : ''}">
    <div class="hcards">${cards}</div>
    <div class="hdesc">${swapMode ? 'Tap the card to swap' : line}</div>
  </div>`;
}

function actionsHTML(v) {
  const A = v.actions, rd = v.round;
  const me = v.seats[v.me];
  const out = [];
  const name = (i) => (v.seats[i] ? esc(v.seats[i].name) : 'someone');
  if (!me) return '<div class="wait">You left this table.</div>';
  if (v.phase === 'lobby') {
    if (A.isHost) {
      out.push(`<div class="btns">
        <button class="btn" data-a="rules-edit">Table rules</button>
        <button class="btn" data-a="addBot">Add bot</button>
        <button class="btn primary" data-a="start" ${A.canStart ? '' : 'disabled'}>Start game</button></div>`);
      const bots = v.seats.filter((s) => s && s.bot);
      if (bots.length) out.push(`<div class="chips">${bots.map((b) => `<button class="chip" data-a="removeBot" data-seat="${b.seat}">${esc(b.name)} ✕</button>`).join('')}</div>`);
      if (!A.canStart) out.push('<div class="wait">Need at least 2 players. Share the code or add a bot.</div>');
    } else out.push('<div class="wait">Waiting for the host to start.</div>');
  } else if (v.phase === 'choose') {
    if (A.canChoose) out.push(`<div class="btns"><button class="btn primary" data-a="open-choose">${v.dealerSeat === v.me ? 'Pick the next game' : `Pick for ${name(v.dealerSeat)}`}</button></div>`);
    else out.push(`<div class="wait">${name(v.dealerSeat)} is picking the next game.</div>`);
  } else if (v.phase === 'mlprep') {
    out.push('<div class="wait">Maha Laxmi is next. Rebuy now if you are low. No rebuys once cards are dealt.</div>');
    if (A.canMlDeal) out.push('<div class="btns"><button class="btn" data-a="mlCancel">Pick another game</button><button class="btn primary" data-a="mlDeal">Deal Maha Laxmi</button></div>');
  } else if (rd) {
    const h = me.hand;
    if (A.respond) {
      const r = A.respond;
      out.push(`<div class="ask"><b>${name(r.from)}</b> asks you for a ${r.type}. You both see each other's cards. The better hand stays in.</div>
      <div class="btns"><button class="btn primary" data-a="accept">Accept</button>
      ${r.denyAllowed ? `<button class="btn" data-a="deny" ${r.canDeny ? '' : 'disabled'}>Deny, pay ${M(r.denyCost)}</button>` : ''}</div>`);
    } else if (rd.pending) {
      out.push(`<div class="wait">${name(rd.pending.from)} asked ${name(rd.pending.to)} for a ${rd.pending.type}.</div>`);
    } else if (A.jua) {
      out.push(`<div class="wait">Your turn. Flip for a new center card, or fix this one as a joker for everyone.</div>
      <div class="btns"><button class="btn" data-a="pack">Pack</button>
      <button class="btn" data-a="flip" ${A.jua.canFlip ? '' : 'disabled'}>Flip ${M(A.jua.flipCost)}</button>
      <button class="btn primary" data-a="fix" ${A.jua.canFix ? '' : 'disabled'}>Fix ${M(A.jua.fixCost)}</button></div>`);
    } else if (A.chaal) {
      const c = A.chaal;
      const k = Math.min(ui.raise, c.maxRaise);
      const pay = c.amount + k * c.unit;
      const newStake = c.blind ? pay * 2 : pay;
      out.push(`<div class="btns main">
        <button class="btn" data-a="pack">Pack</button>
        <button class="btn primary" data-a="chaal" ${c.canAfford ? '' : 'disabled'}>${c.blind ? 'Blind' : 'Chaal'} ${M(c.amount)}</button>
      </div>
      <div class="raise">
        <button class="btn sq" data-a="r-" ${k <= 0 ? 'disabled' : ''} aria-label="Smaller raise">−</button>
        <div class="rlab">${k ? `Raise: pay ${M(pay)}<small>chaal becomes ${M(newStake)}</small>` : `Raise in steps of ${M(c.unit)}`}</div>
        <button class="btn sq" data-a="r+" ${k >= c.maxRaise ? 'disabled' : ''} aria-label="Bigger raise">+</button>
        <button class="btn" data-a="raise" ${k ? '' : 'disabled'}>Raise</button>
      </div>`);
      const extras = [];
      if (A.showCost != null) extras.push(`<button class="btn" data-a="show" ${A.canShow ? '' : 'disabled'} title="${esc(A.showBlocked || '')}">Show ${M(A.showCost)}</button>`);
      if (A.sideCost != null) {
        extras.push(`<button class="btn" data-a="backshow" ${A.canBackshow ? '' : 'disabled'}>Backshow ${name(A.backTarget)}</button>`);
        extras.push(`<button class="btn" data-a="sideshow" ${A.canSideshow ? '' : 'disabled'}>Sideshow ${name(A.sideTarget)}</button>`);
      }
      if (A.canExchange) extras.push(`<button class="btn ${ui.swap ? 'on' : ''}" data-a="swap">${ui.swap ? 'Cancel swap' : 'Swap a card'}</button>`);
      if (extras.length) out.push(`<div class="btns">${extras.join('')}</div>`);
      if (A.showBlocked) out.push(`<div class="hint">No show yet: ${esc(A.showBlocked)}.</div>`);
      if (A.privateBlocked) out.push(`<div class="hint">${esc(A.privateBlocked)}.</div>`);
      if (!c.canAfford) out.push(`<div class="hint">You need ${M(c.amount)}. ${A.rebuy.allowed ? 'Rebuy or pack.' : 'Pack.'}</div>`);
      if (A.sideCost != null) out.push(`<div class="hint">Sideshow and backshow cost one chaal (${M(A.sideCost)}).</div>`);
    } else if (h && !h.packed) {
      const t = rd.turn;
      out.push(`<div class="wait">${v.phase === 'jua' ? 'Jua: ' : ''}${name(t)} to act.</div>`);
    } else {
      out.push(`<div class="wait">${h ? 'You are out of this hand.' : 'You are sitting out this hand.'} ${name(rd.turn)} to act.</div>`);
    }
    if (A.canSee) out.unshift('<div class="btns"><button class="btn see" data-a="see">See cards</button></div>');
    if (A.afkTarget != null && A.afkTarget !== undefined) out.push(`<div class="btns"><button class="btn ghost" data-a="afk">${rd.pending ? `Accept for ${name(A.afkTarget)} (away)` : `Pack ${name(A.afkTarget)} (away)`}</button></div>`);
  }
  if (A.rebuy && A.rebuy.allowed && v.phase !== 'lobby') out.push(`<div class="btns"><button class="btn ghost" data-a="rebuy">Rebuy (${A.rebuy.left} left)</button></div>`);
  return out.join('');
}

function render() {
  if (!view) return;
  const v = view;
  const rd = v.round;
  // keep what the player typed or scrolled in an open modal across live updates
  const oldModal = document.querySelector('.modal');
  const keep = { scroll: oldModal ? oldModal.scrollTop : 0, vals: {} };
  if (oldModal) oldModal.querySelectorAll('input[id]').forEach((i) => { keep.vals[i.id] = i.type === 'checkbox' ? i.checked : i.value; });
  const title = rd ? `Round ${rd.num}` : v.phase === 'lobby' ? 'Lobby' : 'Between rounds';
  const codeBtn = server && server.mode === 'cloud'
    ? `<button class="code" data-a="copy" title="Copy invite link">${esc(v.id)} <small>copy invite</small></button>`
    : '<span class="code">Practice</span>';
  $('#app').innerHTML = `
  <div class="table">
    <header class="bar">
      ${codeBtn}
      <span class="rt">${esc(title)}</span>
      <nav><button class="btn ghost sm" data-a="rules">Rules</button><button class="btn ghost sm" data-a="ledger">Chips</button><button class="btn ghost sm" data-a="leave">Leave</button></nav>
    </header>
    <div class="felt"><div class="oval"></div>
      <div class="center">${centerHTML(v)}</div>
      ${v.seats.filter(Boolean).map((s) => seatHTML(s, v)).join('')}
    </div>
    ${myHandHTML(v)}
    <section class="actions">${actionsHTML(v)}</section>
    <section class="log ${ui.logOpen ? 'open' : ''}" data-a="log">
      ${(ui.logOpen ? v.log.slice(-25) : v.log.slice(-3)).map((l) => `<div>${esc(l)}</div>`).join('')}
      <small>${ui.logOpen ? 'Tap to shrink' : 'Tap for full table log'}</small>
    </section>
  </div>
  ${modalHTML(v)}`;
  const m = document.querySelector('.modal');
  if (m && oldModal) {
    m.scrollTop = keep.scroll;
    Object.entries(keep.vals).forEach(([id, val]) => {
      const i = document.getElementById(id);
      if (!i || id === 'tb') return;
      if (i.type === 'checkbox') i.checked = val; else i.value = val;
    });
  }
}

// ---------- modals ----------
function openChooser() { ui.modal = 'choose'; ui.choice = ui.choice || { variation: 'classic', tableBoot: false, faceUp: 1 }; }
function modalHTML(v) {
  if (!ui.modal) return '';
  let body = '';
  const S = v.settings;
  if (ui.modal === 'choose') {
    const c = ui.choice;
    const seated = v.seats.filter(Boolean).length;
    body = `<h2>Pick the next game</h2>
      <div class="vlist">${v.variations.map((x) => `<label class="vopt ${c.variation === x.key ? 'on' : ''}"><input type="radio" name="var" value="${x.key}" ${c.variation === x.key ? 'checked' : ''}><span><b>${esc(x.name)}</b><small>${esc(x.short)}</small></span></label>`).join('')}</div>
      ${c.variation === 'faceup' ? `<div class="seg"><span>Face up cards</span><button class="chip ${c.faceUp === 1 ? 'on' : ''}" data-a="fu" data-n="1">1</button><button class="chip ${c.faceUp === 2 ? 'on' : ''}" data-a="fu" data-n="2">2</button></div>` : ''}
      <label class="toggle"><input id="tb" type="checkbox" ${c.tableBoot ? 'checked' : ''}><span><b>Table boot</b><small>You put the boot for everyone, about ${M(S.boot * seated)}. Otherwise everyone puts their own ${M(S.boot)}.</small></span></label>
      <div class="btns"><button class="btn" data-a="close">Cancel</button><button class="btn primary" data-a="deal">Deal</button></div>`;
  } else if (ui.modal === 'rebuy') {
    const R = v.actions.rebuy;
    body = `<h2>Rebuy</h2><p>Up to ${M(R.max)}. ${R.left} rebuy${R.left === 1 ? '' : 's'} left.</p>
      <label class="field"><span>Amount ($)</span><input id="rb" type="number" inputmode="decimal" min="1" max="${R.max / 100}" value="${S.buyIn / 100}"></label>
      <div class="btns"><button class="btn" data-a="close">Cancel</button><button class="btn primary" data-a="rebuy-go">Add chips</button></div>`;
  } else if (ui.modal === 'ledger') {
    const rows = v.seats.filter(Boolean).map((s) => {
      const live = s.stack + (s.hand ? 0 : 0);
      const net = live - s.boughtIn;
      return `<tr><td>${esc(s.name)}</td><td>${M(s.stack)}</td><td>${M(s.boughtIn)}</td><td class="${net >= 0 ? 'up' : 'down'}">${net >= 0 ? '+' : ''}${M(net)}</td></tr>`;
    }).join('');
    body = `<h2>Chips</h2><div class="tw"><table><thead><tr><th>Player</th><th>Stack</th><th>Bought in</th><th>Net</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="hint">Net does not count chips sitting in the current pot.</p>
      <div class="btns"><button class="btn primary" data-a="close">Done</button></div>`;
  } else if (ui.modal === 'rules') {
    body = `<h2>Table rules</h2>
      <ul class="rules">
        <li>Buy-in ${M(S.buyIn)}. Boot ${M(S.boot)}, which is also the minimum bet and the raise gap.</li>
        <li>Blind plays half the chaal. Max ${S.maxBlind} blind round${S.maxBlind === 1 ? '' : 's'}, then you have to see.</li>
        <li>Show goes down: <b>${S.showGoesDown ? 'On. Tie on a show, the asker loses.' : 'Off. Tie on a show splits the pot.'}</b></li>
        <li>Deny private showdowns: <b>${S.allowDeny ? 'On. Backshow deny 2x chaal, sideshow deny 3x.' : 'Off.'}</b></li>
        <li>Top sequence: <b>${S.a23High ? 'A-2-3' : 'A-K-Q'}</b>.</li>
        <li>Show only with 2 left, costs one chaal. A seen player can't ask a blind player for a show.</li>
        <li>No sideshow or backshow until everyone left in the hand is off blind.</li>
        <li>Private showdown tie: better dealt cards win, then a card draw. With show goes down on, the asker loses.</li>
        <li>Rebuy up to 2x the buy-in, 3 times. Not during Maha Laxmi.</li>
        <li>Winner deals next and picks the game. First card moves one seat each hand.</li>
      </ul>
      <h3>Hand ranking</h3><p>Trail, Pure sequence, Sequence, Color, Pair, High card.</p>
      <h3>Games</h3><div class="vlist ro">${v.variations.map((x) => `<div class="vopt"><span><b>${esc(x.name)}</b><small>${esc(x.short)}</small></span></div>`).join('')}</div>
      <div class="btns"><button class="btn primary" data-a="close">Done</button></div>`;
  } else if (ui.modal === 'rules-edit') {
    body = `<h2>Table rules</h2><p class="hint">Changing rules resets everyone's chips to the buy-in.</p>
      ${settingsForm('e', {
        buyIn: S.buyIn / 100, boot: S.boot / 100, maxBlind: S.maxBlind, mlStart: S.mlStart / 100,
        showGoesDown: S.showGoesDown, allowDeny: S.allowDeny, a23High: S.a23High,
      })}
      <div class="btns"><button class="btn" data-a="close">Cancel</button><button class="btn primary" data-a="save-rules">Save</button></div>`;
  } else if (ui.modal === 'leave') {
    body = `<h2>Leave the table?</h2><p>${view.round && view.seats[view.me] && view.seats[view.me].hand && !view.seats[view.me].hand.packed ? 'You are in a hand. Leaving packs your cards.' : 'Your seat opens up for someone else.'}</p>
      <div class="btns"><button class="btn" data-a="close">Stay</button><button class="btn primary" data-a="leave-go">Leave</button></div>`;
  }
  return `<div class="scrim" data-a="scrim"><div class="modal" role="dialog" aria-modal="true">${body}</div></div>`;
}

// ---------- events ----------
document.addEventListener('click', async (ev) => {
  const tab = ev.target.closest('.tab');
  if (tab) { switchTab(tab.dataset.tab); return; }
  if (ev.target.closest('#go-practice')) return startPractice();
  if (ev.target.closest('#go-host')) return hostTable();
  if (ev.target.closest('#go-join')) return joinTable();
  const sw = ev.target.closest('[data-swap]');
  if (sw && ui.swap) return act({ type: 'exchange', index: Number(sw.dataset.swap) });
  const el = ev.target.closest('[data-a]');
  if (!el || el.disabled) return;
  const a = el.dataset.a;
  if (a === 'scrim') { if (ev.target === el) { ui.modal = null; render(); } return; }
  const A = view ? view.actions : {};
  switch (a) {
    case 'close': ui.modal = null; render(); return;
    case 'log': ui.logOpen = !ui.logOpen; render(); return;
    case 'rules': case 'ledger': case 'rules-edit': ui.modal = a; render(); return;
    case 'leave': ui.modal = 'leave'; render(); return;
    case 'leave-go': leave(); return;
    case 'rebuy': ui.modal = 'rebuy'; render(); return;
    case 'rebuy-go': { const amt = $('#rb').value; ui.modal = null; return act({ type: 'rebuy', amount: amt }); }
    case 'save-rules': { const s = readSettings('e'); ui.modal = null; return act({ type: 'settings', settings: s }); }
    case 'open-choose': openChooser(); render(); return;
    case 'fu': ui.choice.faceUp = Number(el.dataset.n); render(); return;
    case 'deal': {
      ui.choice.tableBoot = $('#tb').checked;
      ui.modal = null;
      return act({ type: 'choose', ...ui.choice });
    }
    case 'copy': {
      const link = `${location.origin}${location.pathname}?t=${view.id}`;
      try { await navigator.clipboard.writeText(link); toast('Invite link copied'); } catch (e) { toast(`Code ${view.id}: ${link}`); }
      return;
    }
    case 'r+': ui.raise = Math.min(ui.raise + 1, A.chaal ? A.chaal.maxRaise : 0); render(); return;
    case 'r-': ui.raise = Math.max(0, ui.raise - 1); render(); return;
    case 'raise': return act({ type: 'chaal', raise: ui.raise });
    case 'chaal': return act({ type: 'chaal', raise: 0 });
    case 'swap': ui.swap = !ui.swap; render(); return;
    case 'accept': return act({ type: 'respond', accept: true });
    case 'deny': return act({ type: 'respond', accept: false });
    case 'removeBot': return act({ type: 'removeBot', seat: Number(el.dataset.seat) });
    case 'see': case 'pack': case 'show': case 'sideshow': case 'backshow': case 'flip': case 'fix':
    case 'start': case 'addBot': case 'mlDeal': case 'mlCancel': case 'afk':
      return act({ type: a });
    default: break;
  }
});
document.addEventListener('change', (ev) => {
  if (ev.target.id === 'tb' && ui.choice) { ui.choice.tableBoot = ev.target.checked; return; }
  if (ev.target.name === 'var' && ui.choice) {
    ui.choice.variation = ev.target.value;
    const tb = $('#tb'); if (tb) ui.choice.tableBoot = tb.checked;
    render();
  }
});

renderHome();
