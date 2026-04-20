'use strict';
window.KernelVersionUI = (() => {
  let versions = [];
  let history = [];

  function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function init() {
    renderPanel();
    window.silva?.kernelVersioning?.onNotify?.((evt) => {
      if (!evt?.type) return;
      if (evt.type === 'rollback') window.notify?.(`Rolled back to ${evt.payload?.version || ''}`, 'success');
      refreshAll();
    });
    refreshAll();
    console.log('[KernelVersionUI] Kernel versioning panel initialized');
  }

  function renderPanel() {
    const container = document.getElementById('panel-extensions');
    if (!container) return;
    const existing = container.querySelector('#kernel-version-content');
    if (existing) return;

    container.innerHTML += `
      <div id="kernel-version-content" style="padding:12px;display:flex;flex-direction:column;gap:12px;overflow-y:auto;height:100%">
        <div style="display:flex;gap:8px">
          <button class="btn-primary" id="btn-kv-snapshot" style="flex:1;font-size:11px">
            Create Snapshot
          </button>
          <button class="btn-secondary" id="btn-kv-bump" style="flex:1;font-size:11px">
            Bump Version
          </button>
        </div>

        <div style="display:flex;flex-direction:column;gap:6px">
          <div style="font-size:11px;color:var(--overlay0);font-weight:600;letter-spacing:1px">VERSION SNAPSHOTS</div>
          <div id="versions-list" style="display:flex;flex-direction:column;gap:4px"></div>
        </div>

        <div style="display:flex;flex-direction:column;gap:6px">
          <div style="font-size:11px;color:var(--overlay0);font-weight:600;letter-spacing:1px">KERNEL HISTORY</div>
          <div id="history-list" style="display:flex;flex-direction:column;gap:4px"></div>
        </div>
      </div>
    `;

    document.getElementById('btn-kv-snapshot')?.addEventListener('click', async () => {
      if (!window.silva?.kernelVersioning) return;
      let label = 'Manual snapshot';
      if (window.silva?.dialog?.showInput) {
        const r = await window.silva.dialog.showInput({ title: 'Kernel Snapshot', message: 'Snapshot label:', defaultValue: label });
        if (r.cancelled) return;
        label = String(r.value || '').trim() || label;
      }
      await window.silva.kernelVersioning.snapshot('user', label);
      await refreshAll();
    });

    document.getElementById('btn-kv-bump')?.addEventListener('click', async () => {
      if (!window.silva?.kernelVersioning) return;
      await window.silva.kernelVersioning.bumpVersion();
      await refreshAll();
    });
  }

  function renderVersions() {
    const list = document.getElementById('versions-list');
    if (!list) return;
    const data = versions || [];
    if (!data || data.length === 0) {
      list.innerHTML = '<div style="font-size:10px;color:var(--overlay0)">No snapshots yet</div>';
      return;
    }
    list.innerHTML = data.map(v => `
      <div style="background:var(--surface0);border-radius:4px;padding:6px;display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:10px;color:var(--text)">
          <strong>${esc(v.version)}</strong> · ${new Date(v.timestamp).toLocaleDateString()}
          <div style="font-size:9px;color:var(--overlay0)">${esc(v.label)}</div>
        </div>
        <div style="display:flex;gap:4px">
          <button class="btn-secondary kernel-view-diff" data-id="${esc(v.id)}" style="font-size:9px;padding:2px 6px">View</button>
          <button class="btn-secondary kernel-rollback" data-id="${esc(v.id)}" style="font-size:9px;padding:2px 6px;background:var(--red);color:white;border-color:var(--red)">Revert</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.kernel-view-diff').forEach(b => b.addEventListener('click', async () => {
      const id = b.dataset.id;
      if (!id || !window.silva?.kernelVersioning) return;
      const diff = await window.silva.kernelVersioning.getDiff(id);
      if (!diff) { window.notify?.('No diff available', 'info'); return; }
      if (window.silva?.dialog?.showMessage) {
        await window.silva.dialog.showMessage({ type: 'info', title: 'Kernel Snapshot', message: `Config diff (${id})`, detail: diff });
      } else {
        window.notify?.(diff, 'info');
      }
    }));

    list.querySelectorAll('.kernel-rollback').forEach(b => b.addEventListener('click', async () => {
      const id = b.dataset.id;
      if (!id || !window.silva?.kernelVersioning) return;
      let ok = true;
      if (window.silva?.dialog?.showMessage) {
        const r = await window.silva.dialog.showMessage({ type: 'warning', title: 'Rollback', message: 'Revert to this snapshot?', buttons: ['Revert', 'Cancel'], defaultId: 1, cancelId: 1 });
        ok = r?.response === 0;
      } else {
        ok = confirm('Revert to this version? This will restore the saved config state.');
      }
      if (!ok) return;
      const result = await window.silva.kernelVersioning.rollback(id);
      if (result?.success) window.notify?.(`Rolled back to ${result.version}`, 'success');
      else window.notify?.(result?.error || 'Rollback failed', 'warning');
      await refreshAll();
    }));
  }

  function renderHistory() {
    const list = document.getElementById('history-list');
    if (!list) return;
    const data = history || [];
    list.innerHTML = data.map(h => {
      const time = new Date(h.timestamp).toLocaleTimeString();
      return `<div style="font-size:9px;color:var(--overlay0)">
        <span style="color:var(--text)">[${time}] ${esc(h.action)}</span> — ${esc(h.author)} — ${esc(h.label)}
      </div>`;
    }).join('') || '<div style="font-size:9px;color:var(--overlay0)">No history yet</div>';
  }

  async function refreshAll() {
    if (!window.silva?.kernelVersioning) return;
    const [vR, hR] = await Promise.allSettled([
      window.silva.kernelVersioning.listVersions(),
      window.silva.kernelVersioning.listHistory(80),
    ]);
    if (vR.status === 'fulfilled') versions = Array.isArray(vR.value) ? vR.value : [];
    if (hR.status === 'fulfilled') history = Array.isArray(hR.value) ? hR.value : [];
    renderVersions();
    renderHistory();
  }

  setInterval(() => refreshAll(), 12000);

  return { init };
})();
