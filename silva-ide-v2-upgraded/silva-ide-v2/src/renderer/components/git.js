'use strict';
// ─── Git Component ───────────────────────────────────────────────────
window.GitManager = (() => {
  let repoPath = null;
  let gitData = null;

  function init() {
    renderPanel();
    document.getElementById('btn-git-commit')?.addEventListener('click', commit);
    document.getElementById('btn-git-pull')?.addEventListener('click', pull);
    document.getElementById('btn-git-push')?.addEventListener('click', push);
  }

  function renderPanel() {
    const container = document.getElementById('panel-git');
    if (!container) return;
    if (container.dataset.ready === '1') return;
    container.dataset.ready = '1';
    container.innerHTML = `
      <div class="panel-header">
        <span>SOURCE CONTROL</span>
        <div id="git-actions" class="hidden" style="display:flex;gap:6px">
          <button class="icon-btn" id="btn-git-pull" title="Pull">⇩</button>
          <button class="icon-btn" id="btn-git-push" title="Push">⇧</button>
        </div>
      </div>
      <div style="padding:10px;display:flex;flex-direction:column;gap:10px;overflow:auto;height:100%">
        <div id="git-status-display" style="min-height:40px"></div>
        <div id="git-changes-list"></div>
        <div style="display:flex;gap:6px">
          <input id="git-commit-msg" placeholder="Commit message" style="flex:1;background:var(--surface0);border:1px solid var(--surface1);border-radius:6px;padding:8px;color:var(--text);font-size:12px">
          <button class="btn-primary" id="btn-git-commit">Commit</button>
        </div>
        <div id="git-log-list"></div>
      </div>
    `;
  }

  async function refresh(path) {
    if (!window.silva || !path) return;
    repoPath = path;
    const result = await window.silva.git.status(path);
    if (!result.success) {
      const display = document.getElementById('git-status-display');
      if (display) display.innerHTML = `<p style="color:#6c7086;font-size:12px;text-align:center;margin-top:24px">Not a git repository</p>`;
      document.getElementById('git-actions')?.classList.add('hidden');
      return;
    }
    gitData = result;
    document.getElementById('git-actions')?.classList.remove('hidden');
    const display = document.getElementById('git-status-display');
    if (display) display.innerHTML = '';
    renderChanges(result.status);
    renderLog(result.log);
    const branch = result.branches?.current || 'main';
    document.getElementById('git-branch').textContent = ` ${branch}`;
    document.getElementById('git-branch').classList.remove('hidden');
    document.getElementById('status-branch').textContent = ` ${branch}`;
  }

  function renderChanges(status) {
    const list = document.getElementById('git-changes-list');
    if (!list) return;
    const all = [
      ...(status.modified || []).map(f => ({ file: f, badge: 'M' })),
      ...(status.not_added || []).map(f => ({ file: f, badge: 'A' })),
      ...(status.deleted || []).map(f => ({ file: f, badge: 'D' })),
      ...(status.renamed || []).map(f => ({ file: f.to || f, badge: 'R' })),
    ];
    if (all.length === 0) { list.innerHTML = '<div style="font-size:11px;color:#6c7086;padding:4px">No changes</div>'; return; }
    list.innerHTML = `<div style="font-size:10px;color:#6c7086;letter-spacing:1px;margin-bottom:4px">CHANGES (${all.length})</div>` +
      all.map(({ file, badge }) =>
        `<div class="git-change-item"><span class="git-change-badge ${badge}">${badge}</span><span style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${file}">${file}</span></div>`
      ).join('');
  }

  function renderLog(log) {
    const list = document.getElementById('git-log-list');
    if (!list) return;
    if (!log?.length) { list.innerHTML = ''; return; }
    list.innerHTML = `<div style="font-size:10px;color:#6c7086;letter-spacing:1px;margin-bottom:4px">RECENT COMMITS</div>` +
      log.slice(0, 10).map(c =>
        `<div class="git-log-item"><span class="git-log-hash">${c.hash?.slice(0, 7)} </span><span style="color:#cdd6f4">${escapeHtml(c.message?.slice(0, 40) || '')}</span><br><span class="git-log-author" style="font-size:10px">${c.author_name} · ${formatDate(c.date)}</span></div>`
      ).join('');
  }

  async function commit() {
    const msg = document.getElementById('git-commit-msg')?.value?.trim() || '';
    if (!msg) { window.notify?.('Enter a commit message', 'warning'); return; }
    if (!window.silva) return;
    const result = await window.silva.git.commit(repoPath, msg);
    if (result.success) { window.notify?.('Committed!', 'success'); const el = document.getElementById('git-commit-msg'); if (el) el.value = ''; await refresh(repoPath); }
    else window.notify?.(`Commit failed: ${result.error}`, 'error');
  }

  async function pull() {
    if (!window.silva) return;
    window.notify?.('Pulling...', 'info');
    const result = await window.silva.git.pull(repoPath);
    if (result.success) { window.notify?.('Pull successful!', 'success'); await refresh(repoPath); }
    else window.notify?.(`Pull failed: ${result.error}`, 'error');
  }

  async function push() {
    if (!window.silva) return;
    window.notify?.('Pushing...', 'info');
    const result = await window.silva.git.push(repoPath);
    if (result.success) window.notify?.('Push successful!', 'success');
    else window.notify?.(`Push failed: ${result.error}`, 'error');
  }

  function escapeHtml(t) { return t?.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') || ''; }
  function formatDate(d) { try { return new Date(d).toLocaleDateString(); } catch { return d; } }

  return { init, refresh };
})();
