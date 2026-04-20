'use strict';
window.AutomationManager = (() => {
  let isRunning = true;
  const routines = [
    { id: 1, name: 'WhatsApp Monitor', interval: 'Real-time', status: 'active', lastRun: 'Just now' },
    { id: 2, name: 'System Health Check', interval: 'Every 5m', status: 'active', lastRun: '2m ago' },
    { id: 3, name: 'Cloud Backup', interval: 'Daily @ 3am', status: 'idle', lastRun: '8h ago' },
    { id: 4, name: 'Device Sync', interval: 'Every 10m', status: 'active', lastRun: '5m ago' }
  ];

  const logs = [];

  function init() {
    renderPanel();
    startBackgroundLoop();
    console.log('OpenJarvis Automation Agent initialized (Always-on)');
  }

  function renderPanel() {
    const container = document.getElementById('panel-extensions'); // Re-using extensions panel for Automation
    if (!container) return;
    
    container.innerHTML = `
      <div class="panel-header">
        <span>JARVICE AUTOMATION (24/7)</span>
        <div class="status-badge" style="background:var(--green)22;color:var(--green);padding:2px 6px;border-radius:10px;font-size:9px">ACTIVE</div>
      </div>
      <div style="padding:12px;display:flex;flex-direction:column;gap:15px;overflow-y:auto;height:100%">
        
        <div class="automation-section">
          <div style="font-size:11px;color:var(--overlay0);margin-bottom:8px;font-weight:600">BACKGROUND ROUTINES</div>
          <div id="routine-list" style="display:flex;flex-direction:column;gap:6px"></div>
        </div>

        <div class="automation-section">
          <div style="font-size:11px;color:var(--overlay0);margin-bottom:8px;font-weight:600">WHATSAPP CONNECTOR</div>
          <div style="background:var(--surface0)33;border:1px solid var(--surface0);border-radius:6px;padding:10px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
              <span style="font-size:12px">WhatsApp Web API</span>
              <span style="color:var(--green);font-size:10px">● Connected</span>
            </div>
            <button class="btn-secondary" style="width:100%;font-size:11px" onclick="window.AutomationManager.simulateWhatsApp()">Simulate Incoming Message</button>
          </div>
        </div>

        <div class="automation-section" style="flex:1">
          <div style="font-size:11px;color:var(--overlay0);margin-bottom:8px;font-weight:600">JARVICE EVENT LOG</div>
          <div id="automation-logs" style="background:var(--crust);border-radius:4px;padding:8px;font-family:var(--font-mono);font-size:10px;height:200px;overflow-y:auto;color:var(--overlay2)">
            <div>[System] Jarvice Agent started.</div>
            <div>[System] Connecting to local AI brains...</div>
          </div>
        </div>

      </div>
    `;
    updateRoutines();
  }

  function updateRoutines() {
    const list = document.getElementById('routine-list');
    if (!list) return;
    list.innerHTML = routines.map(r => `
      <div style="display:flex;align-items:center;justify-content:space-between;background:var(--surface0)22;padding:8px;border-radius:4px;border:1px solid var(--surface0)">
        <div style="display:flex;flex-direction:column">
          <span style="font-size:12px;color:var(--text)">${r.name}</span>
          <span style="font-size:10px;color:var(--overlay0)">${r.interval} • Last: ${r.lastRun}</span>
        </div>
        <div style="width:8px;height:8px;border-radius:50%;background:${r.status === 'active' ? 'var(--green)' : 'var(--overlay0)'}"></div>
      </div>
    `).join('');
  }

  function log(msg) {
    const el = document.getElementById('automation-logs');
    if (!el) return;
    const div = document.createElement('div');
    div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
  }

  function simulateWhatsApp() {
    log('Incoming WhatsApp from +44 7700 900000');
    log('Jarvice: Routing message to LM Studio (Qwen)...');
    
    setTimeout(() => {
      log('Qwen: Generating automated reply...');
      setTimeout(() => {
        log('Jarvice: Reply sent via WhatsApp Connector.');
        window.notify?.('WhatsApp Auto-reply sent!', 'success');
      }, 1500);
    }, 1000);
  }

  function startBackgroundLoop() {
    setInterval(() => {
      if (isRunning) {
        // Background housekeeping
      }
    }, 10000);
  }

  return { init, simulateWhatsApp, log };
})();
