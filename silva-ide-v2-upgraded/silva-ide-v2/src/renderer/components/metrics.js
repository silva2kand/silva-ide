'use strict';
window.MetricsUI = (() => {
  let currentAgents = {};
  let currentProviders = {};
  let kernelState = null;
  let alerts = [];

  function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function init() {
    renderPanel();
    window.silva?.metrics?.onNotify?.((data) => {
      if (data?.kernel) kernelState = data.kernel;
      if (data?.agents) currentAgents = data.agents;
      if (data?.providers) currentProviders = data.providers;
      alerts = Array.isArray(data?.kernel?.alerts) ? data.kernel.alerts : alerts;
      renderAll();
    });
    refreshAll();
    console.log('[MetricsUI] Kernel metrics panel initialized');
  }

  function renderPanel() {
    const container = document.getElementById('panel-extensions');
    if (!container) return;
    const existing = container.querySelector('#metrics-content');
    if (existing) return;

    container.innerHTML += `
      <div id="metrics-content" style="padding:12px;display:flex;flex-direction:column;gap:12px;overflow-y:auto;height:100%">
        <div id="kernel-state-display" style="display:flex;gap:8px"></div>

        <div style="display:flex;flex-direction:column;gap:6px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div style="font-size:11px;color:var(--overlay0);font-weight:600;letter-spacing:1px">AGENT METRICS</div>
            <button class="btn-secondary" id="btn-metrics-reset" style="font-size:9px;padding:3px 6px">Reset All</button>
          </div>
          <div id="agents-table" style="display:flex;flex-direction:column;gap:4px"></div>
        </div>

        <div style="display:flex;flex-direction:column;gap:6px">
          <div style="font-size:11px;color:var(--overlay0);font-weight:600;letter-spacing:1px">PROVIDER METRICS</div>
          <div id="providers-table" style="display:flex;flex-direction:column;gap:4px"></div>
        </div>

        <div style="display:flex;flex-direction:column;gap:6px">
          <div style="font-size:11px;color:var(--overlay0);font-weight:600;letter-spacing:1px">KERNEL ALERTS</div>
          <div id="alerts-list" style="display:flex;flex-direction:column;gap:4px"></div>
        </div>
      </div>
    `;

    document.getElementById('btn-metrics-reset')?.addEventListener('click', () => {
      window.silva?.metrics?.resetAll?.().then(() => refreshAll());
    });
  }

  function renderState() {
    const el = document.getElementById('kernel-state-display');
    if (!el) return;
    const status = kernelState?.status || 'unknown';
    const statusColor = status === 'healthy' ? 'var(--green)' : status === 'degraded' ? 'var(--yellow)' : status === 'idle' ? 'var(--overlay0)' : 'var(--red)';
    const uptimeMs = typeof kernelState?.uptimeMs === 'number' ? kernelState.uptimeMs : 0;
    const actionsTotal = typeof kernelState?.actionsTotal === 'number' ? kernelState.actionsTotal : 0;
    const alertsCount = Array.isArray(alerts) ? alerts.length : 0;
    el.innerHTML = `
      <div style="background:var(--surface0);border-radius:4px;padding:8px;flex:1;text-align:center">
        <div style="font-size:10px;color:var(--overlay0)">STATUS</div>
        <div style="color:${statusColor};font-size:14px;font-weight:700">${esc(status)}</div>
      </div>
      <div style="background:var(--surface0);border-radius:4px;padding:8px;flex:1;text-align:center">
        <div style="font-size:10px;color:var(--overlay0)">UPTIME</div>
        <div style="color:var(--text);font-size:12px">${formatUptime(uptimeMs)}</div>
      </div>
      <div style="background:var(--surface0);border-radius:4px;padding:8px;flex:1;text-align:center">
        <div style="font-size:10px;color:var(--overlay0">TOTAL ACTIONS</div>
        <div style="color:var(--text);font-size:12px">${esc(actionsTotal)}</div>
        <div style="font-size:9px;color:var(--overlay0)">${esc(alertsCount)} alerts</div>
      </div>
    `;
  }

  function renderAgentTable() {
    const el = document.getElementById('agents-table');
    if (!el) return;
    const agents = Object.entries(currentAgents || {});
    if (agents.length === 0) { el.innerHTML = '<div style="font-size:10px;color:var(--overlay0)">No agents yet</div>'; return; }
    el.innerHTML = agents.map(([name, m]) => {
      const color = m.status === 'healthy' ? 'var(--green)' : m.status === 'degraded' ? 'var(--yellow)' : 'var(--red)';
      return `<div style="background:var(--surface0);border-radius:4px;padding:6px;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:11px;color:var(--text);font-weight:600">${esc(name)}</div>
          <div style="font-size:9px;color:var(--overlay0)">
            ${esc(m.successRate)}% · ${esc(m.avgLatency)}ms · ${esc(m.actionsTotal)} actions
          </div>
        </div>
        <span style="font-size:9px;padding:2px 4px;border-radius:3px;background:${color}33;color:${color};font-weight:600">${esc(m.status)}</span>
      </div>`;
    }).join('');
  }

  function renderProviderTable() {
    const el = document.getElementById('providers-table');
    if (!el) return;
    const providers = Object.entries(currentProviders || {});
    if (providers.length === 0) { el.innerHTML = '<div style="font-size:10px;color:var(--overlay0)">No providers yet</div>'; return; }
    el.innerHTML = providers.map(([name, m]) => {
      const color = m.stability >= 90 ? 'var(--green)' : m.stability >= 60 ? 'var(--yellow)' : 'var(--red)';
      return `<div style="background:var(--surface0);border-radius:4px;padding:6px;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:11px;color:var(--text);font-weight:600">${esc(name)}</div>
          <div style="font-size:9px;color:var(--overlay0)">
            ${esc(m.successes)}/${esc(m.requestsTotal)} · ${esc(m.taskFit)}% task fit
          </div>
        </div>
        <span style="font-size:9px;padding:2px 4px;border-radius:3px;background:${color}33;color:${color};font-weight:600">${esc(m.stability)}%</span>
      </div>`;
    }).join('');
  }

  function renderAlerts() {
    const el = document.getElementById('alerts-list');
    if (!el) return;
    if (!alerts?.length) { el.innerHTML = '<div style="font-size:10px;color:var(--overlay0)">No alerts</div>'; return; }
    el.innerHTML = alerts.map(a => `
      <div style="background:var(--red)22;border:1px solid var(--red)44;border-radius:4px;padding:6px;display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:10px;color:var(--red)">
          <strong>${esc(a.type)}</strong> — ${esc(a.message)}
        </div>
        <button class="btn-secondary metrics-ack" data-id="${esc(a.id)}" style="font-size:9px;padding:2px 4px">Ack</button>
      </div>
    `).join('');
    el.querySelectorAll('.metrics-ack').forEach(b => b.addEventListener('click', async () => {
      const id = b.dataset.id;
      if (!id) return;
      await window.silva?.metrics?.acknowledgeAlert?.(id);
      await refreshAll();
    }));
  }

  function formatUptime(ms) {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
  }

  async function refreshAll() {
    if (!window.silva?.metrics) return;
    const [agentsR, providersR, kernelR, alertsR] = await Promise.allSettled([
      window.silva.metrics.getAgentMetrics(),
      window.silva.metrics.getProviderMetrics(),
      window.silva.metrics.getKernelState(),
      window.silva.metrics.getAlerts(),
    ]);
    if (agentsR.status === 'fulfilled') currentAgents = agentsR.value || {};
    if (providersR.status === 'fulfilled') currentProviders = providersR.value || {};
    if (kernelR.status === 'fulfilled') kernelState = kernelR.value || kernelState;
    if (alertsR.status === 'fulfilled') alerts = alertsR.value || [];
    renderAll();
  }

  function renderAll() {
    renderState();
    renderAgentTable();
    renderProviderTable();
    renderAlerts();
  }

  setInterval(() => refreshAll(), 8000);

  return { init };
})();
