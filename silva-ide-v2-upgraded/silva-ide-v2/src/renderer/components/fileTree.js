'use strict';
window.FileTreeManager = (() => {
  let rootPath = null;
  let treeData = [];
  let selectedPath = null;
  const openDirs = new Set();
  let contextTarget = null;

  function init() {
    const bind = (id, handler) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', handler);
    };
    bind('btn-open-folder-2', openFolder);
    bind('btn-new-file', () => createNew('file'));
    bind('btn-new-folder', () => createNew('folder'));
    bind('btn-refresh-tree', refreshTree);
    setupContextMenu();
    if (window.silva) {
      window.silva.on('folder:opened', ({ path, tree }) => { rootPath = path; treeData = tree; render(); });
      window.silva.on('file:opened', ({ path, content }) => {
        window.EditorManager?.openFile({ path, content });
      });
      window.silva.on('menu:new-file', () => window.EditorManager?.newFile());
      window.silva.on('menu:save', () => window.EditorManager?.saveActiveFile());
      window.silva.on('menu:save-as', () => window.EditorManager?.saveAs());
      window.silva.on('menu:find', () => window.EditorManager?.findInEditor());
      window.silva.on('menu:toggle-sidebar', toggleSidebar);
      window.silva.on('menu:toggle-terminal', () => window.TerminalManager?.toggle());
      window.silva.on('menu:toggle-ai', () => window.AIManager?.toggle());
      window.silva.on('menu:new-terminal', () => window.TerminalManager?.newTerminal());
      window.silva.on('menu:run-file', runActiveFile);
    }
  }

  async function openFolder() {
    await window.silva?.fs.openFolder();
  }

  async function refreshTree() {
    if (!rootPath || !window.silva) return;
    const result = await window.silva.fs.refreshTree(rootPath);
    if (result.success) { treeData = result.tree; render(); }
  }

  function render() {
    const container = document.getElementById('file-tree');
    const noMsg = document.getElementById('no-folder-msg');
    if (!rootPath) { container.innerHTML = ''; noMsg.style.display = 'flex'; return; }
    noMsg.style.display = 'none';
    container.innerHTML = '';
    const rootLabel = document.createElement('div');
    rootLabel.className = 'tree-item directory';
    rootLabel.style.cssText = 'font-size:11px;font-weight:700;text-transform:uppercase;color:#89b4fa;padding:6px 8px 2px';
    rootLabel.textContent = rootPath.split(/[/\\]/).pop();
    container.appendChild(rootLabel);
    renderTree(container, treeData, 0);
    const folderName = document.getElementById('folder-name');
    if (folderName) folderName.textContent = rootPath.split(/[/\\]/).pop();
  }

  function renderTree(container, items, depth) {
    for (const item of items) {
      const el = createTreeItem(item, depth);
      container.appendChild(el);
      if (item.type === 'directory' && openDirs.has(item.path) && item.children) {
        const children = document.createElement('div');
        children.className = 'tree-children open';
        children.dataset.path = item.path;
        renderTree(children, item.children, depth + 1);
        container.appendChild(children);
      }
    }
  }

  function createTreeItem(item, depth) {
    const el = document.createElement('div');
    el.className = `tree-item ${item.type}`;
    el.dataset.path = item.path;
    el.dataset.type = item.type;
    el.style.paddingLeft = `${8 + depth * 14}px`;
    if (item.path === selectedPath) el.classList.add('selected');

    const isOpen = openDirs.has(item.path);
    if (item.type === 'directory') el.classList.toggle('open', isOpen);

    const icon = document.createElement('span');
    icon.className = 'tree-icon';
    icon.textContent = item.type === 'directory' ? (isOpen ? '▾' : '▸') : getFileIcon(item.name);
    el.appendChild(icon);

    const label = document.createElement('span');
    label.textContent = item.name;
    label.style.overflow = 'hidden';
    label.style.textOverflow = 'ellipsis';
    el.appendChild(label);

    el.addEventListener('click', () => handleItemClick(item, el, icon));
    el.addEventListener('contextmenu', e => showContextMenu(e, item));
    el.addEventListener('dblclick', () => {
      if (item.type === 'directory') return;
      openFileItem(item);
    });
    return el;
  }

  async function handleItemClick(item, el, icon) {
    selectedPath = item.path;
    document.querySelectorAll('.tree-item').forEach(e => e.classList.remove('selected'));
    el.classList.add('selected');
    if (item.type === 'directory') {
      if (openDirs.has(item.path)) {
        openDirs.delete(item.path);
        el.classList.remove('open');
        icon.textContent = '▸';
        document.querySelector(`.tree-children[data-path="${CSS.escape(item.path)}"]`)?.remove();
      } else {
        openDirs.add(item.path);
        el.classList.add('open');
        icon.textContent = '▾';
        const children = document.createElement('div');
        children.className = 'tree-children open';
        children.dataset.path = item.path;
        renderTree(children, item.children || [], getDepth(item.path));
        el.after(children);
      }
    } else {
      openFileItem(item);
    }
  }

  async function openFileItem(item) {
    if (!window.silva) return;
    const result = await window.silva.fs.readFile(item.path);
    if (result.success) {
      window.EditorManager?.openFile({ path: item.path, content: result.content });
    } else {
      window.notify?.(`Cannot open file: ${result.error}`, 'error');
    }
  }

  function getDepth(path) {
    if (!rootPath) return 0;
    const rel = path.replace(rootPath, '');
    return (rel.match(/[/\\]/g) || []).length;
  }

  function setupContextMenu() {
    const menu = document.getElementById('context-menu');
    document.addEventListener('click', () => menu.classList.add('hidden'));
    document.addEventListener('contextmenu', e => {
      if (!e.target.closest('.tree-item')) menu.classList.add('hidden');
    });
    menu.addEventListener('click', async e => {
      const action = e.target.dataset.action;
      if (!action || !contextTarget) return;
      menu.classList.add('hidden');
      await handleContextAction(action, contextTarget);
    });
  }

  function showContextMenu(e, item) {
    e.preventDefault();
    e.stopPropagation();
    contextTarget = item;
    const menu = document.getElementById('context-menu');
    menu.classList.remove('hidden');
    const x = Math.min(e.clientX, window.innerWidth - 170);
    const y = Math.min(e.clientY, window.innerHeight - 180);
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.querySelector('[data-action="open"]').style.display = item.type === 'file' ? 'block' : 'none';
  }

  async function handleContextAction(action, item) {
    if (!window.silva) return;
    switch (action) {
      case 'open': openFileItem(item); break;
      case 'rename': {
        const result = await window.silva.dialog.showInput({ message: 'Enter new name:', defaultValue: item.name });
        if (!result.cancelled && result.value) {
          const parent = item.path.replace(/[/\\][^/\\]+$/, '');
          const newPath = parent + (item.path.includes('/') ? '/' : '\\') + result.value;
          await window.silva.fs.rename(item.path, newPath);
          await refreshTree();
        }
        break;
      }
      case 'delete': {
        const ok = confirm(`Delete "${item.name}"? This cannot be undone.`);
        if (ok) { await window.silva.fs.delete(item.path); await refreshTree(); }
        break;
      }
      case 'new-file': await createNew('file', item.type === 'directory' ? item.path : item.path.replace(/[/\\][^/\\]+$/, '')); break;
      case 'new-folder': await createNew('folder', item.type === 'directory' ? item.path : item.path.replace(/[/\\][^/\\]+$/, '')); break;
      case 'copy-path': navigator.clipboard.writeText(item.path); window.notify?.('Path copied!', 'info'); break;
      case 'reveal': await window.silva.fs.revealInExplorer(item.path); break;
    }
  }

  async function createNew(type, inDir = null) {
    if (!rootPath || !window.silva) return;
    const dir = inDir || rootPath;
    const result = await window.silva.dialog.showInput({ message: `Enter ${type} name:`, defaultValue: type === 'file' ? 'newfile.txt' : 'new-folder' });
    if (result.cancelled || !result.value) return;
    if (type === 'file') {
      const res = await window.silva.fs.createFile(dir, result.value);
      if (res.success) { await refreshTree(); openFileItem({ path: res.path, name: result.value }); }
    } else {
      const res = await window.silva.fs.createDirectory(dir, result.value);
      if (res.success) { await refreshTree(); }
    }
  }

  function toggleSidebar() {
    document.getElementById('app').classList.toggle('sidebar-hidden');
  }

  async function runActiveFile() {
    const tab = window.EditorManager?.getActiveTab();
    if (!tab || !tab.path) return;
    await window.EditorManager.saveActiveFile();
    const ext = tab.name.split('.').pop().toLowerCase();
    const cmds = { py: `python3 "${tab.path}"`, js: `node "${tab.path}"`, ts: `ts-node "${tab.path}"`, rb: `ruby "${tab.path}"`, sh: `bash "${tab.path}"`, go: `go run "${tab.path}"`, rs: `rustc "${tab.path}" -o /tmp/out && /tmp/out`, php: `php "${tab.path}"` };
    const cmd = cmds[ext];
    if (cmd) { window.TerminalManager?.show(); window.TerminalManager?.run(cmd); }
    else window.notify?.(`No runner configured for .${ext}`, 'warning');
  }

  function getFileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    const icons = { js: 'js', ts: 'ts', jsx: 'jsx', tsx: 'tsx', py: 'py', rs: 'rs', go: 'go', java: 'java', rb: 'rb', php: 'php', c: 'c', cpp: 'c++', cs: 'c#', html: 'html', css: 'css', scss: 'scss', json: 'json', md: 'md', yaml: 'yaml', yml: 'yml', sh: 'sh', bash: 'sh', sql: 'sql', xml: 'xml', vue: 'vue', svelte: 'svelte', kt: 'kt', swift: 'swift', dart: 'dart', r: 'r', lua: 'lua', zig: 'zig', toml: 'toml', lock: 'lock', gitignore: 'git', env: 'env' };
    return icons[ext] ? `[${icons[ext]}]` : '[ ]';
  }

  function getRootPath() { return rootPath; }
  function getTree() { return treeData; }

  return { init, refreshTree, getRootPath, getTree, toggleSidebar, runActiveFile };
})();
