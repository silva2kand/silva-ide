'use strict';
window.SecurityUI = (() => {
  let whitelist = [];
  let blocked = [];
  let rateLimits = {};

  function init() {
    renderPanel();
    refreshData();
    setInterval(refreshData, 5000);
    console.log('[SecurityUI] Security boundary panel initialized');
  }

  function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  async function refreshData() {
    if (!window.silva?.security) return;
    const [wR, bR, rR] = await Promise.allSettled([
      window.silva.security.getWhitelist(),
      window.silva.security.getBlocked(),
      window.silva.security.getRateLimits(),
    ]);
    if (wR.status === 'fulfilled') whitelist = Array.isArray(wR.value) ? wR.value : [];
    if (bR.status === 'fulfilled') blocked = Array.isArray(bR.value) ? bR.value : [];
    if (rR.status === 'fulfilled') rateLimits = rR.value || {};
    renderWhitelist();
    renderBlocked();
    renderRateLimits();
  }

  function renderPanel() {
    const container = document.getElementById('panel-extensions');
    if (!container) return;
    const existing = container.querySelector('#security-content');
    if (existing) return;

    container.innerHTML += `
      <div id="security-content" style="padding:12px;display:flex;flex-direction:column;gap:12px;overflow-y:auto;height:100%">
        <div style="display:flex;gap:8px">
          <input id="security-identity" placeholder="Identity (WhatsApp/Telegram ID)" style="flex:1;background:var(--surface0);border:1px solid var(--surface1);border-radius:6px;padding:8px;color:var(--text);font-size:11px">
          <button class="btn-primary" id="btn-add-whitelist" style="font-size:11px;padding:0 12px">Add</button>
          <button class="btn-secondary" id="btn-add-block" style="font-size:11px;padding:0 12px;background:var(--red);border-color:var(--red)">Block</button>
        </div>

        <div style="display:flex;flex-direction:column;gap:6px">
          <div style="font-size:11px;color:var(--overlay0);font-weight:600;letter-spacing:1px">WHITELISTED IDENTITY</div>
          <div id="whitelist-list" style="display:flex;flex-direction:column;gap:4px"></div>
        </div>

        <div style="display:flex;flex-direction:column;gap:6px">
          <div style="font-size:11px;color:var(--overlay0);font-weight:600;letter-spacing:1px">BLOCKED IDENTITY</div>
          <div id="blocked-list" style="display:flex;flex-direction:column;gap:4px"></div>
        </div>

        <div style="display:flex;flex-direction:column;gap:6px">
          <div style="font-size:11px;color:var(--overlay0);font-weight:600;letter-spacing:1px">RATE LIMITS</div>
          <div id="rate-limits-list" style="display:flex;flex-direction:column;gap:4px"></div>
        </div>

        <div style="display:flex;gap:8px">
          <button class="btn-secondary" id="btn-security-clear-rates" style="flex:1;font-size:11px">Clear Rate Limits</button>
          <button class="btn-secondary" id="btn-security-scan" style="flex:1;font-size:11px">Scan for Secrets</button>
        </div>
      </div>
    `;

    document.getElementById('btn-add-whitelist')?.addEventListener('click', async () => {
      const id = document.getElementById('security-identity')?.value?.trim();
      if (!id || !window.silva?.security) return;
      await window.silva.security.addWhitelist(id);
      await refreshData();
    });

    document.getElementById('btn-add-block')?.addEventListener('click', async () => {
      const id = document.getElementById('security-identity')?.value?.trim();
      if (!id || !window.silva?.security) return;
      await window.silva.security.blockIdentity(id);
      await refreshData();
    });

    document.getElementById('btn-security-clear-rates')?.addEventListener('click', async () => {
      if (!window.silva?.security) return;
      await window.silva.security.resetRateLimits();
      await refreshData();
    });

    document.getElementById('btn-security-scan')?.addEventListener('click', async () => {
      if (!window.silva?.security || !window.silva?.dialog?.showInput) return;
      const r = await window.silva.dialog.showInput({ title: 'Secret Scan', message: 'Paste text to scan for secrets:', defaultValue: '' });
      if (r.cancelled) return;
      const findings = await window.silva.security.scanForSecrets(r.value || '');
      if (!findings?.length) { window.notify?.('No secrets detected.', 'success'); return; }
      const msg = findings.map(f => `${f.type}: ${f.count}`).join(' · ');
      window.notify?.(`Potential secrets: ${msg}`, 'warning');
    });
  }

  function renderWhitelist() {
    const el = document.getElementById('whitelist-list');
    if (!el) return;
    if (whitelist.length === 0) { el.innerHTML = '<div style="font-size:10px;color:var(--overlay0)">No whitelisted identities</div>'; return; }
    el.innerHTML = whitelist.map(id => `
      <div style="background:var(--surface0);border-radius:4px;padding:6px;display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:10px;color:var(--text)">${esc(id)}</span>
        <button class="btn-secondary sec-remove-w" data-id="${esc(id)}" style="font-size:9px;padding:2px 4px">Remove</button>
      </div>
    `).join('');
    el.querySelectorAll('.sec-remove-w').forEach(b => b.addEventListener('click', async () => {
      const id = b.dataset.id;
      if (!id || !window.silva?.security) return;
      await window.silva.security.removeWhitelist(id);
      await refreshData();
    }));
  }

  function renderBlocked() {
    const el = document.getElementById('blocked-list');
    if (!el) return;
    if (blocked.length === 0) { el.innerHTML = '<div style="font-size:10px;color:var(--overlay0)">No blocked identities</div>'; return; }
    el.innerHTML = blocked.map(id => `
      <div style="background:var(--red)22;border:1px solid var(--red)44;border-radius:4px;padding:6px;display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:10px;color:var(--red)">${esc(id)}</span>
        <button class="btn-secondary sec-remove-b" data-id="${esc(id)}" style="font-size:9px;padding:2px 4px">Unblock</button>
      </div>
    `).join('');
    el.querySelectorAll('.sec-remove-b').forEach(b => b.addEventListener('click', async () => {
      const id = b.dataset.id;
      if (!id || !window.silva?.security) return;
      await window.silva.security.removeBlock(id);
      await refreshData();
    }));
  }

  function renderRateLimits() {
    const el = document.getElementById('rate-limits-list');
    if (!el) return;
    const limits = Object.entries(rateLimits);
    if (limits.length === 0) { el.innerHTML = '<div style="font-size:10px;color:var(--overlay0)">No active rate limits</div>'; return; }
    el.innerHTML = limits.map(([key, data]) => `
      <div style="font-size:10px;color:var(--overlay0)">
        ${esc(key)}: ${esc(data.remaining)} remaining
      </div>
    `).join('');
  }

  return { init };
})();
