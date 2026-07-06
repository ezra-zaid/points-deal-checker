const $ = id => document.getElementById(id);

const state = { partners: [], balances: {}, settings: {}, history: [] };

const fmt = n => Math.round(n).toLocaleString();
const num = s => parseFloat(String(s).replace(/[^0-9.]/g, '')) || 0;

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2200);
}

async function load() {
  const data = await chrome.storage.local.get(['partners', 'balances', 'settings', 'history']);
  state.partners = data.partners || structuredClone(PDC_DEFAULT_PARTNERS);
  state.balances = data.balances || {};
  state.settings = { ...PDC_DEFAULT_SETTINGS, ...(data.settings || {}) };
  state.history  = data.history || [];
}

// ===== TABS =====
document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
  btn.classList.add('active');
  $(btn.dataset.panel).classList.remove('hidden');
}));

// ===== BALANCES & PARTNERS =====
function renderPartners() {
  $('mr-balance').value = state.balances.mr ? fmt(state.balances.mr) : '';
  $('partners-list').innerHTML = state.partners.map((p, i) => `
    <div class="partner-row" data-idx="${i}">
      <input class="input p-name" value="${esc(p.name)}" placeholder="Program name">
      <div class="ratio-pair">
        <input class="input p-from" type="text" inputmode="decimal" value="${p.from}">
        <span>→</span>
        <input class="input p-to" type="text" inputmode="decimal" value="${p.to}">
      </div>
      <input class="input p-bal" type="text" inputmode="numeric"
             value="${state.balances[p.id] ? fmt(state.balances[p.id]) : ''}" placeholder="0">
      <button class="partner-del" title="Remove" aria-label="Remove">✕</button>
    </div>`).join('');
}

function collectPartners() {
  const rows = [...document.querySelectorAll('.partner-row')];
  const newPartners = [];
  const newBalances = { mr: num($('mr-balance').value) };
  rows.forEach((row, i) => {
    const name = row.querySelector('.p-name').value.trim();
    if (!name) return;
    const prev = state.partners[i];
    const id = prev?.id || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24);
    newPartners.push({
      id, name,
      from: num(row.querySelector('.p-from').value) || 1,
      to:   num(row.querySelector('.p-to').value)   || 1,
    });
    const bal = num(row.querySelector('.p-bal').value);
    if (bal) newBalances[id] = bal;
  });
  state.partners = newPartners;
  state.balances = newBalances;
}

$('partners-list').addEventListener('click', e => {
  const btn = e.target.closest('.partner-del');
  if (!btn) return;
  collectPartners();
  state.partners.splice(+btn.closest('.partner-row').dataset.idx, 1);
  renderPartners();
});

$('add-partner-btn').addEventListener('click', () => {
  collectPartners();
  state.partners.push({ id: 'new-' + Date.now().toString(36), name: '', from: 1, to: 1 });
  renderPartners();
  const rows = document.querySelectorAll('.partner-row');
  rows[rows.length - 1]?.querySelector('.p-name')?.focus();
});

$('save-partners-btn').addEventListener('click', async () => {
  collectPartners();
  await chrome.storage.local.set({ partners: state.partners, balances: state.balances });
  renderPartners();
  toast('Saved');
});

// ===== HISTORY =====
function renderHistory() {
  $('history-list').innerHTML = state.history.map(h => `
    <div class="hist-row" data-id="${h.id}">
      <span class="hist-dot dot-${esc(h.tier)}"></span>
      <div class="hist-main">
        <p class="hist-label">${esc(h.label) || esc(h.partner)}</p>
        <p class="hist-sub">${esc(h.partner)} · ${fmt(h.miles)} miles + $${fmt(h.fees)} vs $${fmt(h.cash)} cash${h.bonus ? ` · +${h.bonus}% bonus` : ''}${h.mrNeeded ? ` · ${fmt(h.mrNeeded)} MR` : ' · no transfer'}</p>
      </div>
      <span class="hist-cents">${h.cents.toFixed(1)}¢</span>
      <span class="hist-date">${esc(h.date)}</span>
      <button class="hist-del" title="Delete" aria-label="Delete">✕</button>
    </div>`).join('')
    || '<p class="empty">Nothing saved yet — check a deal in the popup and hit Save.</p>';
}

$('history-list').addEventListener('click', async e => {
  const btn = e.target.closest('.hist-del');
  if (!btn) return;
  state.history = state.history.filter(h => h.id !== btn.closest('.hist-row').dataset.id);
  await chrome.storage.local.set({ history: state.history });
  renderHistory();
});

// ===== EXPORT / IMPORT =====
$('export-btn').addEventListener('click', () => {
  const json = JSON.stringify({
    partners: state.partners, balances: state.balances,
    settings: state.settings, history: state.history,
  }, null, 2);
  const a = Object.assign(document.createElement('a'), {
    href:     URL.createObjectURL(new Blob([json], { type: 'application/json' })),
    download: `points-deal-checker-${new Date().toISOString().split('T')[0]}.json`,
  });
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Exported');
});

$('import-btn').addEventListener('click', () => {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json' });
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const data = JSON.parse(e.target.result);
        if (Array.isArray(data.partners)) state.partners = data.partners;
        if (data.balances)                state.balances = data.balances;
        if (data.settings)                state.settings = { ...PDC_DEFAULT_SETTINGS, ...data.settings };
        if (Array.isArray(data.history))  state.history  = data.history;
        await chrome.storage.local.set({
          partners: state.partners, balances: state.balances,
          settings: state.settings, history: state.history,
        });
        renderPartners(); renderHistory(); renderSettings();
        toast('Imported');
      } catch { toast('Invalid file — import failed'); }
    };
    reader.readAsText(file);
  });
  input.click();
});

// ===== SETTINGS =====
function renderSettings() {
  $('set-red').value   = state.settings.redBelow;
  $('set-green').value = state.settings.greenAbove;
}

$('save-settings-btn').addEventListener('click', async () => {
  const red   = parseFloat($('set-red').value);
  const green = parseFloat($('set-green').value);
  if (!(red >= 0) || !(green > red)) { toast('Green threshold must be above red'); return; }
  state.settings = { redBelow: red, greenAbove: green };
  await chrome.storage.local.set({ settings: state.settings });
  toast('Settings saved');
});

// ===== INIT =====
(async () => {
  await load();
  renderPartners();
  renderHistory();
  renderSettings();
})();
