'use strict';
window.TerminalManager = (() => {
  let terminal = null;
  let fitAddon = null;
  let visible = true;
  let initialized = false;
  let backendReady = false;
  let currentCwd = null;

  function init() {
    setupBottomTabs();
    setupResizeHandle();
    const bind = (id, handler) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', handler);
    };
    bind('btn-close-panel', hide);
    bind('btn-new-terminal', newTerminal);
    bind('btn-clear-terminal', clearTerminal);
    if (window.silva) {
      window.silva.on('folder:opened', ({ path }) => {
        syncTerminalCwd(path);
      });
    }
    // Start terminal after a short delay so xterm loads
    setTimeout(initTerminal, 500);
  }

  function setupBottomTabs() {
    document.querySelectorAll('.bottom-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.bottom-tab').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.bottom-tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        const tab = document.getElementById(`tab-${btn.dataset.tab}`);
        if (tab) tab.classList.add('active');
        if (btn.dataset.tab === 'terminal') { show(); fitTerminal(); }
      });
    });
  }

  function setupResizeHandle() {
    const bottomPanel = document.getElementById('bottom-panel');
    let isResizing = false;
    let startY = 0;
    let startH = 0;

    const handle = document.createElement('div');
    handle.style.cssText = 'height:4px;cursor:ns-resize;background:var(--surface0);flex-shrink:0;';
    handle.addEventListener('mouseenter', () => handle.style.background = 'var(--accent)');
    handle.addEventListener('mouseleave', () => !isResizing && (handle.style.background = 'var(--surface0)'));
    bottomPanel.parentElement.insertBefore(handle, bottomPanel);

    handle.addEventListener('mousedown', e => {
      isResizing = true;
      startY = e.clientY;
      startH = bottomPanel.offsetHeight;
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
    });
    document.addEventListener('mousemove', e => {
      if (!isResizing) return;
      const delta = startY - e.clientY;
      const newH = Math.max(80, Math.min(600, startH + delta));
      bottomPanel.style.height = `${newH}px`;
      fitTerminal();
    });
    document.addEventListener('mouseup', () => {
      isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      handle.style.background = 'var(--surface0)';
    });
  }

  async function initTerminal() {
    const container = document.getElementById('terminal-container');
    if (!container || typeof Terminal === 'undefined') {
      // Fallback: show a simple terminal emulator
      showFallbackTerminal(container);
      return;
    }

    try {
      terminal = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
        theme: {
          background: '#11111b',
          foreground: '#cdd6f4',
          cursor: '#f5c2e7',
          selection: '#45475a',
          black: '#45475a', brightBlack: '#585b70',
          red: '#f38ba8', brightRed: '#f38ba8',
          green: '#a6e3a1', brightGreen: '#a6e3a1',
          yellow: '#f9e2af', brightYellow: '#f9e2af',
          blue: '#89b4fa', brightBlue: '#89b4fa',
          magenta: '#cba6f7', brightMagenta: '#cba6f7',
          cyan: '#89dceb', brightCyan: '#89dceb',
          white: '#bac2de', brightWhite: '#cdd6f4',
        },
        allowTransparency: true,
        scrollback: 5000,
      });

      if (typeof FitAddon !== 'undefined') {
        fitAddon = new FitAddon.FitAddon();
        terminal.loadAddon(fitAddon);
      }

      terminal.open(container);
      fitTerminal();
      initialized = true;

      if (window.silva) {
        const cwd = window.FileTreeManager?.getRootPath() || null;
        currentCwd = cwd;
        const result = await window.silva.terminal.create(cwd);
        if (result.success) {
          backendReady = true;
          window.silva.terminal.onData(data => terminal.write(data));
          window.silva.terminal.onExit(() => {
            backendReady = false;
            terminal.writeln('\r\n\x1b[33m[Process exited. Press any key for new terminal]\x1b[0m');
          });
          terminal.onData(data => window.silva.terminal.write(data));
          terminal.onResize(({ cols, rows }) => window.silva.terminal.resize(cols, rows));
        } else {
          backendReady = false;
          terminal.writeln('\x1b[33mTerminal backend unavailable (install node-pty for full terminal)\x1b[0m');
          setupFakeShell();
        }
      }

      terminal.writeln('\x1b[1;34m Silva IDE Terminal \x1b[0m');
      terminal.writeln('\x1b[90m─────────────────────────────────────────\x1b[0m');

    } catch (e) {
      console.error('Terminal init error:', e);
      showFallbackTerminal(container);
    }
  }

  function setupFakeShell() {
    let buf = '';
    terminal.writeln('');
    terminal.write('\x1b[32m$ \x1b[0m');
    terminal.onData(data => {
      if (data === '\r') {
        terminal.writeln('');
        handleFakeCommand(buf.trim());
        buf = '';
        terminal.write('\x1b[32m$ \x1b[0m');
      } else if (data === '\x7f') {
        if (buf.length > 0) { buf = buf.slice(0, -1); terminal.write('\x08 \x08'); }
      } else if (data >= ' ' || data === '\t') {
        buf += data;
        terminal.write(data);
      }
    });
  }

  function handleFakeCommand(cmd) {
    if (!cmd) return;
    const parts = cmd.split(' ');
    const base = parts[0];
    if (base === 'clear' || base === 'cls') { terminal.clear(); return; }
    if (base === 'echo') { terminal.writeln(parts.slice(1).join(' ')); return; }
    if (base === 'help') {
      terminal.writeln('\x1b[33mInstall node-pty for full shell support.\x1b[0m');
      terminal.writeln('Available: clear, echo, help');
      return;
    }
    terminal.writeln(`\x1b[31mCommand not found: ${base} (install node-pty for full terminal)\x1b[0m`);
  }

  function showFallbackTerminal(container) {
    if (!container) return;
    container.style.cssText = 'padding:12px;font-family:monospace;font-size:12px;color:#cdd6f4;background:#11111b;height:100%;overflow-y:auto';
    container.innerHTML = '<div style="color:#f9e2af">⚠ Terminal requires node-pty. Run <code style="background:#313244;padding:2px 4px;border-radius:3px">npm install</code> to enable.</div>';
    initialized = false;
  }

  function fitTerminal() {
    if (fitAddon && initialized) {
      try { fitAddon.fit(); } catch (e) {}
    }
  }

  function show() {
    const panel = document.getElementById('bottom-panel');
    panel.classList.remove('hidden');
    visible = true;
    setTimeout(fitTerminal, 50);
  }

  function hide() {
    document.getElementById('bottom-panel').classList.toggle('hidden');
    visible = !visible;
  }

  function toggle() {
    if (visible) hide(); else show();
  }

  async function newTerminal() {
    if (terminal) terminal.clear();
    if (window.silva) {
      const cwd = window.FileTreeManager?.getRootPath() || null;
      currentCwd = cwd;
      const r = await window.silva.terminal.create(cwd);
      backendReady = !!r?.success;
    }
    show();
  }

  function quotePath(p) {
    return `"${String(p || '').replace(/`/g, '``').replace(/"/g, '""')}"`;
  }

  function syncTerminalCwd(path) {
    if (!path || !window.silva || !initialized || !backendReady) return;
    if (path === currentCwd) return;
    currentCwd = path;
    // Keep shell session alive but move it to current project automatically.
    const cmd = `Set-Location -LiteralPath ${quotePath(path)}\r`;
    try { window.silva.terminal.write(cmd); } catch {}
    try { terminal?.writeln(`\x1b[90m[cwd → ${path}]\x1b[0m`); } catch {}
  }

  function clearTerminal() {
    terminal?.clear();
  }

  async function run(command) {
    show();
    if (terminal && window.silva) {
      if (!backendReady) {
        const cwd = window.FileTreeManager?.getRootPath() || null;
        const r = await window.silva.terminal.create(cwd);
        backendReady = !!r?.success;
        if (!backendReady) {
          terminal.writeln('\x1b[31m[terminal unavailable] Start failed.\x1b[0m');
          return false;
        }
      }
      setTimeout(async () => {
        const w = await window.silva.terminal.write(command + '\r');
        if (!w?.success) terminal?.writeln(`\x1b[31m[write failed] ${w?.error || 'no terminal session'}\x1b[0m`);
      }, 200);
      return true;
    }
    return false;
  }

  window.addEventListener('resize', fitTerminal);

  return { init, show, hide, toggle, newTerminal, clearTerminal, run };
})();
