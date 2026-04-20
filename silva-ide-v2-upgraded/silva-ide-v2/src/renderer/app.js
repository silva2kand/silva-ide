'use strict';
// ─── Silva IDE — Main Application Bootstrap ─────────────────────────
(async function() {
  // ─── Activity Bar navigation ─────────────────────────────
  document.querySelectorAll('.ab-btn[data-panel]').forEach(btn => {
    btn.addEventListener('click', () => {
      const panelId = btn.dataset.panel;
      document.querySelectorAll('.ab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.sidebar-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const panel = document.getElementById(`panel-${panelId}`);
      if (panel) panel.classList.add('active');
      if (panelId === 'git' && window.FileTreeManager?.getRootPath()) {
        window.GitManager?.refresh(window.FileTreeManager.getRootPath());
      }
    });
  });

  // ─── Welcome screen buttons ─────────────────────────────
  document.getElementById('wb-open-folder').addEventListener('click', () => window.silva?.fs.openFolder());
  document.getElementById('wb-open-file').addEventListener('click', () => window.silva?.fs.openFile());
  document.getElementById('wb-new-file').addEventListener('click', () => window.EditorManager?.newFile());
  document.getElementById('wb-create-project').addEventListener('click', async () => {
    const root = window.FileTreeManager?.getRootPath();
    if (!root) { window.notify?.('Open a folder first!', 'warning'); return; }
    const res = await window.silva.dialog.showInput({ title: 'Create Project', message: 'Enter project type (nodejs or python):', defaultValue: 'nodejs' });
    if (!res.cancelled && res.value) {
      const type = res.value.toLowerCase();
      const createRes = await window.silva.fs.createProject(root, type);
      if (createRes.success) {
        window.notify?.(`${type} project created!`, 'success');
        window.FileTreeManager?.refreshTree();
      } else {
        window.notify?.('Failed to create project: ' + createRes.error, 'error');
      }
    }
  });

  // ─── Split editor button ────────────────────────────────
  document.getElementById('btn-split-editor').addEventListener('click', () => window.EditorManager?.toggleSplit());

  // ─── Sidebar collapse toggle ────────────────────────────
  document.getElementById('btn-toggle-sidebar')?.addEventListener('click', () => {
    document.getElementById('app')?.classList.toggle('sidebar-hidden');
  });
  document.addEventListener('keydown', (e) => {
    if (!e.ctrlKey || e.shiftKey || e.altKey) return;
    const k = (e.key || '').toLowerCase();
    if (k !== 'b') return;
    const t = document.activeElement?.tagName?.toLowerCase();
    if (t === 'input' || t === 'textarea') return;
    e.preventDefault();
    document.getElementById('btn-toggle-sidebar')?.click();
  });

  // ─── Workspace Resizing Logic ─────────────────────────────────
  async function initResizers() {
    const app = document.getElementById('app');
    const sidebar = document.getElementById('sidebar');
    const aiPanel = document.getElementById('ai-panel');
    const bottomPanel = document.getElementById('bottom-panel');
    const store = window.silva?.store;

    const setVar = (k, v) => document.documentElement.style.setProperty(k, v);

    if (store) {
      const [sidebarW, aiW, bottomH, sidebarHidden] = await Promise.all([
        store.get('ui.sidebarW', null),
        store.get('ui.aiW', null),
        store.get('ui.bottomH', null),
        store.get('ui.sidebarHidden', null),
      ]);
      if (sidebarW) setVar('--sidebar-w', sidebarW);
      if (aiW) setVar('--ai-w', aiW);
      if (bottomH) setVar('--bottom-h', bottomH);
      if (sidebarHidden === true) app.classList.add('sidebar-hidden');
    }

    const handleH = (resizer, target, side) => {
      let isResizing = false;
      resizer.addEventListener('mousedown', (e) => { isResizing = true; document.body.style.cursor = 'col-resize'; });
      document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const width = side === 'left' ? e.clientX - 48 : window.innerWidth - e.clientX;
        if (width > 100 && width < 900) {
          if (side === 'left') {
            setVar('--sidebar-w', width + 'px');
          } else {
            setVar('--ai-w', width + 'px');
          }
        }
      });
      document.addEventListener('mouseup', async () => {
        if (!isResizing) return;
        isResizing = false;
        document.body.style.cursor = '';
        if (!store) return;
        if (side === 'left') await store.set('ui.sidebarW', getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w').trim());
        else await store.set('ui.aiW', getComputedStyle(document.documentElement).getPropertyValue('--ai-w').trim());
      });
    };

    const handleV = (resizer, target) => {
      let isResizing = false;
      resizer.addEventListener('mousedown', (e) => { isResizing = true; document.body.style.cursor = 'row-resize'; });
      document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const height = window.innerHeight - e.clientY - 24;
        if (height > 50 && height < 500) {
          setVar('--bottom-h', height + 'px');
        }
      });
      document.addEventListener('mouseup', async () => {
        if (!isResizing) return;
        isResizing = false;
        document.body.style.cursor = '';
        if (store) await store.set('ui.bottomH', getComputedStyle(document.documentElement).getPropertyValue('--bottom-h').trim());
      });
    };

    handleH(document.getElementById('resizer-sidebar'), sidebar, 'left');
    handleH(document.getElementById('resizer-ai'), aiPanel, 'right');
    handleV(document.getElementById('resizer-terminal'), bottomPanel);

    if (store) {
      const observer = new MutationObserver(() => {
        store.set('ui.sidebarHidden', app.classList.contains('sidebar-hidden'));
      });
      observer.observe(app, { attributes: true, attributeFilter: ['class'] });
    }
  }

  // ─── Live Preview Logic ─────────────────────────────────────────
  function initPreview() {
    const btn = document.getElementById('btn-live-preview');
    const panel = document.getElementById('preview-panel');
    const frame = document.getElementById('preview-frame');
    const close = document.getElementById('btn-close-preview');

    btn.addEventListener('click', () => {
      panel.classList.toggle('hidden');
      updatePreview();
    });
    close.addEventListener('click', () => panel.classList.add('hidden'));

    window.EditorManager?.on('file-saved', updatePreview);
    
    function updatePreview() {
      if (panel.classList.contains('hidden')) return;
      const tab = window.EditorManager?.getActiveTab();
      if (!tab) return;
      const content = tab.model.getValue();
      if (tab.language === 'html') {
        frame.srcdoc = content;
      } else if (tab.language === 'markdown') {
        // Simple MD preview if library was available, else just text
        frame.srcdoc = `<body style="font-family:sans-serif;padding:20px">${content.replace(/\n/g, '<br>')}</body>`;
      }
    }
  }

  // ─── Initialize all components ──────────────────────────
  window.FileTreeManager?.init();
  window.TerminalManager?.init();
  window.AIManager?.init();
  window.AutomationManager?.init();
  window.GitManager?.init();
  window.SearchManager?.init();
  window.KeybindingsManager?.init();
  await window.SettingsManager?.init();

  // ─── Initialize Kernel Modules ───
  window.GateUI?.init();
  window.MetricsUI?.init();
  window.KernelVersionUI?.init();
  window.SecurityUI?.init();
  window.SandboxUI?.init();

  await initResizers();
  initPreview();

  console.log('Silva IDE initialized ✓');
})();
