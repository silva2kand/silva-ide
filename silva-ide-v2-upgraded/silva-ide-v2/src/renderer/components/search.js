'use strict';
window.SearchManager = (() => {
  function init() {
    renderPanel();
    const bind = (id, handler) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', handler);
    };
    bind('btn-search', search);
    bind('btn-replace-all', replaceAll);
    const input = document.getElementById('search-input');
    if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') search(); });
    if (window.silva) window.silva.on('menu:find', () => {
      document.querySelector('.ab-btn[data-panel="search"]').click();
      document.getElementById('search-input')?.focus();
    });
    if (window.silva) window.silva.on('menu:replace', () => {
      document.querySelector('.ab-btn[data-panel="search"]').click();
      document.getElementById('search-replace')?.focus();
    });
  }

  function renderPanel() {
    const container = document.getElementById('panel-search');
    if (!container) return;
    if (container.dataset.ready === '1') return;
    container.dataset.ready = '1';
    container.innerHTML = `
      <div class="panel-header">
        <span>SEARCH</span>
      </div>
      <div style="padding:10px;display:flex;flex-direction:column;gap:8px;overflow:auto;height:100%">
        <div style="display:flex;gap:6px">
          <input id="search-input" placeholder="Search" style="flex:1;background:var(--surface0);border:1px solid var(--surface1);border-radius:6px;padding:8px;color:var(--text);font-size:12px">
          <button class="btn-primary" id="btn-search" style="padding:8px 10px">Find</button>
        </div>
        <div style="display:flex;gap:6px">
          <input id="search-replace" placeholder="Replace" style="flex:1;background:var(--surface0);border:1px solid var(--surface1);border-radius:6px;padding:8px;color:var(--text);font-size:12px">
          <button class="btn-secondary" id="btn-replace-all" style="padding:8px 10px">Replace All</button>
        </div>
        <div style="display:flex;gap:10px;align-items:center;font-size:11px;color:var(--subtext1)">
          <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="search-case">Case</label>
          <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="search-word">Word</label>
          <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="search-regex">Regex</label>
        </div>
        <div id="search-results" style="margin-top:6px"></div>
      </div>
    `;
  }

  async function search() {
    const query = document.getElementById('search-input').value.trim();
    if (!query) return;
    const results = document.getElementById('search-results');
    results.innerHTML = '<div style="padding:8px;font-size:11px;color:#6c7086">Searching project...</div>';
    
    const options = {
      caseSensitive: document.getElementById('search-case').checked,
      useRegex: document.getElementById('search-regex').checked,
      wholeWord: document.getElementById('search-word').checked
    };

    const rootPath = window.FileTreeManager?.getRootPath();
    let html = '';
    let totalMatches = 0;

    if (rootPath && window.silva?.fs.search) {
      const res = await window.silva.fs.search(rootPath, query, options);
      if (res.success) {
        for (const file of res.results) {
          totalMatches += file.matches.length;
          html += `<div class="search-result-item search-result-file" style="cursor:pointer" data-path="${file.path}">${file.name} (${file.matches.length})</div>`;
          html += file.matches.slice(0, 30).map(m =>
            `<div class="search-result-item search-result-line" data-path="${file.path}" data-line="${m.line}">${m.line}: ${escapeHtml(m.content).slice(0, 120)}</div>`
          ).join('');
        }
      }
    } else {
      // Fallback to open tabs only
      const tabs = window.EditorManager?.getAllTabs() || [];
      if (tabs.length === 0) { results.innerHTML = '<div style="padding:8px;font-size:11px;color:#6c7086">No folder open & no tabs open</div>'; return; }
      
      for (const tab of tabs) {
        const content = tab.model.getValue();
        const lines = content.split('\n');
        const fileMatches = [];
        
        let pattern = options.useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (options.wholeWord) pattern = `\\b${pattern}\\b`;
        const re = new RegExp(pattern, options.caseSensitive ? 'g' : 'gi');

        for (let i = 0; i < lines.length; i++) {
          if (re.test(lines[i])) {
            fileMatches.push({ line: i + 1, content: lines[i].trim() });
            totalMatches++;
          }
        }
        if (fileMatches.length) {
          html += `<div class="search-result-item search-result-file" style="cursor:pointer" data-path="${tab.path}">${tab.name} (${fileMatches.length})</div>`;
          html += fileMatches.slice(0, 30).map(m =>
            `<div class="search-result-item search-result-line" data-path="${tab.path}" data-line="${m.line}">${m.line}: ${escapeHtml(m.content).slice(0, 120)}</div>`
          ).join('');
        }
      }
    }

    results.innerHTML = html || `<div style="padding:8px;font-size:11px;color:#6c7086">No results for "${query}"</div>`;
    if (totalMatches > 0) results.innerHTML = `<div style="padding:4px 8px;font-size:10px;color:#6c7086">${totalMatches} match(es)</div>` + results.innerHTML;
    
    results.querySelectorAll('.search-result-line, .search-result-file').forEach(el => {
      el.addEventListener('click', async () => {
        const path = el.dataset.path;
        const line = parseInt(el.dataset.line);
        if (path) {
          await window.EditorManager?.openFileByPath(path);
          if (line) {
            setTimeout(() => {
              const ed = monaco?.editor?.getEditors?.()?.[0];
              if (ed) { ed.revealLineInCenter(line); ed.setPosition({ lineNumber: line, column: 1 }); ed.focus(); }
            }, 200);
          }
        }
      });
    });
  }

  function replaceAll() {
    const query = document.getElementById('search-input').value.trim();
    const replace = document.getElementById('search-replace').value;
    if (!query) return;
    const tabs = window.EditorManager?.getAllTabs() || [];
    let count = 0;
    for (const tab of tabs) {
      const content = tab.model.getValue();
      const newContent = content.split(query).join(replace);
      if (newContent !== content) {
        tab.model.setValue(newContent);
        count += (content.split(query).length - 1);
      }
    }
    window.notify?.(`Replaced ${count} occurrence(s)`, count > 0 ? 'success' : 'info');
  }

  function escapeHtml(t) { return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  return { init, search };
})();
