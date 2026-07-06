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
  route: '',
  cash: 0,
  held: {},           // { amex: true, ... }
  balances: {},       // { amex: 85000, ... }
  entries: {},        // { partnerId: { points, fees, seat } } — the REAL prices
  sort: 'value',
  filter: '',
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
// INIT
// ============================================================================

async function init() {
  const data = await chrome.storage.local.get(['session', 'bonuses']);
  if (data.session) session = { ...session, ...data.session };
  if (Array.isArray(data.bonuses)) bonuses = data.bonuses;

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
