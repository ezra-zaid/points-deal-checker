// ============================================================================
// DECISION ORDER — the entire point of this tool:
//   1. Trip + programs held  → which partners are even RELEVANT
//   2. Real prices you look up → which option is actually BEST
//   3. Transfer bonus          → tiebreaker on already-priced options, LAST
// Every function below slots into exactly one of those steps. Bonuses are
// structurally unable to influence a row until that row has a real price.
// ============================================================================

const $ = id => document.getElementById(id);

const fmt = n => Math.round(n).toLocaleString();
const num = s => parseFloat(String(s).replace(/[^0-9.]/g, '')) || 0;

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Working state, persisted so closing the popup mid-research loses nothing
let session = {
  view: 'home',       // 'home' | 'wizard' | 'trip'
  route: '',
  cash: 0,
  held: {},           // { amex: true, ... }
  balances: {},       // { amex: 85000, ... }
  entries: {},        // { partnerId: { points, fees, seat } } — the REAL prices
  sort: 'value',
  filter: '',
  // The bonus wizard's in-progress answers (survives closing the popup)
  wizard: { step: 1, issuer: 'amex', partner: '', pct: 0, expires: '', route: '', cash: 0, points: 0, fees: 0, seat: false },
};
let bonuses = [];     // [{ id, issuer, partner, pct, expires }]

let saveTimer;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => chrome.storage.local.set({ session, bonuses }), 300);
}

// ============================================================================
// STEP 1 — which partners can my points reach?
// A partner is "reachable" if any issuer I hold transfers to it. That's the
// only thing the built-in lookup table decides. The alliance chip is a reach
// hint (a SkyTeam program can usually book SkyTeam-wide awards).
// ============================================================================

function heldLinksFor(partnerId) {
  return LINKS.filter(l => l.partner === partnerId && session.held[l.issuer]);
}

// If two of my issuers reach the same partner, prefer the one where each
// point sent buys the most partner points ("how many you get per point you send")
function bestLink(links) {
  return links.reduce((a, b) => (b.to / b.from > a.to / a.from ? b : a));
}

function reachablePartners() {
  return PARTNERS.filter(p => heldLinksFor(p.id).length > 0);
}

// ============================================================================
// STEP 2 — the math, only ever run on user-entered prices
// ============================================================================

function computeRow(partner) {
  const links = heldLinksFor(partner.id);
  const link = bestLink(links);
  const issuer = ISSUERS.find(i => i.id === link.issuer);
  const ratio = link.to / link.from;                     // received per point sent
  const entry = session.entries[partner.id] || {};
  const row = { partner, link, links, issuer, ratio, entry };

  if (entry.points > 0) {
    // Issuers transfer in fixed increments — round UP what must be sent
    const inc = issuer.increment;
    row.send = Math.ceil(entry.points / ratio / inc) * inc;
    row.short = Math.max(0, row.send - (session.balances[issuer.id] || 0));
    // Apples-to-apples number: cents of cash value per point sent.
    // (cash price − award fees) is what the points are really buying.
    if (session.cash > 0) row.value = ((session.cash - (entry.fees || 0)) * 100) / row.send;

    // STEP 3 applied — and ONLY because this row already has a real price.
    const bonus = activeBonus(issuer.id, partner.id);
    if (bonus) {
      const boosted = ratio * (1 + bonus.pct / 100);
      row.bonusSend = Math.ceil(entry.points / boosted / inc) * inc;
      if (session.cash > 0) row.bonusValue = ((session.cash - (entry.fees || 0)) * 100) / row.bonusSend;
      row.bonus = bonus;
    }
  } else {
    // No price yet → the bonus may exist but gets NO influence, only a nudge
    row.bonusWaiting = activeBonus(issuer.id, partner.id);
  }
  return row;
}

function activeBonus(issuerId, partnerId) {
  const today = new Date().toISOString().split('T')[0];
  return bonuses.find(b =>
    b.issuer === issuerId && b.partner === partnerId && (!b.expires || b.expires >= today)
  ) || null;
}

function allRows() {
  const f = session.filter.toLowerCase();
  let rows = reachablePartners()
    .filter(p => !f || p.name.toLowerCase().includes(f))
    .map(computeRow);

  // Priced rows first (ranked), unpriced rows after (alphabetical, unranked).
  // Bonus-adjusted numbers ARE used for ranking priced rows — that's the
  // legitimate tiebreaker role. Unpriced rows can never be ranked, so a bonus
  // can never make an unpriced partner "look best". That's the guarantee.
  const priced   = rows.filter(r => r.send);
  const unpriced = rows.filter(r => !r.send).sort((a, b) => a.partner.name.localeCompare(b.partner.name));
  priced.sort((a, b) => {
    switch (session.sort) {
      case 'send': return (a.bonusSend ?? a.send) - (b.bonusSend ?? b.send);
      case 'name': return a.partner.name.localeCompare(b.partner.name);
      default:     return ((b.bonusValue ?? b.value) || 0) - ((a.bonusValue ?? a.value) || 0)
                       || (a.bonusSend ?? a.send) - (b.bonusSend ?? b.send);
    }
  });
  return [...priced, ...unpriced];
}

// ============================================================================
// RENDERING
// ============================================================================

function renderIssuers() {
  $('issuers').innerHTML = ISSUERS.map(i => `
    <div class="issuer-row">
      <label class="check">
        <input type="checkbox" data-issuer="${i.id}" ${session.held[i.id] ? 'checked' : ''}>
        ${esc(i.name)}
      </label>
      <input class="input bal-input" data-bal="${i.id}" type="text" inputmode="numeric"
             placeholder="balance" value="${session.balances[i.id] ? fmt(session.balances[i.id]) : ''}"
             ${session.held[i.id] ? '' : 'disabled'}>
    </div>`).join('');

  $('issuers').querySelectorAll('[data-issuer]').forEach(cb =>
    cb.addEventListener('change', () => {
      session.held[cb.dataset.issuer] = cb.checked;
      persist();
      renderIssuers();
      renderRows();
      renderBonusForm();
    })
  );
  $('issuers').querySelectorAll('[data-bal]').forEach(inp =>
    inp.addEventListener('input', () => {
      session.balances[inp.dataset.bal] = num(inp.value);
      persist();
      updateComputedCells();
    })
  );
}

function ratioWords(link) {
  const per = link.to / link.from;
  return `send 1 → get ${per === 1 ? '1' : (+per.toFixed(2))}`;
}

function rowComputedHTML(r) {
  if (!r.send) {
    return r.bonusWaiting
      ? `<span class="nudge">+${r.bonusWaiting.pct}% bonus saved — but price the flight first. Bonuses tempt; prices decide.</span>`
      : `<span class="unpriced">not priced yet</span>`;
  }
  const bits = [];
  bits.push(`transfer <b>${fmt(r.bonusSend ?? r.send)}</b> ${esc(r.issuer.short)} pts`);
  if (r.bonus) bits.push(`<span class="bonus-tag">+${r.bonus.pct}% bonus saves ${fmt(r.send - r.bonusSend)}</span>`);
  if ((r.bonusValue ?? r.value) != null) {
    const v = r.bonusValue ?? r.value;
    bits.push(`<b class="${v >= 1.5 ? 'v-good' : v >= 1 ? 'v-mid' : 'v-bad'}">${v <= 0 ? '—' : v.toFixed(1) + '¢'}</b> per pt sent`);
  }
  if (r.short > 0) bits.push(`<span class="short">${fmt(r.short)} short</span>`);
  return bits.join(' · ');
}

function renderRows() {
  const rows = allRows();
  if (!rows.length) {
    $('rows').innerHTML = `<p class="empty">${Object.values(session.held).some(Boolean)
      ? 'No programs match the filter.'
      : 'Tick the points you hold in step 1 — the reachable programs appear here.'}</p>`;
    return;
  }
  $('rows').innerHTML = rows.map(r => {
    const e = r.entry;
    return `
    <div class="prow" data-partner="${r.partner.id}">
      <div class="prow-head">
        <span class="pname">${esc(r.partner.name)}</span>
        <span class="chip chip-${r.partner.type}">${esc(r.partner.alliance)}</span>
        ${r.link.feeWarn ? `<span class="chip chip-fee" title="The issuer may add a fee on this transfer — check the transfer page before sending">⚠ fee may apply</span>` : ''}
      </div>
      <div class="prow-via">via ${esc(r.issuer.short)} — ${ratioWords(r.link)}${r.links.length > 1 ? ` <span class="also">(also: ${r.links.filter(l => l !== r.link).map(l => esc(ISSUERS.find(i => i.id === l.issuer).short)).join(', ')})</span>` : ''}</div>
      <div class="prow-inputs">
        <input class="input in-points" type="text" inputmode="numeric" placeholder="points needed"
               value="${e.points ? fmt(e.points) : ''}">
        <input class="input in-fees" type="text" inputmode="decimal" placeholder="taxes/fees $"
               value="${e.fees || ''}">
        <label class="check seat ${e.points ? '' : 'hidden'}">
          <input type="checkbox" class="in-seat" ${e.seat ? 'checked' : ''}> seat found
        </label>
      </div>
      <div class="prow-computed">${rowComputedHTML(r)}</div>
    </div>`;
  }).join('');

  // Inputs update THEIR row live; re-sorting only happens on blur so the row
  // you're typing in doesn't jump around under your cursor.
  $('rows').querySelectorAll('.prow').forEach(rowEl => {
    const pid = rowEl.dataset.partner;
    const entry = () => (session.entries[pid] ??= { points: 0, fees: 0, seat: false });
    rowEl.querySelector('.in-points').addEventListener('input', e => {
      entry().points = num(e.target.value);
      rowEl.querySelector('.seat').classList.toggle('hidden', !entry().points);
      persist(); updateComputedCells();
    });
    rowEl.querySelector('.in-fees').addEventListener('input', e => {
      entry().fees = num(e.target.value);
      persist(); updateComputedCells();
    });
    rowEl.querySelector('.in-points').addEventListener('change', renderRows);
    rowEl.querySelector('.in-fees').addEventListener('change', renderRows);
    rowEl.querySelector('.in-seat').addEventListener('change', e => {
      entry().seat = e.target.checked;
      persist();
    });
  });
}

function updateComputedCells() {
  $('rows').querySelectorAll('.prow').forEach(rowEl => {
    const partner = PARTNERS.find(p => p.id === rowEl.dataset.partner);
    if (partner) rowEl.querySelector('.prow-computed').innerHTML = rowComputedHTML(computeRow(partner));
  });
}

// ============================================================================
// THE FINAL GATE — refuses to bless a transfer that skipped the steps.
// This is requirement #7: no lock-in without a confirmed, priced flight.
// ============================================================================

function renderDecision() {
  const priced = allRows().filter(r => r.send);
  const box = $('decision');

  if (!priced.length) {
    box.innerHTML = `<p class="warn crit">You haven't confirmed a flight exists yet — <b>transfers are final and can't be reversed</b>. Price at least one real award in step 2 first.</p>`;
    return;
  }
  const top = priced[0];
  if (!top.entry.seat) {
    box.innerHTML = `<p class="warn crit">Your best option is <b>${esc(top.partner.name)}</b>, but you haven't ticked "seat found". Open their site, confirm the award seat is actually bookable, then come back — <b>transfers are final and can't be reversed</b>.</p>`;
    return;
  }
  if (top.short > 0) {
    box.innerHTML = `<p class="warn crit">You're <b>${fmt(top.short)} ${esc(top.issuer.short)} points short</b> for ${esc(top.partner.name)}. Don't transfer a partial amount hoping to top up later — earn or buy the difference first, or pick the next option.</p>`;
    return;
  }
  const send = top.bonusSend ?? top.send;
  box.innerHTML = `
    <p class="go">
      ✅ <b>Transfer ${fmt(send)} ${esc(top.issuer.short)} points → ${esc(top.partner.name)}</b>,
      then book immediately — award seats can vanish.
      ${top.bonus ? `The +${top.bonus.pct}% bonus saved you ${fmt(top.send - top.bonusSend)} points — a nice tiebreaker, not the reason you're doing this.` : ''}
      ${top.link.feeWarn ? `<br>⚠ Check the transfer page for a fee before confirming.` : ''}
    </p>`;
}

// ============================================================================
// STEP 3 UI — bonuses the user pastes in manually
// ============================================================================

function renderBonusForm() {
  const heldIssuers = ISSUERS.filter(i => session.held[i.id]);
  const iSel = $('bonus-issuer');
  iSel.innerHTML = heldIssuers.length
    ? heldIssuers.map(i => `<option value="${i.id}">${esc(i.short)}</option>`).join('')
    : '<option value="">— tick a program in step 1 —</option>';
  renderBonusPartnerSel();
}

function renderBonusPartnerSel() {
  const issuerId = $('bonus-issuer').value;
  const pSel = $('bonus-partner');
  const opts = LINKS.filter(l => l.issuer === issuerId)
    .map(l => PARTNERS.find(p => p.id === l.partner))
    .sort((a, b) => a.name.localeCompare(b.name));
  pSel.innerHTML = opts.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
}

function renderBonuses() {
  const today = new Date().toISOString().split('T')[0];
  $('bonus-list').innerHTML = bonuses.map(b => {
    const issuer = ISSUERS.find(i => i.id === b.issuer);
    const partner = PARTNERS.find(p => p.id === b.partner);
    const expired = b.expires && b.expires < today;
    return `
    <div class="bonus-row ${expired ? 'expired' : ''}" data-id="${b.id}">
      <span class="bonus-main"><b>+${b.pct}%</b> ${esc(issuer?.short)} → ${esc(partner?.name)}</span>
      <span class="bonus-exp">${expired ? 'expired' : b.expires ? `until ${esc(b.expires)}` : 'no expiry set'}</span>
      <button class="bonus-del" title="Remove" aria-label="Remove">✕</button>
    </div>`;
  }).join('') || '<p class="empty">No bonuses saved. That\'s fine — most good redemptions never involve one.</p>';
}

// ============================================================================
// VIEWS — home (two doors), wizard (bonus funnel), trip (the full table)
// ============================================================================

function setView(v) {
  session.view = v;
  persist();
  ['home', 'wizard', 'trip'].forEach(name =>
    $(`view-${name}`).classList.toggle('hidden', name !== v));
  $('back-btn').classList.toggle('hidden', v === 'home');
  $('reset-btn').classList.toggle('hidden', v !== 'trip');
  if (v === 'home')   renderHome();
  if (v === 'wizard') renderWizard();
  if (v === 'trip')   { renderRows(); renderBonuses(); renderBonusForm(); }
}

function renderHome() {
  const today = new Date().toISOString().split('T')[0];
  const active = bonuses.filter(b => !b.expires || b.expires >= today);
  $('home-bonuses').innerHTML = active.length ? `
    <p class="home-bonus-head">Bonuses you've saved — none of them need action today:</p>
    ${active.map(b => {
      const issuer  = ISSUERS.find(i => i.id === b.issuer);
      const partner = PARTNERS.find(p => p.id === b.partner);
      return `<p class="home-bonus">+${b.pct}% ${esc(issuer?.short)} → ${esc(partner?.name)}${b.expires ? ` <span>until ${esc(b.expires)}</span>` : ''}</p>`;
    }).join('')}` : '';
}

// ============================================================================
// THE BONUS WIZARD — one question at a time.
// The order of the questions IS the product: capture the bonus (kill the
// urgency), demand a trip (hard stop without one), demand a cash anchor,
// demand a real award price — and only then let the bonus into the math.
// ============================================================================

const VERDICT_RED = 1.0, VERDICT_GREEN = 1.5;
const vLabel = v => v < VERDICT_RED ? 'bad' : v < VERDICT_GREEN ? 'borderline' : 'good';
const vClass = v => v < VERDICT_RED ? 'v-bad' : v < VERDICT_GREEN ? 'v-mid' : 'v-good';

function wiz() { return session.wizard; }

function saveWizardBonus() {
  // Update-or-insert so re-running the wizard doesn't stack duplicates
  const w = wiz();
  const existing = bonuses.find(b => b.issuer === w.issuer && b.partner === w.partner);
  if (existing) { existing.pct = w.pct; existing.expires = w.expires; }
  else bonuses.unshift({ id: Date.now().toString(36), issuer: w.issuer, partner: w.partner, pct: w.pct, expires: w.expires });
  persist();
}

function renderWizard() {
  const w = wiz();
  const issuer  = ISSUERS.find(i => i.id === w.issuer);
  const partner = PARTNERS.find(p => p.id === w.partner);
  const box = $('wizard');

  // ---- Step 1: what's the bonus? (capturing it starts defusing it) ----
  if (w.step === 1) {
    const partnerOpts = LINKS.filter(l => l.issuer === w.issuer)
      .map(l => PARTNERS.find(p => p.id === l.partner))
      .sort((a, b) => a.name.localeCompare(b.name));
    box.innerHTML = `
      <section>
        <h2><span class="step-n">1</span> What's the bonus you saw?</h2>
        <div class="wiz-grid">
          <label class="field">Your points
            <select id="w-issuer" class="input">
              ${ISSUERS.map(i => `<option value="${i.id}" ${i.id === w.issuer ? 'selected' : ''}>${esc(i.short)}</option>`).join('')}
            </select>
          </label>
          <label class="field">Going to
            <select id="w-partner" class="input">
              ${partnerOpts.map(p => `<option value="${p.id}" ${p.id === w.partner ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
            </select>
          </label>
          <label class="field">Bonus %
            <input id="w-pct" class="input" type="text" inputmode="numeric" placeholder="30" value="${w.pct || ''}">
          </label>
          <label class="field">Ends when? (check the promo)
            <input id="w-exp" class="input" type="date" value="${esc(w.expires)}">
          </label>
        </div>
        <button id="w-next" class="btn">Save it &amp; breathe</button>
      </section>`;
    $('w-issuer').addEventListener('change', e => { w.issuer = e.target.value; w.partner = ''; persist(); renderWizard(); });
    $('w-partner').addEventListener('change', e => { w.partner = e.target.value; persist(); });
    $('w-pct').addEventListener('input', e => { w.pct = num(e.target.value); persist(); });
    $('w-exp').addEventListener('input', e => { w.expires = e.target.value; persist(); });
    $('w-next').addEventListener('click', () => {
      w.partner = $('w-partner').value;
      if (!w.partner || !w.pct) return;
      saveWizardBonus();
      w.step = 2; persist(); renderWizard();
    });
    return;
  }

  // ---- Step 2: the fork — do you actually have a trip? ----
  if (w.step === 2) {
    box.innerHTML = `
      <section>
        <p class="wiz-calm">✅ Saved. ${w.expires ? `It runs until <b>${esc(w.expires)}</b> — you have time.` : `No end date entered — but either way, don't rush.`}
        Bonuses like this come back a few times a year. Nothing needs to happen right now.</p>
        <h2><span class="step-n">2</span> Do you have a specific trip in mind — a destination and rough dates?</h2>
        <div class="wiz-choice">
          <button id="w-yes" class="btn">Yes, a real trip</button>
          <button id="w-no" class="btn btn-quiet">Not really</button>
        </div>
      </section>`;
    $('w-yes').addEventListener('click', () => { w.step = 3; persist(); renderWizard(); });
    $('w-no').addEventListener('click', () => { w.step = 20; persist(); renderWizard(); });
    return;
  }

  // ---- Step 20: THE HARD STOP. This screen is the whole point. ----
  if (w.step === 20) {
    box.innerHTML = `
      <section>
        <div class="wiz-stop">
          <p class="wiz-stop-head">🛑 Then this bonus isn't for you — yet.</p>
          <p>Points sitting in ${esc(issuer.short)} can still go to <b>${LINKS.filter(l => l.issuer === w.issuer).length} different programs</b>.
          Points moved to ${esc(partner.name)} are stuck there <b>forever</b> — bonus or no bonus.</p>
          <p>Transferring without a flight to book isn't getting a deal, it's giving up your flexibility for free.</p>
          <p>The bonus is saved${w.expires ? ` (until ${esc(w.expires)})` : ''}. If a real trip shows up before it ends, come back and we'll check it properly.</p>
        </div>
        <button id="w-done" class="btn">Okay — do nothing 👍</button>
      </section>`;
    $('w-done').addEventListener('click', () => { session.wizard = { ...session.wizard, step: 1, pct: 0, expires: '' }; setView('home'); });
    return;
  }

  // ---- Step 3: anchor the trip in cash ----
  if (w.step === 3) {
    box.innerHTML = `
      <section>
        <h2><span class="step-n">3</span> The trip</h2>
        <label class="field">Where to?
          <input id="w-route" class="input" placeholder="e.g. Denver → San Juan, mid-March" value="${esc(w.route)}">
        </label>
        <label class="field">What does that ticket cost in cash? ($)
          <input id="w-cash" class="input" type="text" inputmode="decimal" placeholder="check Google Flights — 2 minutes, keeps you honest" value="${w.cash || ''}">
        </label>
        <button id="w-next" class="btn">Next</button>
      </section>`;
    $('w-route').addEventListener('input', e => { w.route = e.target.value; persist(); });
    $('w-cash').addEventListener('input', e => { w.cash = num(e.target.value); persist(); });
    $('w-next').addEventListener('click', () => {
      if (!w.cash) return;
      w.step = 4; persist(); renderWizard();
    });
    return;
  }

  // ---- Step 4: one site, real numbers ----
  if (w.step === 4) {
    box.innerHTML = `
      <section>
        <h2><span class="step-n">4</span> Price it for real — one site only</h2>
        <p class="section-hint">Open <b>${esc(partner.site)}</b>, search
          <b>${esc(w.route) || 'your trip'}</b>, and find seats you could actually book.
          Type what they charge:</p>
        <div class="wiz-grid">
          <label class="field">Points needed
            <input id="w-points" class="input" type="text" inputmode="numeric" placeholder="e.g. 30,000" value="${w.points ? fmt(w.points) : ''}">
          </label>
          <label class="field">Taxes/fees ($)
            <input id="w-fees" class="input" type="text" inputmode="decimal" placeholder="shown at checkout" value="${w.fees || ''}">
          </label>
        </div>
        <label class="check seat-big">
          <input type="checkbox" id="w-seat" ${w.seat ? 'checked' : ''}>
          I found seats on my dates that I could book right now
        </label>
        <button id="w-next" class="btn">Show me the verdict</button>
      </section>`;
    $('w-points').addEventListener('input', e => { w.points = num(e.target.value); persist(); });
    $('w-fees').addEventListener('input', e => { w.fees = num(e.target.value); persist(); });
    $('w-seat').addEventListener('change', e => { w.seat = e.target.checked; persist(); });
    $('w-next').addEventListener('click', () => {
      if (!w.points) return;
      w.step = 5; persist(); renderWizard();
    });
    return;
  }

  // ---- Step 5: the verdict — WITHOUT the bonus first, then with ----
  if (w.step === 5) {
    const link = LINKS.find(l => l.issuer === w.issuer && l.partner === w.partner);
    const inc = issuer.increment;
    const ratio = link.to / link.from;
    const send      = Math.ceil(w.points / ratio / inc) * inc;
    const boosted   = ratio * (1 + w.pct / 100);
    const sendBonus = Math.ceil(w.points / boosted / inc) * inc;
    const net = w.cash - w.fees;
    const base  = (net * 100) / send;
    const withB = (net * 100) / sendBonus;
    const short = Math.max(0, sendBonus - (session.balances[w.issuer] || 0));

    let verdict;
    if (net <= 0) {
      verdict = `<p class="warn crit">The award fees ($${fmt(w.fees)}) are as much as the cash ticket ($${fmt(w.cash)}). There is no deal here at any bonus. <b>Skip it.</b></p>`;
    } else if (withB < VERDICT_RED) {
      verdict = `<p class="warn crit">Even with the +${w.pct}% bonus this comes to <b>${withB.toFixed(1)}¢ per point</b> — the bonus is lipstick on a bad price. <b>Skip it</b> and let your points stay flexible in ${esc(issuer.short)}.</p>`;
    } else if (base >= VERDICT_RED) {
      verdict = `<p class="go">Without the bonus: <b>${base.toFixed(1)}¢</b> per point (${vLabel(base)}).
        With it: <b>${withB.toFixed(1)}¢</b> (${vLabel(withB)}), sending <b>${fmt(sendBonus)}</b> instead of ${fmt(send)}.<br>
        The bonus improved a deal that <b>already existed</b> — that's exactly when to use one.</p>`;
    } else {
      verdict = `<p class="warn">This deal only works <b>because</b> of the bonus (${base.toFixed(1)}¢ → ${withB.toFixed(1)}¢). That's acceptable — the price is real — but it's a close call, so double-check everything before sending.</p>`;
    }

    // The same final gate as trip mode: no seat, no blessing.
    let gate = '';
    if (net > 0 && withB >= VERDICT_RED) {
      if (!w.seat) {
        gate = `<p class="warn crit">You haven't confirmed a flight exists yet — <b>transfers are final and can't be reversed</b>. Go back, find the actual seats on ${esc(partner.site)}, then tick the box.</p>`;
      } else if (short > 0) {
        gate = `<p class="warn crit">You're <b>${fmt(short)} ${esc(issuer.short)} points short</b>${session.balances[w.issuer] ? '' : ' (or your balance isn\'t saved — set it in trip mode)'}. Don't transfer a partial amount hoping to top up later.</p>`;
      } else {
        gate = `<p class="go">✅ <b>Transfer ${fmt(sendBonus)} ${esc(issuer.short)} points → ${esc(partner.name)}</b>, then book immediately — seats can vanish.${link.feeWarn ? ' ⚠ Check the transfer page for a fee first.' : ''}</p>`;
      }
    }

    box.innerHTML = `
      <section>
        <h2><span class="step-n">5</span> The verdict</h2>
        ${verdict}
        ${gate}
        <div class="wiz-choice">
          <button id="w-compare" class="btn btn-quiet">Compare other programs for this trip</button>
          <button id="w-back" class="btn btn-quiet">← Edit numbers</button>
          <button id="w-done" class="btn btn-quiet">Done</button>
        </div>
      </section>`;

    // Bridge into trip mode with everything carried over — no retyping
    $('w-compare').addEventListener('click', () => {
      session.held[w.issuer] = true;
      session.route = w.route;
      session.cash  = w.cash;
      session.entries[w.partner] = { points: w.points, fees: w.fees, seat: w.seat };
      $('route').value = session.route;
      $('cash').value  = session.cash || '';
      renderIssuers();
      setView('trip');
    });
    $('w-back').addEventListener('click', () => { w.step = 4; persist(); renderWizard(); });
    $('w-done').addEventListener('click', () => { session.wizard = { ...session.wizard, step: 1, pct: 0, expires: '' }; setView('home'); });
    return;
  }
}

// ============================================================================
// INIT
// ============================================================================

async function init() {
  const data = await chrome.storage.local.get(['session', 'bonuses']);
  if (data.session) session = { ...session, ...data.session, wizard: { ...session.wizard, ...(data.session.wizard || {}) } };
  if (Array.isArray(data.bonuses)) bonuses = data.bonuses;

  // Entry-point buttons + back navigation
  $('go-bonus').addEventListener('click', () => setView('wizard'));
  $('go-trip').addEventListener('click', () => setView('trip'));
  $('back-btn').addEventListener('click', () => setView('home'));
  setView(session.view || 'home');

  $('route').value = session.route;
  $('cash').value = session.cash || '';
  $('sort').value = session.sort;
  $('filter').value = session.filter;

  renderIssuers();
  renderRows();
  renderBonusForm();
  renderBonuses();

  $('route').addEventListener('input', e => { session.route = e.target.value; persist(); });
  $('cash').addEventListener('input', e => { session.cash = num(e.target.value); persist(); updateComputedCells(); });
  $('cash').addEventListener('change', renderRows);
  $('filter').addEventListener('input', e => { session.filter = e.target.value; persist(); renderRows(); });
  $('sort').addEventListener('change', e => { session.sort = e.target.value; persist(); renderRows(); });

  $('decide-btn').addEventListener('click', renderDecision);

  $('bonus-issuer').addEventListener('change', renderBonusPartnerSel);
  $('bonus-add').addEventListener('click', () => {
    const issuer = $('bonus-issuer').value;
    const partner = $('bonus-partner').value;
    const pct = num($('bonus-pct').value);
    if (!issuer || !partner || !pct) return;
    bonuses.unshift({ id: Date.now().toString(36), issuer, partner, pct, expires: $('bonus-exp').value || '' });
    $('bonus-pct').value = ''; $('bonus-exp').value = '';
    persist(); renderBonuses(); renderRows();
  });
  $('bonus-list').addEventListener('click', e => {
    const btn = e.target.closest('.bonus-del');
    if (!btn) return;
    bonuses = bonuses.filter(b => b.id !== btn.closest('.bonus-row').dataset.id);
    persist(); renderBonuses(); renderRows();
  });

  // New trip: clears the trip-specific research, KEEPS balances/programs/bonuses
  $('reset-btn').addEventListener('click', () => {
    session.route = ''; session.cash = 0; session.entries = {}; session.filter = '';
    $('route').value = ''; $('cash').value = ''; $('filter').value = '';
    $('decision').innerHTML = '';
    persist(); renderRows();
  });
}

init();
