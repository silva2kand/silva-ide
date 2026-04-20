'use strict';
window.GateUI = (() => {
  let pendingItems = [];
  let caps = null;

  function esc(s) { return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function init() {
    renderPanel();
    refreshAll();
    window.silva?.gate?.onStatus?.(() => refreshHistory());
    window.silva?.gate?.onPending?.((items) => { pendingItems = items || []; renderPending(); });
  }

  async function refreshAll() {
    await Promise.allSettled([refreshCaps(), refreshPending(), refreshHistory()]);
  }

  async function refreshCaps() {
    if (!window.silva?.gate?.getCapabilities) return;
    const r = await window.silva.gate.getCapabilities();
    caps = r || null;
    renderCapabilities();
  }

  async function refreshPending() {
    if (!window.silva?.gate?.getPending) return;
    pendingItems = await window.silva.gate.getPending();
    renderPending();
  }

  async function refreshHistory() {
    const logEl = document.getElementById('gate-logs');
    if (!logEl || !window.silva?.gate?.getHistory) return;
    const history = await window.silva.gate.getHistory(80);
    logEl.innerHTML = (history || []).map(entry => {
      const icon = entry.allowed ? '✓' : '✗';
      const color = entry.allowed ? 'var(--green)' : 'var(--red)';
      const time = new Date(entry.timestamp).toLocaleTimeString();
      return `<div style="border-bottom:1px solid var(--surface0);padding:4px 0">
        <span style="color:${color}">${icon}</span>
        <span style="color:var(--text)">${esc(entry.action)}</span>
        <span style="color:var(--overlay0)">by ${esc(entry.agent)}</span>
        <span style="color:var(--overlay2)">(${esc(entry.reason)})</span>
        <span style="color:var(--subtext1)">${time}</span>
      </div>`;
    }).join('') || '<div style="color:var(--overlay0)">No history yet</div>';
  }

  function renderPanel() {
    const container = document.getElementById('panel-extensions');
    if (!container) return;
    if (container.querySelector('#gate-content')) return;

    container.innerHTML += `
      <div id="gate-content" style="padding:12px;display:flex;flex-direction:column;gap:12px;overflow-y:auto">
        <div style="display:flex;flex-direction:column;gap:8px">
          <div style="font-size:11px;color:var(--overlay0);font-weight:600;letter-spacing:1px">PENDING APPROVALS</div>
          <div id="gate-pending-list" style="display:flex;flex-direction:column;gap:6px"></div>
        </div>

        <div style="display:flex;flex-direction:column;gap:8px">
          <div style="font-size:11px;color:var(--overlay0);font-weight:600;letter-spacing:1px">CAPABILITIES</div>
          <div id="gate-cap-list" style="display:flex;flex-direction:column;gap:6px"></div>
        </div>

        <div style="display:flex;flex-direction:column;gap:8px">
          <div style="font-size:11px;color:var(--overlay0);font-weight:600;letter-spacing:1px">APPROVAL HISTORY</div>
          <div id="gate-logs" style="background:var(--surface0);border-radius:4px;padding:8px;font-size:10px;overflow-y:auto;max-height:220px;color:var(--overlay2)"></div>
        </div>
      </div>
    `;
  }

  function renderPending() {
    const list = document.getElementById('gate-pending-list');
    if (!list) return;
    if (!pendingItems?.length) { list.innerHTML = '<div style="font-size:10px;color:var(--overlay0)">No pending approvals</div>'; return; }
    list.innerHTML = pendingItems.map(item => `
      <div style="background:var(--surface0);border-radius:4px;padding:8px;display:flex;flex-direction:column;gap:4px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:11px;color:var(--text)">${esc(item.action)}</span>
          <span style="font-size:9px;padding:2px 4px;border-radius:3px;background:${item.danger === 'high' ? 'var(--red)' : 'var(--yellow)'};color:var(--text)">${esc(String(item.danger || '')).toUpperCase()}</span>
        </div>
        <div style="font-size:10px;color:var(--overlay0)">Agent: ${esc(item.agent)}</div>
        <div style="display:flex;gap:6px">
          <button class="btn-primary gate-approve" data-id="${esc(item.id)}" style="font-size:10px;padding:4px 8px;flex:1">Approve</button>
          <button class="btn-secondary gate-deny" data-id="${esc(item.id)}" style="font-size:10px;padding:4px 8px;flex:1">Deny</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.gate-approve').forEach(b => b.addEventListener('click', async () => {
      await window.silva?.gate?.approve?.(b.dataset.id);
      await refreshPending();
    }));
    list.querySelectorAll('.gate-deny').forEach(b => b.addEventListener('click', async () => {
      await window.silva?.gate?.deny?.(b.dataset.id);
      await refreshPending();
    }));
  }

  function renderCapabilities() {
    const list = document.getElementById('gate-cap-list');
    if (!list) return;
    if (!caps?.agents) { list.innerHTML = '<div style="font-size:10px;color:var(--overlay0)">No capability data</div>'; return; }
    list.innerHTML = Object.entries(caps.agents).map(([agent, cfg]) => {
      const actions = Array.isArray(cfg.actions) ? cfg.actions.join(', ') : '';
      return `<div style="background:var(--surface0);border-radius:4px;padding:8px;font-size:10px;color:var(--overlay2)">
        <div style="display:flex;justify-content:space-between">
          <span style="color:var(--text);font-weight:700">${esc(agent)}</span>
          <span>${esc(actions)}</span>
        </div>
      </div>`;
    }).join('');
  }

  return { init };
})();
