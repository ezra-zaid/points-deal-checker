const $ = id => document.getElementById(id);

let partners = [];
let balances = {};   // { mr: 85000, virgin: 20000, ... }
let settings = {};
let lastEval = null; // most recent evaluation, for saving to history

const fmt = n => Math.round(n).toLocaleString();
const num = s => parseFloat(String(s).replace(/[^0-9.]/g, '')) || 0;

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function currentPartner() {
  return partners.find(p => p.id === $('partner').value);
}

function bonusPct() {
  const v = $('bonus').value;
  return v === 'custom' ? num($('bonus-custom').value) : parseFloat(v);
}

// ===== THE MATH =====
// One deal, evaluated. Everything the verdict says comes from here.
function evaluate() {
  const partner = currentPartner();
  const miles = num($('miles').value);   // award price in airline miles
  const fees  = num($('fees').value);    // award taxes/fees ($)
  const cash  = num($('cash').value);    // cash price of same ticket ($)
  if (!partner || !miles || !cash) return null;

  const bonus      = bonusPct();
  const ratio      = partner.to / partner.from;          // airline miles per 1 MR, no bonus
  const effRate    = ratio * (1 + bonus / 100);          // with bonus
  const partnerBal = num($('partner-bal').value);
  const mrBal      = num($('mr-bal').value);

  const milesShort = Math.max(0, miles - partnerBal);
  // Amex transfers in fixed increments — round the MR needed up
  const mrNeeded = milesShort > 0
    ? Math.ceil(milesShort / effRate / PDC_TRANSFER_INCREMENT) * PDC_TRANSFER_INCREMENT
    : 0;
  const milesReceived = mrNeeded * effRate;

  const savings = cash - fees;                            // $ kept vs paying cash
  // Value per point actually spent: per MR transferred, or per airline mile if
  // no transfer is needed
  const cents = mrNeeded > 0 ? (savings * 100) / mrNeeded : (savings * 100) / miles;

  let tier, label;
  if (savings <= 0)                    { tier = 'red';    label = 'SKIP — FEES EAT IT ALL'; }
  else if (cents < settings.redBelow)  { tier = 'red';    label = 'JUST PAY CASH'; }
  else if (cents < settings.greenAbove){ tier = 'yellow'; label = 'BORDERLINE'; }
  else                                 { tier = 'green';  label = 'GREAT DEAL'; }

  return { partner, miles, fees, cash, bonus, mrNeeded, milesReceived, milesShort, mrBal, savings, cents, tier, label };
}

function render() {
  const r = lastEval = evaluate();
  const result = $('result');
  $('save-row').classList.toggle('hidden', !r);

  if (!r) {
    result.innerHTML = `<div class="placeholder">Enter the award miles and the cash price of the same ticket — the verdict shows up here.</div>`;
    return;
  }

  const unit = r.mrNeeded > 0 ? 'per Amex point' : `per ${esc(r.partner.name.split(' ')[0])} mile`;

  // Plain-English steps
  const steps = [];
  if (r.mrNeeded > 0) {
    steps.push(`Transfer <b>${fmt(r.mrNeeded)}</b> Amex pts → <b>${fmt(r.milesReceived)}</b> miles${r.bonus ? ` <b>(+${r.bonus}% bonus)</b>` : ''}${r.milesShort < r.miles ? ` (you already have ${fmt(r.miles - r.milesShort)})` : ''}`);
  } else {
    steps.push(`<b>No transfer needed</b> — your ${fmt(num($('partner-bal').value))} miles already cover it`);
  }
  steps.push(`Book the award, pay <b>$${fmt(r.fees)}</b> in taxes/fees`);
  steps.push(r.savings > 0
    ? `vs the $${fmt(r.cash)} cash price you keep <b>$${fmt(r.savings)}</b>`
    : `the fees are <b>more than the cash price</b> — there is no deal here`);

  // Sanity warnings
  const warns = [];
  if (r.mrNeeded > 0 && r.mrNeeded > r.mrBal) {
    warns.push(`<li class="crit">You're <b>${fmt(r.mrNeeded - r.mrBal)} Amex points short</b> — this deal isn't bookable with what you have.</li>`);
  }
  if (r.savings > 0 && r.fees >= r.cash * 0.4) {
    warns.push(`<li>Fees are ${Math.round((r.fees / r.cash) * 100)}% of the cash price — the "deal" is smaller than it looks.</li>`);
  }
  if (r.mrNeeded > 0 && r.tier !== 'red') {
    warns.push(`<li>Transfers are <b>one-way and can't be undone</b>. Confirm the award seat is actually bookable before you transfer.</li>`);
  }

  result.innerHTML = `
    <div class="verdict verdict-${r.tier}">
      <div class="verdict-label">${r.tier === 'green' ? '🟢' : r.tier === 'yellow' ? '🟡' : '🔴'} ${r.label}</div>
      <div class="verdict-big">${r.savings > 0 ? r.cents.toFixed(1) + '¢' : '—'} <span>${r.savings > 0 ? unit : ''}</span></div>
    </div>
    <ul class="steps">${steps.map(s => `<li>${s}</li>`).join('')}</ul>
    ${warns.length ? `<ul class="warnings">${warns.join('')}</ul>` : ''}
    <p class="rule">Rule of thumb: under ${settings.redBelow}¢/pt just pay cash · over ${settings.greenAbove}¢/pt the points win.</p>
  `;
}

// ===== PERSISTENCE =====
let saveTimer;
function persistBalances() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const p = currentPartner();
    if (p) balances[p.id] = num($('partner-bal').value);
    balances.mr = num($('mr-bal').value);
    chrome.storage.local.set({ balances });
  }, 400);
}

function syncPartnerUI() {
  const p = currentPartner();
  if (!p) return;
  $('partner-bal-label').firstChild.textContent = `${p.name.split(' ')[0]} miles you have`;
  $('partner-bal').value = balances[p.id] ? fmt(balances[p.id]) : '';
  chrome.storage.local.set({ lastPartner: p.id });
}

// ===== INIT =====
async function init() {
  const data = await chrome.storage.local.get(['partners', 'balances', 'settings', 'lastPartner']);
  partners = data.partners || PDC_DEFAULT_PARTNERS;
  balances = data.balances || {};
  settings = { ...PDC_DEFAULT_SETTINGS, ...(data.settings || {}) };

  const sel = $('partner');
  sel.innerHTML = partners.map(p => {
    const ratio = p.from === 1 && p.to === 1 ? '' : ` (${p.from}:${p.to})`;
    return `<option value="${esc(p.id)}" ${p.id === data.lastPartner ? 'selected' : ''}>${esc(p.name)}${ratio}</option>`;
  }).join('');

  $('mr-bal').value = balances.mr ? fmt(balances.mr) : '';
  syncPartnerUI();
  render();

  sel.addEventListener('change', () => { syncPartnerUI(); render(); });
  $('bonus').addEventListener('change', () => {
    $('bonus-custom').classList.toggle('hidden', $('bonus').value !== 'custom');
    render();
  });
  ['bonus-custom', 'miles', 'fees', 'cash', 'partner-bal', 'mr-bal'].forEach(id =>
    $(id).addEventListener('input', () => {
      if (id === 'partner-bal' || id === 'mr-bal') persistBalances();
      render();
    })
  );

  $('save-btn').addEventListener('click', async () => {
    if (!lastEval) return;
    const r = lastEval;
    const history = (await chrome.storage.local.get('history')).history || [];
    history.unshift({
      id:      Date.now().toString(36),
      date:    new Date().toISOString().split('T')[0],
      label:   $('deal-label').value.trim(),
      partner: r.partner.name,
      miles:   r.miles,
      fees:    r.fees,
      cash:    r.cash,
      bonus:   r.bonus,
      mrNeeded: r.mrNeeded,
      cents:   +r.cents.toFixed(2),
      tier:    r.tier,
      label2:  r.label,
    });
    await chrome.storage.local.set({ history: history.slice(0, 200) });
    $('save-btn').textContent = '✓ Saved';
    setTimeout(() => { $('save-btn').textContent = 'Save'; }, 1500);
  });

  $('dashboard-link').addEventListener('click', e => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
}

init();
