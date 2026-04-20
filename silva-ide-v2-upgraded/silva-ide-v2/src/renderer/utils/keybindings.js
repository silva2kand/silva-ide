'use strict';
window.KeybindingsManager = (() => {
  function init() {
    document.addEventListener('keydown', e => {
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const key = e.key.toLowerCase();

      if (ctrl && key === 's' && !shift) { e.preventDefault(); window.EditorManager?.saveActiveFile(); return; }
      if (ctrl && key === 's' && shift) { e.preventDefault(); window.EditorManager?.saveAs(); return; }
      if (ctrl && key === 'n' && !shift) { e.preventDefault(); window.EditorManager?.newFile(); return; }
      if (ctrl && key === 'o' && shift) { e.preventDefault(); window.silva?.fs.openFolder(); return; }
      if (ctrl && key === 'o' && !shift) { e.preventDefault(); window.silva?.fs.openFile(); return; }
      if (ctrl && key === 'b') { e.preventDefault(); window.FileTreeManager?.toggleSidebar(); return; }
      if (ctrl && key === '`') { e.preventDefault(); window.TerminalManager?.toggle(); return; }
      if (ctrl && shift && key === 'a') { e.preventDefault(); window.AIManager?.toggle(); return; }
      if (ctrl && key === 'f' && !shift) { e.preventDefault(); window.EditorManager?.findInEditor(); return; }
      if (ctrl && key === 'w') { e.preventDefault(); const tab = window.EditorManager?.getActiveTab(); if (tab) window.EditorManager?.closeTab(tab.id); return; }
      if (ctrl && shift && key === 'p') { e.preventDefault(); showCommandPalette(); return; }
      if (key === 'f5') { e.preventDefault(); window.FileTreeManager?.runActiveFile?.(); return; }
      if (key === 'escape') { document.getElementById('context-menu').classList.add('hidden'); }
    });
  }

  function showCommandPalette() {
    // Simple command palette
    const existing = document.getElementById('command-palette');
    if (existing) { existing.remove(); return; }
    const commands = [
      { label: 'File: New File', action: () => window.EditorManager?.newFile() },
      { label: 'File: Open Folder', action: () => window.silva?.fs.openFolder() },
      { label: 'File: Save', action: () => window.EditorManager?.saveActiveFile() },
      { label: 'View: Toggle Sidebar', action: () => window.FileTreeManager?.toggleSidebar() },
      { label: 'View: Toggle Terminal', action: () => window.TerminalManager?.toggle() },
      { label: 'View: Toggle AI Panel', action: () => window.AIManager?.toggle() },
      { label: 'View: Split Editor', action: () => window.EditorManager?.toggleSplit() },
      { label: 'Editor: Format Document', action: () => window.EditorManager?.formatDocument() },
      { label: 'Terminal: New Terminal', action: () => window.TerminalManager?.newTerminal() },
      { label: 'Git: Refresh', action: () => window.GitManager?.refresh(window.FileTreeManager?.getRootPath()) },
    ];
    const palette = document.createElement('div');
    palette.id = 'command-palette';
    palette.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);width:500px;background:#181825;border:1px solid #45475a;border-radius:6px;z-index:99999;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,0.5)';
    palette.innerHTML = `<input id="cp-input" placeholder="Type a command..." style="width:100%;padding:10px 14px;background:transparent;border:none;border-bottom:1px solid #45475a;color:#cdd6f4;font-size:13px;outline:none">
      <div id="cp-list" style="max-height:300px;overflow-y:auto">${commands.map((c, i) =>
        `<div class="cp-item" data-idx="${i}" style="padding:8px 14px;cursor:pointer;font-size:12px;color:#cdd6f4;transition:background 0.1s" onmouseover="this.style.background='#313244'" onmouseout="this.style.background=''">${c.label}</div>`
      ).join('')}</div>`;
    document.body.appendChild(palette);
    const input = document.getElementById('cp-input');
    input.focus();
    palette.querySelectorAll('.cp-item').forEach(el => {
      el.addEventListener('click', () => { const cmd = commands[parseInt(el.dataset.idx)]; palette.remove(); cmd.action(); });
    });
    input.addEventListener('input', () => {
      const q = input.value.toLowerCase();
      palette.querySelectorAll('.cp-item').forEach(el => {
        el.style.display = el.textContent.toLowerCase().includes(q) ? 'block' : 'none';
      });
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') palette.remove();
      if (e.key === 'Enter') {
        const visible = [...palette.querySelectorAll('.cp-item')].find(el => el.style.display !== 'none');
        if (visible) { const cmd = commands[parseInt(visible.dataset.idx)]; palette.remove(); cmd.action(); }
      }
    });
    document.addEventListener('click', e => { if (!palette.contains(e.target)) palette.remove(); }, { once: true });
  }

  return { init };
})();
