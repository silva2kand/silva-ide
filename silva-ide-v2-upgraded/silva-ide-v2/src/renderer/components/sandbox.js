'use strict';
window.SandboxUI = (() => {
  let currentSandbox = null;
  let suites = [];

  function init() {
    renderPanel();
    refreshSandbox();
    setInterval(refreshSandbox, 3000);
    console.log('[SandboxUI] Shadow sandbox panel initialized');
  }

  function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  async function refreshSandbox() {
    if (!window.silva?.sandbox) return;
    const [activeR, suitesR] = await Promise.allSettled([
      window.silva.sandbox.getActive(),
      window.silva.sandbox.getTestSuites(),
    ]);
    if (activeR.status === 'fulfilled') currentSandbox = activeR.value || null;
    if (suitesR.status === 'fulfilled') suites = Array.isArray(suitesR.value) ? suitesR.value : suites;
    renderActiveSandbox();
    renderGoldenTests();
    renderShadowChanges();
  }

  function renderPanel() {
    const container = document.getElementById('panel-extensions');
    if (!container) return;
    const existing = container.querySelector('#sandbox-content');
    if (existing) return;

    container.innerHTML += `
      <div id="sandbox-content" style="padding:12px;display:flex;flex-direction:column;gap:12px;overflow-y:auto;height:100%">
        <div style="display:flex;gap:8px">
          <button class="btn-primary" id="btn-sandbox-start" style="flex:1;font-size:11px">
            New Shadow Session
          </button>
          <button class="btn-secondary" id="btn-sandbox-apply" style="flex:1;font-size:11px">
            Apply
          </button>
          <button class="btn-secondary" id="btn-sandbox-clear" style="flex:1;font-size:11px">
            Clear
          </button>
        </div>

        <div id="sandbox-status" style="background:var(--surface0);border-radius:4px;padding:8px;text-align:center;font-size:11px;color:var(--overlay0)">
          No active sandbox session
        </div>

        <div style="display:flex;flex-direction:column;gap:6px">
          <div style="font-size:11px;color:var(--overlay0);font-weight:600;letter-spacing:1px">GOLDEN TESTS</div>
          <div id="golden-tests-list" style="display:flex;flex-direction:column;gap:4px"></div>
        </div>

        <div style="display:flex;flex-direction:column;gap:6px">
          <div style="font-size:11px;color:var(--overlay0);font-weight:600;letter-spacing:1px">SHADOW CHANGES</div>
          <div id="shadow-changes-list" style="background:var(--surface0);border-radius:4px;padding:8px;font-size:10px;color:var(--overlay2);max-height:150px;overflow-y:auto;font-family:var(--font-mono)"></div>
        </div>
      </div>
    `;

    document.getElementById('btn-sandbox-start')?.addEventListener('click', async () => {
      if (!window.silva?.sandbox || !window.silva?.dialog?.showInput) return;
      const r = await window.silva.dialog.showInput({ title: 'Sandbox', message: 'Agent name for sandbox session:', defaultValue: 'executor' });
      if (r.cancelled) return;
      const agent = String(r.value || '').trim() || 'executor';
      await window.silva.sandbox.create(Date.now().toString(36), agent);
      await refreshSandbox();
    });

    document.getElementById('btn-sandbox-apply')?.addEventListener('click', async () => {
      if (!window.silva?.sandbox) return;
      const res = await window.silva.sandbox.applyChanges();
      if (res?.success) window.notify?.(`Applied: ${(res.changes || []).length} change(s)`, 'success');
      else window.notify?.(res?.error || 'Apply failed', 'warning');
      await refreshSandbox();
    });

    document.getElementById('btn-sandbox-clear')?.addEventListener('click', async () => {
      if (!window.silva?.sandbox) return;
      await window.silva.sandbox.clear();
      await refreshSandbox();
    });

    renderGoldenTests();
  }

  function renderActiveSandbox() {
    const el = document.getElementById('sandbox-status');
    if (!el || !currentSandbox) {
      el.innerHTML = 'No active sandbox session';
      return;
    }
    const statusColor = currentSandbox.status === 'pass' || currentSandbox.status === 'golden_pass' ? 'var(--green)' : currentSandbox.status === 'fail' || currentSandbox.status === 'golden_fail' ? 'var(--red)' : 'var(--yellow)';
    el.innerHTML = `
      <div style="color:${statusColor};font-weight:700">${currentSandbox.status}</div>
      <div style="font-size:9px;color:var(--overlay0)">
        ${esc(currentSandbox.agent)} · ${esc(currentSandbox.ops?.length || 0)} ops · Score: ${esc(currentSandbox.score ?? 0)}
      </div>
    `;
  }

  function renderGoldenTests() {
    const el = document.getElementById('golden-tests-list');
    if (!el) return;
    if (suites.length === 0) { el.innerHTML = '<div style="font-size:10px;color:var(--overlay0)">No golden tests</div>'; return; }
    el.innerHTML = suites.map(s => `
      <button class="btn-secondary sandbox-run-golden" data-id="${esc(s.id)}" style="text-align:left;font-size:10px;padding:6px">
        <span style="color:var(--text)">${esc(s.name)}</span>
      </button>
    `).join('');
    el.querySelectorAll('.sandbox-run-golden').forEach(b => b.addEventListener('click', async () => {
      const testId = b.dataset.id;
      if (!testId || !window.silva?.sandbox) return;
      const result = await window.silva.sandbox.runGoldenTests(testId);
      if (result?.success && result?.results) {
        const msg = result.results.map(r => `${r.pass ? '✓' : '✗'} ${r.name}`).join('\n');
        window.notify?.(`Golden test "${result.suite}":\n${msg}`, result.results.every(r => r.pass) ? 'success' : 'warning');
      } else {
        window.notify?.(result?.error || 'Golden test failed', 'warning');
      }
      await refreshSandbox();
    }));
  }

  function renderShadowChanges() {
    const el = document.getElementById('shadow-changes-list');
    if (!el) return;
    if (!currentSandbox) { el.textContent = ''; return; }
    const changes = Array.isArray(currentSandbox.wouldChange) ? currentSandbox.wouldChange : [];
    const errors = Array.isArray(currentSandbox.errors) ? currentSandbox.errors : [];
    const lines = [];
    if (errors.length) {
      lines.push('Errors:');
      for (const e of errors.slice(0, 8)) lines.push(`- ${JSON.stringify(e)}`);
      lines.push('');
    }
    if (!changes.length) {
      lines.push('= no simulated changes =');
    } else {
      for (const c of changes.slice(0, 16)) {
        if (c.type === 'shell') lines.push(`shell: ${c.command}`);
        else if (c.type === 'system') lines.push(`system: ${c.changes}`);
        else lines.push(`${c.type || 'change'}: ${c.file || ''}\n${c.diff || ''}`);
        lines.push('');
      }
    }
    el.textContent = lines.join('\n').trim();
  };

  return { init };
})();
