'use strict';

const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

let Store;
try { Store = require('electron-store'); } catch(e) { Store = null; }

let simpleGit;
try { simpleGit = require('simple-git'); } catch(e) { simpleGit = null; }

let chokidar;
try { chokidar = require('chokidar'); } catch(e) { chokidar = null; }

let pty;
try { pty = require('node-pty'); } catch(e) { pty = null; }

const createSecurityManager = require('./security');
const createApprovalGate = require('./gate');
const createKernelMetrics = require('./metrics');
const createKernelVersioning = require('./kernel-versioning');
const createSandboxManager = require('./sandbox');

let SecurityManager = null;
let ApprovalGate = null;
let KernelMetrics = null;
let KernelVersioning = null;
let SandboxManager = null;

const store = Store ? new Store() : { get: (k, d) => d, set: () => {} };

let mainWindow;
let fileWatcher = null;
let terminalProcess = null;
let terminalDataDisp = null;
let terminalExitDisp = null;

function safeSend(contents, channel, ...args) {
  try {
    if (!contents || contents.isDestroyed()) return;
    contents.send(channel, ...args);
  } catch {}
}

function safeSendToWindow(win, channel, ...args) {
  try {
    if (!win || win.isDestroyed()) return;
    const wc = win.webContents;
    safeSend(wc, channel, ...args);
  } catch {}
}

function safeSendMain(channel, ...args) {
  safeSendToWindow(mainWindow, channel, ...args);
}

function initKernelModules() {
  if (SecurityManager && ApprovalGate && KernelMetrics && KernelVersioning && SandboxManager) return;
  const send = (channel, ...args) => safeSendMain(channel, ...args);
  SecurityManager = createSecurityManager({ store });
  ApprovalGate = createApprovalGate({ store, send });
  KernelMetrics = createKernelMetrics({ send });
  KernelVersioning = createKernelVersioning({ store, send });
  SandboxManager = createSandboxManager({ gate: ApprovalGate, security: SecurityManager, store });
  SecurityManager.init();
  ApprovalGate.init();
  KernelMetrics.init();
  KernelVersioning.init();
  SandboxManager.init();
}

function createWindow() {
  const bounds = store.get('windowBounds', { width: 1400, height: 900 });

  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#1e1e2e',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    frame: process.platform !== 'darwin',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
      allowRunningInsecureContent: false,
      sandbox: true,
      webviewTag: false
    },
    icon: path.join(__dirname, '../../public/icon.png'),
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Force CORS and Origin for local AI engines
  const { session } = require('electron');
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const { url } = details;
    if (url.includes('localhost') || url.includes('127.0.0.1') || url.includes('192.168.')) {
      details.requestHeaders['Origin'] = 'http://127.0.0.1';
    }
    callback({ requestHeaders: details.requestHeaders });
  });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const { url } = details;
    if (url.includes('localhost') || url.includes('127.0.0.1') || url.includes('192.168.')) {
      details.responseHeaders['Access-Control-Allow-Origin'] = ['*'];
      details.responseHeaders['Access-Control-Allow-Methods'] = ['GET, POST, OPTIONS, DELETE, PUT'];
      details.responseHeaders['Access-Control-Allow-Headers'] = ['Content-Type, Authorization, x-api-key, anthropic-version, *'];
    }
    callback({ responseHeaders: details.responseHeaders });
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (process.argv.includes('--dev')) mainWindow.webContents.openDevTools();
  });

  mainWindow.on('close', () => {
    try { store.set('windowBounds', mainWindow.getBounds()); } catch {}
    try { fileWatcher?.close(); } catch {}
    try { terminalDataDisp?.dispose?.(); } catch {}
    try { terminalExitDisp?.dispose?.(); } catch {}
    terminalDataDisp = null;
    terminalExitDisp = null;
    try { terminalProcess?.kill?.(); } catch {}
    terminalProcess = null;
    try {
      for (const controller of aiStreamControllers.values()) {
        try { controller.abort(); } catch {}
      }
      aiStreamControllers.clear();
    } catch {}
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  buildMenu();
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New File', accelerator: 'CmdOrCtrl+N', click: () => safeSendMain('menu:new-file') },
        { label: 'Open Folder...', accelerator: 'CmdOrCtrl+Shift+O', click: () => handleOpenFolder() },
        { label: 'Open File...', accelerator: 'CmdOrCtrl+O', click: () => handleOpenFile() },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => safeSendMain('menu:save') },
        { label: 'Save As...', accelerator: 'CmdOrCtrl+Shift+S', click: () => safeSendMain('menu:save-as') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', role: 'selectAll' },
        { type: 'separator' },
        { label: 'Find', accelerator: 'CmdOrCtrl+F', click: () => safeSendMain('menu:find') },
        { label: 'Replace', accelerator: 'CmdOrCtrl+H', click: () => safeSendMain('menu:replace') }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+B', click: () => safeSendMain('menu:toggle-sidebar') },
        { label: 'Toggle Terminal', accelerator: 'CmdOrCtrl+`', click: () => safeSendMain('menu:toggle-terminal') },
        { label: 'Toggle AI Panel', accelerator: 'CmdOrCtrl+Shift+A', click: () => safeSendMain('menu:toggle-ai') },
        { type: 'separator' },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', role: 'zoomIn' },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { label: 'Reset Zoom', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        { type: 'separator' },
        { role: 'toggleDevTools' },
        { role: 'reload' }
      ]
    },
    {
      label: 'Terminal',
      submenu: [
        { label: 'New Terminal', accelerator: 'CmdOrCtrl+Shift+`', click: () => safeSendMain('menu:new-terminal') },
        { label: 'Run File', accelerator: 'F5', click: () => safeSendMain('menu:run-file') }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function handleOpenFolder() {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  if (!result.canceled && result.filePaths[0]) {
    const folderPath = result.filePaths[0];
    store.set('lastFolder', folderPath);
    safeSendMain('folder:opened', { path: folderPath, tree: [] });
    setTimeout(() => {
      const tree = buildFileTree(folderPath);
      safeSendMain('folder:opened', { path: folderPath, tree });
    }, 50);
  }
}

async function handleOpenFile() {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile', 'multiSelections'] });
  if (!result.canceled) {
    for (const filePath of result.filePaths) {
      const content = fs.readFileSync(filePath, 'utf8');
      safeSendMain('file:opened', { path: filePath, content });
    }
  }
}

function buildFileTree(dirPath, depth = 0, state = null) {
  state = state || { total: 0, maxTotal: 7000, maxPerDir: 500 };
  if (depth > 6) return [];
  if (state.total >= state.maxTotal) return [];
  const IGNORE = new Set(['.git', 'node_modules', '__pycache__', '.next', 'dist', 'build', '.DS_Store', 'target', '.venv', 'venv', 'env', '.idea', '.vs', 'obj', 'bin']);
  let entries = [];
  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    const sorted = items.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });
    let perDir = 0;
    for (const item of sorted) {
      if (state.total >= state.maxTotal) break;
      if (perDir >= state.maxPerDir) break;
      if (IGNORE.has(item.name) || item.name.startsWith('.')) continue;
      const fullPath = path.join(dirPath, item.name);
      if (item.isDirectory()) {
        state.total += 1;
        perDir += 1;
        entries.push({ name: item.name, path: fullPath, type: 'directory', children: buildFileTree(fullPath, depth + 1, state) });
      } else {
        state.total += 1;
        perDir += 1;
        entries.push({ name: item.name, path: fullPath, type: 'file', ext: path.extname(item.name) });
      }
    }
  } catch (e) {}
  return entries;
}

ipcMain.handle('fs:read-file', async (_, filePath) => {
  try { return { success: true, content: fs.readFileSync(filePath, 'utf8') }; }
  catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('fs:write-file', async (_, { filePath, content }) => {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('fs:save-dialog', async (_, { defaultPath, filters }) => {
  const result = await dialog.showSaveDialog(mainWindow, { defaultPath, filters: filters || [] });
  return result;
});

ipcMain.handle('fs:open-folder', async () => { await handleOpenFolder(); return true; });

ipcMain.handle('fs:open-file', async () => { await handleOpenFile(); return true; });

ipcMain.handle('fs:open-folder-path', async (_, folderPath) => {
  try {
    if (!folderPath || typeof folderPath !== 'string') return { success: false, error: 'Invalid folder path' };
    const p = folderPath.trim();
    if (!fs.existsSync(p)) return { success: false, error: 'Folder does not exist' };
    const st = fs.statSync(p);
    if (!st.isDirectory()) return { success: false, error: 'Path is not a folder' };
    store.set('lastFolder', p);
    safeSendMain('folder:opened', { path: p, tree: [] });
    setTimeout(() => {
      const tree = buildFileTree(p);
      safeSendMain('folder:opened', { path: p, tree });
    }, 50);
    return { success: true, path: p };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('fs:delete', async (_, filePath) => {
  try { fs.rmSync(filePath, { recursive: true }); return { success: true }; }
  catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('fs:rename', async (_, { oldPath, newPath }) => {
  try { fs.renameSync(oldPath, newPath); return { success: true }; }
  catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('fs:create-file', async (_, { dirPath, name }) => {
  try {
    const filePath = path.join(dirPath, name);
    fs.writeFileSync(filePath, '', 'utf8');
    return { success: true, path: filePath };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('fs:create-directory', async (_, { dirPath, name }) => {
  try {
    const fullPath = path.join(dirPath, name);
    fs.mkdirSync(fullPath, { recursive: true });
    return { success: true, path: fullPath };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('fs:create-project', async (_, { rootPath, type }) => {
  try {
    if (type === 'nodejs') {
      fs.writeFileSync(path.join(rootPath, 'package.json'), JSON.stringify({ name: path.basename(rootPath), version: '1.0.0', main: 'index.js' }, null, 2));
      fs.writeFileSync(path.join(rootPath, 'index.js'), "console.log('Hello from Silva IDE!');");
      fs.writeFileSync(path.join(rootPath, '.gitignore'), "node_modules\n.env\ndist");
    } else if (type === 'python') {
      fs.writeFileSync(path.join(rootPath, 'main.py'), "print('Hello from Silva IDE!')");
      fs.writeFileSync(path.join(rootPath, 'requirements.txt'), "");
      fs.writeFileSync(path.join(rootPath, '.gitignore'), "__pycache__/\n.venv/");
    }
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('fs:refresh-tree', async (_, folderPath) => {
  try { return { success: true, tree: buildFileTree(folderPath) }; }
  catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('fs:search', async (_, { rootPath, query, options }) => {
  const { caseSensitive, useRegex, wholeWord } = options || {};
  const results = [];
  const IGNORE = new Set(['.git', 'node_modules', 'dist', 'build', '.DS_Store', 'node_modules', 'bin', 'obj']);
  
  function searchDir(dir) {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      if (IGNORE.has(item.name) || item.name.startsWith('.')) continue;
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        searchDir(fullPath);
      } else {
        try {
          // Skip large files or binary-looking extensions
          if (fs.statSync(fullPath).size > 1024 * 1024) continue;
          const ext = path.extname(item.name).toLowerCase();
          if (['.exe', '.dll', '.bin', '.png', '.jpg', '.zip', '.gz'].includes(ext)) continue;

          const content = fs.readFileSync(fullPath, 'utf8');
          const lines = content.split('\n');
          const matches = [];
          
          let pattern = useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          if (wholeWord) pattern = `\\b${pattern}\\b`;
          const re = new RegExp(pattern, caseSensitive ? 'g' : 'gi');

          lines.forEach((line, idx) => {
            if (re.test(line)) {
              matches.push({ line: idx + 1, content: line.trim() });
            }
          });

          if (matches.length > 0) {
            results.push({ path: fullPath, name: item.name, matches });
          }
        } catch (e) {}
      }
    }
  }

  try {
    searchDir(rootPath);
    return { success: true, results };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('fs:reveal-in-explorer', async (_, filePath) => {
  shell.showItemInFolder(filePath);
  return true;
});

ipcMain.handle('store:get', (_, { key, defaultValue }) => store.get(key, defaultValue));
ipcMain.handle('store:set', (_, { key, value }) => { store.set(key, value); return true; });

ipcMain.handle('git:status', async (_, repoPath) => {
  if (!simpleGit) return { success: false, error: 'simple-git not available' };
  try {
    const git = simpleGit(repoPath);
    const status = await git.status();
    const log = await git.log({ maxCount: 20 }).catch(() => ({ all: [] }));
    const branches = await git.branch().catch(() => ({ current: 'main', all: [] }));
    const statusSafe = {
      current: status.current || '',
      tracking: status.tracking || '',
      ahead: Number(status.ahead || 0),
      behind: Number(status.behind || 0),
      not_added: Array.isArray(status.not_added) ? status.not_added : [],
      created: Array.isArray(status.created) ? status.created : [],
      deleted: Array.isArray(status.deleted) ? status.deleted : [],
      modified: Array.isArray(status.modified) ? status.modified : [],
      staged: Array.isArray(status.staged) ? status.staged : [],
      conflicted: Array.isArray(status.conflicted) ? status.conflicted : [],
      renamed: Array.isArray(status.renamed) ? status.renamed.map(r => ({ from: r?.from || '', to: r?.to || '' })) : [],
      files: Array.isArray(status.files) ? status.files.map(f => ({
        path: f?.path || f?.file || '',
        index: f?.index || '',
        working_dir: f?.working_dir || '',
      })) : [],
    };
    const logSafe = Array.isArray(log?.all) ? log.all.map(c => ({
      hash: c?.hash || '',
      date: c?.date || '',
      message: c?.message || '',
      author_name: c?.author_name || '',
      author_email: c?.author_email || '',
    })) : [];
    const branchesSafe = {
      current: branches?.current || 'main',
      all: Array.isArray(branches?.all) ? branches.all : [],
    };
    return { success: true, status: statusSafe, log: logSafe, branches: branchesSafe };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('git:commit', async (_, { repoPath, message }) => {
  if (!simpleGit) return { success: false, error: 'simple-git not available' };
  try {
    const git = simpleGit(repoPath);
    await git.add('.');
    await git.commit(message);
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('git:pull', async (_, repoPath) => {
  if (!simpleGit) return { success: false, error: 'simple-git not available' };
  try { const git = simpleGit(repoPath); const result = await git.pull(); return { success: true, result }; }
  catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('git:push', async (_, repoPath) => {
  if (!simpleGit) return { success: false, error: 'simple-git not available' };
  try { const git = simpleGit(repoPath); const result = await git.push(); return { success: true, result }; }
  catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('terminal:create', async (_, { cwd }) => {
  if (!pty) return { success: false, error: 'node-pty not available' };
  try {
    try { terminalDataDisp?.dispose?.(); } catch {}
    try { terminalExitDisp?.dispose?.(); } catch {}
    terminalDataDisp = null;
    terminalExitDisp = null;
    if (terminalProcess) { terminalProcess.kill(); terminalProcess = null; }
    const shell = process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL || '/bin/bash');
    terminalProcess = pty.spawn(shell, [], { name: 'xterm-color', cols: 80, rows: 24, cwd: cwd || os.homedir(), env: process.env });
    terminalDataDisp = terminalProcess.onData(data => safeSendMain('terminal:data', data));
    terminalExitDisp = terminalProcess.onExit(() => safeSendMain('terminal:exit'));
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('terminal:write', async (_, data) => {
  if (!terminalProcess) return { success: false, error: 'No terminal session' };
  try {
    terminalProcess.write(data);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('terminal:resize', async (_, { cols, rows }) => {
  if (!terminalProcess) return { success: false, error: 'No terminal session' };
  try {
    terminalProcess.resize(cols, rows);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('app:get-version', () => app.getVersion());
ipcMain.handle('app:get-platform', () => process.platform);
ipcMain.handle('app:get-home', () => os.homedir());

ipcMain.handle('ai:proxy-request', async (_, { url, method, headers, body }) => {
  try {
    const options = {
      method: method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://127.0.0.1',
        ...headers
      },
      signal: AbortSignal.timeout(120000) // 2 minutes for local inference
    };
    if (body) options.body = typeof body === 'string' ? body : JSON.stringify(body);
    
    const response = await fetch(url, options);
    const data = await response.json().catch(() => null);
    
    return { 
      success: response.ok, 
      status: response.status,
      data: data
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

const aiStreamControllers = new Map();

ipcMain.on('ai:proxy-stream-start', async (event, { id, url, method, headers, body }) => {
  const controller = new AbortController();
  aiStreamControllers.set(id, controller);
  try {
    const timeout = setTimeout(() => {
      try { controller.abort(); } catch {}
    }, 300000);
    const response = await fetch(url, {
      method: method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://127.0.0.1',
        ...headers
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
      signal: controller.signal
    });

    if (!response.ok) {
      const err = await response.text();
      safeSend(event.sender, `ai:proxy-stream-error:${id}`, err);
      aiStreamControllers.delete(id);
      clearTimeout(timeout);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        safeSend(event.sender, `ai:proxy-stream-end:${id}`);
        break;
      }
      const chunk = decoder.decode(value, { stream: true });
      safeSend(event.sender, `ai:proxy-stream-data:${id}`, chunk);
    }
    aiStreamControllers.delete(id);
    clearTimeout(timeout);
  } catch (e) {
    safeSend(event.sender, `ai:proxy-stream-error:${id}`, e.message);
    aiStreamControllers.delete(id);
  }
});

ipcMain.on('ai:proxy-stream-cancel', (_, { id }) => {
  const controller = aiStreamControllers.get(id);
  if (controller) {
    try { controller.abort(); } catch {}
  }
  aiStreamControllers.delete(id);
});

// Global Context Menu for Copy/Paste
const { Menu: ElectronMenu } = require('electron');
app.on('web-contents-created', (event, contents) => {
  contents.on('context-menu', (e, props) => {
    const { selectionText, isEditable } = props;
    const menuTemplate = [];
    if (selectionText && selectionText.trim().length > 0) {
      menuTemplate.push({ role: 'copy' });
    }
    if (isEditable) {
      menuTemplate.push({ role: 'paste' });
      menuTemplate.push({ role: 'selectAll' });
    }
    if (menuTemplate.length > 0) {
      const menu = ElectronMenu.buildFromTemplate(menuTemplate);
      menu.popup(BrowserWindow.fromWebContents(contents));
    }
  });
});

ipcMain.handle('dialog:show-message', async (_, opts) => dialog.showMessageBox(mainWindow, opts));

ipcMain.handle('dialog:show-input', async (_, { title, message, defaultValue }) => {
  return new Promise(resolve => {
    const esc = (s) => String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    const inputWin = new BrowserWindow({
      width: 400, height: 180, parent: mainWindow, modal: true, resizable: false,
      title: title || 'Input',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        preload: path.join(__dirname, 'preload.js'),
      }
    });
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'"><title>${esc(title || 'Input')}</title></head>
    <body style="font-family:sans-serif;padding:16px;background:#1e1e2e;color:#cdd6f4">
      <p style="margin:0 0 8px">${esc(message || '')}</p>
      <input id="v" value="${esc(defaultValue || '')}" style="width:100%;padding:6px;background:#313244;border:1px solid #45475a;color:#cdd6f4;border-radius:4px">
      <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
        <button id="btn-cancel" style="padding:6px 12px;background:#313244;border:1px solid #45475a;color:#cdd6f4;border-radius:4px;cursor:pointer">Cancel</button>
        <button id="btn-ok" style="padding:6px 12px;background:#89b4fa;border:none;color:#1e1e2e;border-radius:4px;cursor:pointer">OK</button>
      </div>
      <script>
        const v = document.getElementById('v');
        v.focus();
        v.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') window.silva?.dialogInput?.ok?.(v.value);
          if (e.key === 'Escape') window.silva?.dialogInput?.cancel?.();
        });
        document.getElementById('btn-ok').addEventListener('click', () => window.silva?.dialogInput?.ok?.(v.value));
        document.getElementById('btn-cancel').addEventListener('click', () => window.silva?.dialogInput?.cancel?.());
      </script>
    </body></html>`;
    inputWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    const { ipcMain: im } = require('electron');
    const acceptFromThisWindow = (evt) => {
      try { return evt?.sender?.id === inputWin.webContents.id; } catch { return false; }
    };
    const ok = (evt, v) => {
      if (!acceptFromThisWindow(evt)) return;
      resolve({ value: v, cancelled: false });
      try { inputWin.close(); } catch {}
      im.removeListener('input:ok', ok);
      im.removeListener('input:cancel', cancel);
    };
    const cancel = (evt) => {
      if (evt && !acceptFromThisWindow(evt)) return;
      resolve({ value: '', cancelled: true });
      try { inputWin.close(); } catch {}
      im.removeListener('input:ok', ok);
      im.removeListener('input:cancel', cancel);
    };
    im.on('input:ok', ok);
    im.on('input:cancel', cancel);
    inputWin.on('closed', () => cancel());
  });
});

// ─── Kernel IPC Handlers ───

// Security handlers
ipcMain.handle('security:enforce-identity', (_, { source, identity }) => SecurityManager.enforceIdentity(source, identity));
ipcMain.handle('security:rate-limit', (_, { identity, action }) => SecurityManager.enforceRateLimit(identity, action));
ipcMain.handle('security:scan-secrets', (_, data) => SecurityManager.scanForSecrets(data));
ipcMain.handle('security:mask-secrets', (_, data) => SecurityManager.maskSecrets(data));
ipcMain.handle('security:validate-boundaries', (_, { context, data }) => SecurityManager.validateDataBoundaries(context, data));
ipcMain.handle('security:add-whitelist', (_, id) => SecurityManager.addWhitelist(id));
ipcMain.handle('security:block', (_, id) => SecurityManager.blockIdentity(id));
ipcMain.handle('security:remove-whitelist', (_, id) => SecurityManager.removeWhitelist(id));
ipcMain.handle('security:remove-block', (_, id) => SecurityManager.removeBlock(id));
ipcMain.handle('security:whitelist', () => SecurityManager.getWhitelist());
ipcMain.handle('security:blocked', () => SecurityManager.getBlocked());
ipcMain.handle('security:rate-limits', () => SecurityManager.getRateLimits());
ipcMain.handle('security:reset-rates', () => SecurityManager.resetRateLimits());
ipcMain.handle('security:boundaries', (_, context) => SecurityManager.getBoundaries(context));

// Gate handlers
ipcMain.handle('gate:enforce', (_, { action, agent, context }) => ApprovalGate.enforce(action, agent, context));
ipcMain.handle('gate:approve', (_, gateId) => ApprovalGate.approve(gateId));
ipcMain.handle('gate:deny', (_, gateId) => ApprovalGate.deny(gateId));
ipcMain.handle('gate:history', (_, limit) => ApprovalGate.getHistory(limit));
ipcMain.handle('gate:pending', () => ApprovalGate.getPending());
ipcMain.handle('gate:always-allow', () => ApprovalGate.getAlwaysAllow());
ipcMain.handle('gate:always-deny', () => ApprovalGate.getAlwaysDeny());
ipcMain.handle('gate:clear-always-allow', () => ApprovalGate.clearAlwaysAllow());
ipcMain.handle('gate:clear-always-deny', () => ApprovalGate.clearAlwaysDeny());
ipcMain.handle('gate:capabilities', () => ({ actions: ApprovalGate.ACTIONS, agents: ApprovalGate.AGENT_CAPABILITIES }));

// Metrics handlers
ipcMain.handle('metrics:record', (_, { agent, action, outcome, details }) => { KernelMetrics.record(agent, action, outcome, details); return true; });
ipcMain.handle('metrics:record-provider', (_, { provider, outcome, details }) => { KernelMetrics.recordProvider(provider, outcome, details); return true; });
ipcMain.handle('metrics:reset-agent', (_, agent) => KernelMetrics.resetAgent(agent));
ipcMain.handle('metrics:reset-all', () => KernelMetrics.resetAll());
ipcMain.handle('metrics:agent', () => KernelMetrics.getAgentMetrics());
ipcMain.handle('metrics:provider', () => KernelMetrics.getProviderMetrics());
ipcMain.handle('metrics:state', () => KernelMetrics.getKernelState());
ipcMain.handle('metrics:alerts', () => KernelMetrics.getAlerts());
ipcMain.handle('metrics:ack-alert', (_, alertId) => KernelMetrics.acknowledgeAlert(alertId));

// Kernel versioning handlers
ipcMain.handle('kernel:versioning:snapshot', (_, { author, label }) => KernelVersioning.snapshot(author, label));
ipcMain.handle('kernel:versioning:rollback', (_, versionId) => KernelVersioning.rollback(versionId));
ipcMain.handle('kernel:versioning:versions', () => KernelVersioning.listVersions());
ipcMain.handle('kernel:versioning:history', (_, limit) => KernelVersioning.listHistory(limit));
ipcMain.handle('kernel:versioning:info', (_, versionId) => KernelVersioning.getVersionInfo(versionId));
ipcMain.handle('kernel:versioning:diff', (_, versionId) => KernelVersioning.getDiff(versionId));
ipcMain.handle('kernel:versioning:bump', () => KernelVersioning.bumpVersion());

// Sandbox handlers
ipcMain.handle('sandbox:create', (_, { id, agent }) => SandboxManager.createSandbox(id, agent));
ipcMain.handle('sandbox:test', (_, { agent, action, payload }) => SandboxManager.testInShadow(agent, action, payload));
ipcMain.handle('sandbox:golden', (_, testId) => SandboxManager.runGoldenTests(testId));
ipcMain.handle('sandbox:apply', () => SandboxManager.applyChanges());
ipcMain.handle('sandbox:clear', () => SandboxManager.clear());
ipcMain.handle('sandbox:active', () => SandboxManager.getActiveSandbox());
ipcMain.handle('sandbox:results', () => SandboxManager.getResults());
ipcMain.handle('sandbox:suites', () => SandboxManager.getTestSuites());

app.whenReady().then(() => {
  createWindow();
  initKernelModules();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  const lastFolder = store.get('lastFolder');
  if (lastFolder && fs.existsSync(lastFolder)) {
    setTimeout(() => {
      safeSendMain('folder:opened', { path: lastFolder, tree: [] });
      setTimeout(() => {
        const tree = buildFileTree(lastFolder);
        safeSendMain('folder:opened', { path: lastFolder, tree });
      }, 50);
    }, 800);
  }
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
