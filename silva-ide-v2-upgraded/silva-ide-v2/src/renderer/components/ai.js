'use strict';
window.AIManager = (() => {
  let isOpen = false;
  let isStreaming = false;
  const messages = [];

  // Dual provider state
  let provider1 = { id: 'anthropic', model: 'claude-sonnet-4-6', key: '', status: 'unchecked' };
  let provider2 = { id: 'groq', model: 'llama-3.3-70b-versatile', key: '', status: 'unchecked' };
  let activeProvider = 1;

  // Task timeline
  const tasks = { past: [], present: null, future: [] };
  const activity = [];
  let predictionTimer = null;

  // Local AI endpoints
  const LOCAL_ENDPOINTS = [
    { id: 'ollama',     name: 'Ollama',      url: 'http://127.0.0.1:11434', healthPath: '/api/tags',          apiPath: '/api/chat',          style: 'ollama'   },
    { id: 'ollama2',    name: 'Ollama (LH)', url: 'http://localhost:11434', healthPath: '/api/tags',          apiPath: '/api/chat',          style: 'ollama'   },
    { id: 'lmstudio',  name: 'LM Studio',   url: 'http://127.0.0.1:1234',  healthPath: '/v1/models',         apiPath: '/v1/chat/completions', style: 'openai'   },
    { id: 'lmnet',     name: 'LM Studio(N)',url: 'http://192.168.0.204:1234',healthPath: '/v1/models',         apiPath: '/v1/chat/completions', style: 'openai'   },
    { id: 'openjarvis',name: 'OpenJarvis',  url: 'http://127.0.0.1:5000',  healthPath: '/v1/models',         apiPath: '/v1/chat/completions', style: 'openai'   },
    { id: 'turboquant',name: 'TurboQuant',  url: 'http://127.0.0.1:5002',  healthPath: '/v1/models',         apiPath: '/v1/chat/completions', style: 'openai'   },
    { id: 'jan',       name: 'Jan',         url: 'http://127.0.0.1:1337',  healthPath: '/v1/models',         apiPath: '/v1/chat/completions', style: 'openai'   },
    { id: 'jan2',      name: 'Jan (3928)',  url: 'http://127.0.0.1:3928',  healthPath: '/v1/models',         apiPath: '/v1/chat/completions', style: 'openai'   },
    { id: 'llamacpp',  name: 'llama.cpp',   url: 'http://127.0.0.1:8080',  healthPath: '/health',            apiPath: '/v1/chat/completions', style: 'openai'   },
    { id: 'localai',   name: 'LocalAI',     url: 'http://127.0.0.1:8081',  healthPath: '/v1/models',         apiPath: '/v1/chat/completions', style: 'openai'   },
  ];

  const PROVIDERS = {
    anthropic:  { name: 'Anthropic Claude', type: 'cloud', keyHint: 'sk-ant-...',   freeTier: false },
    openai:     { name: 'OpenAI GPT',        type: 'cloud', keyHint: 'sk-...',       freeTier: false },
    google:     { name: 'Google Gemini',     type: 'cloud', keyHint: 'AIza...',      freeTier: true,  freeUrl: 'aistudio.google.com' },
    groq:       { name: 'Groq (Free)',        type: 'cloud', keyHint: 'gsk_...',      freeTier: true,  freeUrl: 'console.groq.com' },
    together:   { name: 'Together AI',       type: 'cloud', keyHint: 'your-key',     freeTier: true,  freeUrl: 'api.together.xyz' },
    ollama:     { name: 'Ollama',            type: 'local', freeTier: true },
    ollama2:    { name: 'Ollama (LH)',       type: 'local', freeTier: true },
    lmstudio:   { name: 'LM Studio',         type: 'local', freeTier: true },
    lmnet:      { name: 'LM Studio(N)',      type: 'local', freeTier: true },
    openjarvis: { name: 'OpenJarvis',        type: 'local', freeTier: true },
    turboquant: { name: 'TurboQuant',        type: 'local', freeTier: true },
    jan:        { name: 'Jan',               type: 'local', freeTier: true },
    jan2:       { name: 'Jan (3928)',        type: 'local', freeTier: true },
    llamacpp:   { name: 'llama.cpp',         type: 'local', freeTier: true },
    localai:    { name: 'LocalAI',           type: 'local', freeTier: true },
  };

  const MODELS = {
    anthropic:  [['claude-3-5-sonnet-latest','Claude 3.5 Sonnet'],['claude-3-opus-latest','Claude 3 Opus'],['claude-3-haiku-20240307','Claude 3 Haiku']],
    openai:     [['gpt-4o','GPT-4o'],['gpt-4o-mini','GPT-4o Mini'],['gpt-4-turbo','GPT-4 Turbo']],
    google:     [['gemini-2.0-flash-exp','Gemini 2.0 Flash'],['gemini-1.5-pro','Gemini 1.5 Pro']],
    groq:       [['llama-3.3-70b-versatile','Llama 3.3 70B'],['deepseek-r1-distill-llama-70b','DeepSeek R1 70B']],
    ollama:     [['llama3.2','Llama 3.2'],['codellama','Code Llama'],['deepseek-coder','DeepSeek Coder']],
    ollama2:    [['auto','Auto-detect']],
    lmstudio:   [['auto','Auto-detect']],
    lmnet:      [['auto','Auto-detect']],
    openjarvis: [['auto','Auto-detect']],
    turboquant: [['auto','Auto-detect']],
    jan:        [['auto','Auto-detect']],
    jan2:       [['auto','Auto-detect']],
    localai:    [['auto','Auto-detect']],
  };

  const PREFERRED_MODELS = {
    lmstudio: 'qwen3.6',
    jan: 'gemma-4',
    ollama: 'llama3.2'
  };

  let detectedLocal = {};
  const stability = {
    localConcurrency: 2,        // allow both slots to run concurrently
    cloudConcurrency: 2,
    streamStallMs: 30000,
    requestTimeoutMs: 120000,
    localRequestTimeoutMs: 90000, // give local models plenty of time
    fallbackTimeoutMs: 15000,
    localHealthFreshMs: 20000,
    maxFallbacks: 4,
    watchdogPollMs: 5000,       // check every 5s
    retryCount: 0,              // no retries — fail fast and fallback
    retryBackoffMs: 400,
  };
  const limiterByProvider = new Map();
  const providerHealth = {};
  let watchdogTimer = null;
  const resolvedLocalModelCache = {};
  const projectCtxState = { root: '', summary: '', keyFiles: [], builtAt: 0 };
  let aiWebResearchEnabled = false;
  let lastProjectIntent = false;
  let capabilities = { turboQuant: true, turboVec: true, piper: true };
  let perfMode = 'fast'; // fast | balanced | quality
  let historySaveTimer = null;
  let isRestoringHistory = false;
  let autoActionRequested = true;
  const pendingInserts = [];
  const actionLog = [];

  function logAction(kind, target, ok, detail = '', payload = null) {
    actionLog.unshift({
      at: Date.now(),
      kind: String(kind || 'action'),
      target: String(target || ''),
      ok: !!ok,
      detail: String(detail || ''),
      payload: payload === null || typeof payload === 'undefined' ? null : String(payload),
    });
    if (actionLog.length > 80) actionLog.pop();
    renderActionLog();
  }

  function renderActionLog() {
    const el = document.getElementById('ai-action-log');
    if (!el) return;
    if (!actionLog.length) {
      el.innerHTML = '<div class="tl-empty">No executed actions yet</div>';
      return;
    }
    const rows = actionLog.slice(0, 20).map((x) => {
      const t = new Date(x.at).toLocaleTimeString();
      const status = x.ok ? 'OK' : 'FAIL';
      const color = x.ok ? 'var(--green)' : 'var(--red)';
      const target = esc(x.target || '(none)');
      const detail = x.detail ? ` · ${esc(x.detail)}` : '';
      return `<div style="font-size:11px;color:var(--subtext1);padding:4px 0;border-bottom:1px dashed var(--surface1)">
        <span style="color:var(--overlay0)">[${t}]</span>
        <span style="color:${color};font-weight:700;margin-left:6px">${status}</span>
        <span style="margin-left:6px">${esc(x.kind)}:</span>
        <span style="margin-left:4px">${target}</span>
        <span style="color:var(--overlay0)">${detail}</span>
      </div>`;
    });
    el.innerHTML = rows.join('');
  }

  function flushPendingInserts() {
    try {
      if (!pendingInserts.length) return;
      if (!window.EditorManager || typeof window.EditorManager.insertText !== 'function') return;
      if (!window.EditorManager.getActiveTab?.()) window.EditorManager.newFile?.();
      const batch = pendingInserts.splice(0, pendingInserts.length);
      setTimeout(() => {
        for (const t of batch) {
          try { window.EditorManager.insertText(String(t || '')); } catch {}
        }
        window.notify?.(`Inserted (${batch.length})`, 'success');
      }, 60);
    } catch {}
  }

  document.addEventListener('monaco-ready', () => {
    flushPendingInserts();
  });

  function normalizeWinPath(p) {
    const raw = String(p || '').trim().replace(/\//g, '\\');
    const driveMatch = raw.match(/^([A-Za-z]:)\\?/);
    const drive = driveMatch ? driveMatch[1].toUpperCase() : '';
    const rest = drive ? raw.slice(driveMatch[0].length) : raw.replace(/^\\+/, '');
    const parts = rest.split('\\').filter(Boolean);
    const out = [];
    for (const part of parts) {
      if (part === '.' || part === '') continue;
      if (part === '..') { if (out.length) out.pop(); continue; }
      out.push(part);
    }
    return drive ? `${drive}\\${out.join('\\')}` : out.join('\\');
  }

  function resolvePathWithinRoot(root, inputPath) {
    const r = normalizeWinPath(root);
    const p = String(inputPath || '').trim();
    if (!p) return null;
    const isAbs = /^[A-Za-z]:[\\/]/.test(p);
    const abs = isAbs
      ? normalizeWinPath(p)
      : normalizeWinPath(`${r.replace(/[\\]+$/g, '')}\\${p.replace(/^[/\\]+/g, '')}`);
    const rr = r.replace(/[\\]+$/g, '') + '\\';
    if (abs.toUpperCase().startsWith(rr.toUpperCase())) return abs;
    return null;
  }

  function parsePatchText(patchText) {
    const text = String(patchText || '').replace(/\r\n/g, '\n');
    const lines = text.split('\n');
    const first = (lines[0] || '').trim();
    const last = (lines[lines.length - 1] || '').trim();
    if (first !== '*** Begin Patch' || last !== '*** End Patch') {
      return { ok: false, error: 'Patch must start with "*** Begin Patch" and end with "*** End Patch".', ops: [] };
    }

    const ops = [];
    let i = 1;
    const readPath = (line, prefix) => String(line.slice(prefix.length)).trim();
    while (i < lines.length - 1) {
      const line = lines[i];
      if (!line || !line.trim()) { i += 1; continue; }
      if (line.startsWith('*** Add File: ')) {
        const file = readPath(line, '*** Add File: ');
        i += 1;
        const content = [];
        while (i < lines.length - 1) {
          const l = lines[i];
          if (l.startsWith('*** ')) break;
          if (l.startsWith('+')) content.push(l.slice(1));
          else return { ok: false, error: `Invalid add-file line (must start with '+'): "${l}"`, ops: [] };
          i += 1;
        }
        ops.push({ type: 'add', file, content: content.join('\n') });
        continue;
      }
      if (line.startsWith('*** Update File: ')) {
        const file = readPath(line, '*** Update File: ');
        i += 1;
        const hunkLines = [];
        while (i < lines.length - 1) {
          const l = lines[i];
          if (l.startsWith('*** ')) break;
          if (l === '*** End of File') { i += 1; continue; }
          hunkLines.push(l);
          i += 1;
        }
        ops.push({ type: 'update', file, hunkLines });
        continue;
      }
      return { ok: false, error: `Unknown patch directive: "${line}"`, ops: [] };
    }

    return { ok: true, ops };
  }

  function parseFileBlockText(codeText) {
    const lines = String(codeText || '').split(/\r?\n/);
    const head = (lines[0] || '').trim();
    const m = head.match(/^(?:\/\/|#)?\s*FILE\s*:\s*(.+)\s*$/i);
    if (!m) return null;
    const p = String(m[1] || '').trim().replace(/^"+|"+$/g, '');
    if (!p) return null;
    return { path: p, content: lines.slice(1).join('\n') };
  }

  function extractFencedCodeBlocks(text) {
    const out = [];
    const src = String(text || '');
    const re = /```([^\n`]*)\n([\s\S]*?)```/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      out.push({ lang: String(m[1] || '').trim(), code: String(m[2] || '') });
    }
    return out;
  }

  function extractLooseFileBlocks(text) {
    const src = String(text || '').replace(/\r\n/g, '\n');
    const lines = src.split('\n');
    const out = [];
    let cur = null;
    for (const line of lines) {
      const m = String(line || '').match(/^(?:\/\/|#)?\s*FILE\s*:\s*(.+)\s*$/i);
      if (m) {
        if (cur) out.push(cur);
        cur = { path: String(m[1] || '').trim().replace(/^"+|"+$/g, ''), contentLines: [] };
        continue;
      }
      if (cur) cur.contentLines.push(line);
    }
    if (cur) out.push(cur);
    return out
      .map(x => ({ path: x.path, content: (x.contentLines || []).join('\n') }))
      .filter(x => x.path);
  }

  function extractLoosePatchBlocks(text) {
    const src = String(text || '');
    const out = [];
    const re = /(\*\*\*\s*Begin Patch[\s\S]*?\*\*\*\s*End Patch)/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      out.push(String(m[1] || '').trim());
    }
    return out;
  }

  function extractLooseCommandLines(text) {
    const src = String(text || '').replace(/\r\n/g, '\n');
    const lines = src.split('\n');
    const out = [];
    for (const line of lines) {
      const t = String(line || '').trim();
      if (!t) continue;
      if (/^[-*•]\s+/.test(t)) {
        const inner = t.replace(/^[-*•]\s+/, '').trim();
        if (isSingleLineCommandText(inner)) out.push(inner);
        continue;
      }
      if (isSingleLineCommandText(t)) out.push(t);
    }
    return [...new Set(out)];
  }

  function isSingleLineCommandText(code) {
    const s = String(code || '').trim();
    if (!s || s.includes('\n') || s.length > 280) return false;
    return /^(npm|pnpm|yarn|bun|node|python|py|pip|git|cargo|go|dotnet|java|mvn|gradle|rustc|powershell|pwsh)\b/i.test(s) || /^\.\\/.test(s);
  }

  function shouldAutoExecuteActions(userText) {
    const t = String(userText || '').toLowerCase();
    if (!t) return false;
    if (/\b(don't run|do not run|no run|dry run|preview only)\b/.test(t)) return false;
    return /\b(run|execute|apply|fix|patch|write|create|do all|yes all|implement|launch|start)\b/.test(t);
  }

  async function autoExecuteActionBlocks(msgEl, responseText) {
    if (!autoActionRequested) return;
    const root = window.FileTreeManager?.getRootPath?.() || '';
    const writes = [];
    const patches = [];
    const commands = [];

    const blocks = extractFencedCodeBlocks(responseText);
    for (const b of blocks) {
      const code = String(b.code || '').trim();
      if (!code) continue;
      if (/^\*\*\*\s*Begin Patch\b/m.test(code)) {
        patches.push(code);
        continue;
      }
      const fb = parseFileBlockText(code);
      if (fb) {
        writes.push(fb);
        continue;
      }
      if (isSingleLineCommandText(code)) {
        commands.push(code.trim());
      }
    }

    if (writes.length === 0) {
      for (const fb of extractLooseFileBlocks(responseText)) writes.push(fb);
    }
    if (patches.length === 0) {
      for (const p of extractLoosePatchBlocks(responseText)) patches.push(p);
    }
    if (commands.length === 0) {
      for (const c of extractLooseCommandLines(responseText)) commands.push(c);
    }

    if (!writes.length && !patches.length && !commands.length) return;
    appendThinkLine(msgEl, `Executor: auto actions detected (files=${writes.length}, patches=${patches.length}, commands=${commands.length})`);

    let okCount = 0;
    let failCount = 0;

    for (const w of writes) {
      try {
        if (!root) throw new Error('Open a project folder first.');
        const abs = resolvePathWithinRoot(root, w.path);
        if (!abs) throw new Error(`Path outside project root: ${w.path}`);
        const r = await toolProtocol.write_file({ path: abs, content: w.content || '' });
        if (!r?.success) throw new Error(r?.error || 'Write failed');
        okCount += 1;
        appendThinkLine(msgEl, `Executor: wrote ${w.path}`);
        logAction('write_file', w.path, true);
      } catch (e) {
        failCount += 1;
        appendThinkLine(msgEl, `Executor: write failed for ${w.path} (${e?.message || e})`);
        logAction('write_file', w.path, false, e?.message || String(e));
      }
    }

    for (const p of patches) {
      try {
        const r = await toolProtocol.apply_patch({ patch: p });
        if (!r?.success) throw new Error(r?.error || 'Patch failed');
        okCount += 1;
        const names = (r.applied || []).map(x => x.file).filter(Boolean).join(', ');
        appendThinkLine(msgEl, `Executor: patch applied${names ? ` (${names})` : ''}`);
        logAction('apply_patch', names || 'patch', true);
      } catch (e) {
        failCount += 1;
        appendThinkLine(msgEl, `Executor: patch failed (${e?.message || e})`);
        logAction('apply_patch', 'patch', false, e?.message || String(e));
      }
    }

    for (const c of commands) {
      try {
        const r = await toolProtocol.run_command({ command: c, cwd: root || undefined });
        if (!r?.success) throw new Error(r?.error || 'Command failed');
        okCount += 1;
        appendThinkLine(msgEl, `Executor: command queued (${c})`);
        logAction('run_command', c, true, '', c);
      } catch (e) {
        failCount += 1;
        appendThinkLine(msgEl, `Executor: command failed (${c}) (${e?.message || e})`);
        logAction('run_command', c, false, e?.message || String(e), c);
      }
    }

    if (okCount > 0) window.notify?.(`Auto actions done: ${okCount} success${failCount ? `, ${failCount} failed` : ''}`, failCount ? 'warning' : 'success');
    else if (failCount > 0) window.notify?.(`Auto actions failed: ${failCount}`, 'error');
  }

  async function autoExecuteActionTextsNoThink(texts) {
    if (!autoActionRequested) return;
    const root = window.FileTreeManager?.getRootPath?.() || '';
    const writesByPath = new Map();
    const patches = new Set();
    const commands = new Set();

    const arr = Array.isArray(texts) ? texts : [texts];
    for (const t of arr) {
      const responseText = String(t || '');
      for (const b of extractFencedCodeBlocks(responseText)) {
        const code = String(b.code || '').trim();
        if (!code) continue;
        if (/^\\*\\*\\*\\s*Begin Patch\\b/m.test(code)) { patches.add(code); continue; }
        const fb = parseFileBlockText(code);
        if (fb) { writesByPath.set(fb.path, fb); continue; }
        if (isSingleLineCommandText(code)) commands.add(code.trim());
      }
      for (const fb of extractLooseFileBlocks(responseText)) writesByPath.set(fb.path, fb);
      for (const p of extractLoosePatchBlocks(responseText)) patches.add(p);
      for (const c of extractLooseCommandLines(responseText)) commands.add(c);
    }

    const writes = [...writesByPath.values()].filter(Boolean);
    const patchList = [...patches.values()];
    const cmdList = [...commands.values()];
    if (!writes.length && !patchList.length && !cmdList.length) return;

    let okCount = 0;
    let failCount = 0;

    for (const w of writes) {
      try {
        if (!root) throw new Error('Open a project folder first.');
        const abs = resolvePathWithinRoot(root, w.path);
        if (!abs) throw new Error(`Path outside project root: ${w.path}`);
        const r = await toolProtocol.write_file({ path: abs, content: w.content || '' });
        if (!r?.success) throw new Error(r?.error || 'Write failed');
        okCount += 1;
        logAction('write_file', w.path, true);
      } catch {
        failCount += 1;
        logAction('write_file', w.path, false);
      }
    }

    for (const p of patchList) {
      try {
        const r = await toolProtocol.apply_patch({ patch: p });
        if (!r?.success) throw new Error(r?.error || 'Patch failed');
        okCount += 1;
        const names = (r.applied || []).map(x => x.file).filter(Boolean).join(', ');
        logAction('apply_patch', names || 'patch', true);
      } catch {
        failCount += 1;
        logAction('apply_patch', 'patch', false);
      }
    }

    for (const c of cmdList) {
      try {
        const r = await toolProtocol.run_command({ command: c, cwd: root || undefined });
        if (!r?.success) throw new Error(r?.error || 'Command failed');
        okCount += 1;
        logAction('run_command', c, true, '', c);
      } catch {
        failCount += 1;
        logAction('run_command', c, false, '', c);
      }
    }

    if (okCount > 0) window.notify?.(`Auto actions done: ${okCount} success${failCount ? `, ${failCount} failed` : ''}`, failCount ? 'warning' : 'success');
    else if (failCount > 0) window.notify?.(`Auto actions failed: ${failCount}`, 'error');
  }

  function applyUnifiedHunksToText(originalText, hunkLines) {
    const eol = originalText.includes('\r\n') ? '\r\n' : '\n';
    const fileLines = originalText.replace(/\r\n/g, '\n').split('\n');
    const hunks = [];
    let cur = [];
    for (const l of hunkLines || []) {
      if (l.startsWith('@@')) {
        if (cur.length) hunks.push(cur);
        cur = [];
      } else {
        cur.push(l);
      }
    }
    if (cur.length) hunks.push(cur);

    let cursor = 0;
    for (const hunk of hunks) {
      const pattern = [];
      const replacement = [];
      for (const raw of hunk) {
        if (!raw) {
          return { ok: false, error: 'Invalid hunk line: empty line without prefix.' };
        }
        const tag = raw[0];
        const text = raw.slice(1);
        if (tag === ' ' || tag === '-') pattern.push(text);
        if (tag === ' ' || tag === '+') replacement.push(text);
        if (tag !== ' ' && tag !== '-' && tag !== '+') {
          return { ok: false, error: `Invalid hunk line prefix "${tag}" in "${raw}"` };
        }
      }

      const findFrom = (startAt) => {
        for (let start = startAt; start <= fileLines.length - pattern.length; start++) {
          let ok = true;
          for (let j = 0; j < pattern.length; j++) {
            if (fileLines[start + j] !== pattern[j]) { ok = false; break; }
          }
          if (ok) return start;
        }
        return -1;
      };

      let at = findFrom(cursor);
      if (at === -1 && cursor !== 0) at = findFrom(0);
      if (at === -1) {
        const preview = pattern.slice(0, 6).join('\\n');
        return { ok: false, error: `Cannot locate hunk context in file. Pattern preview:\\n${preview}` };
      }
      fileLines.splice(at, pattern.length, ...replacement);
      cursor = at + replacement.length;
    }

    return { ok: true, text: fileLines.join(eol) };
  }

  async function enforceGateAction(action, context = {}) {
    if (!window.silva?.gate?.enforce) return { allowed: true };
    try {
      const res = await window.silva.gate.enforce(action, 'jarvice', context || {});
      if (res?.allowed) return { allowed: true, gate: res };
      if (res?.needsApproval) {
        const msg = `Approval required for ${res?.action || action}. gateId=${res?.gateId || 'unknown'}`;
        return { allowed: false, error: msg, gate: res };
      }
      return { allowed: false, error: res?.reason || `Blocked by gate: ${action}`, gate: res };
    } catch (e) {
      return { allowed: false, error: `Gate error: ${e?.message || e}`, gate: null };
    }
  }

  const toolProtocol = {
    list_files: async ({ root, depth = 2 }) => {
      const projectRoot = root || window.FileTreeManager?.getRootPath?.();
      const tree = window.FileTreeManager?.getTree?.() || [];
      const out = [];
      const walk = (nodes, d) => {
        if (!nodes) return;
        for (const n of nodes) {
          out.push({ path: n.path, name: n.name, type: n.type, depth: d });
          if (n.type === 'directory' && d < depth) walk(n.children || [], d + 1);
        }
      };
      walk(tree, 0);
      return { root: projectRoot || '', files: out };
    },
    read_file: async ({ path }) => {
      if (!window.silva?.fs?.readFile) return { success: false, error: 'fs.readFile unavailable' };
      const r = await window.silva.fs.readFile(path);
      return { success: !!r?.success, path, content: r?.content || '', error: r?.error || '' };
    },
    write_file: async ({ path, content }) => {
      if (!window.silva?.fs?.writeFile) return { success: false, error: 'fs.writeFile unavailable' };
      const gate = await enforceGateAction('CODE_WRITE', { path: String(path || ''), bytes: String(content || '').length, source: 'ai.toolProtocol.write_file' });
      if (!gate.allowed) return { success: false, error: gate.error || 'Blocked by policy' };
      const r = await window.silva.fs.writeFile(path, content);
      return { success: !!r?.success, path, error: r?.error || '' };
    },
    search_in_project: async ({ root, query, regex = false }) => {
      if (!window.silva?.fs?.search) return { success: false, error: 'fs.search unavailable' };
      const projectRoot = root || window.FileTreeManager?.getRootPath?.();
      const r = await window.silva.fs.search(projectRoot, query, { caseSensitive: false, useRegex: !!regex, wholeWord: false });
      return { success: !!r?.success, results: r?.results || [], error: r?.error || '' };
    },
    run_command: async ({ command, cwd }) => {
      if (!command) return { success: false, error: 'Empty command' };
      if (!window.TerminalManager) return { success: false, error: 'Terminal manager unavailable' };
      const gate = await enforceGateAction('SHELL_EXEC', { command: String(command), cwd: String(cwd || ''), source: 'ai.toolProtocol.run_command' });
      if (!gate.allowed) return { success: false, error: gate.error || 'Blocked by policy' };
      const finalCommand = cwd
        ? `Set-Location -LiteralPath "${String(cwd).replace(/"/g, '""')}"; ${String(command)}`
        : String(command);
      const started = await window.TerminalManager.run(finalCommand);
      if (!started) return { success: false, error: 'Terminal backend is not ready' };
      return { success: true, queued: true };
    },
    web_search: async ({ query }) => {
      const q = (query || '').trim();
      if (!q) return { success: false, error: 'Empty query', results: [] };
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_redirect=1&no_html=1&t=silva-ide`;
      const res = await window.silva?.ai?.proxyRequest?.({ url });
      if (!res?.success || !res?.data) return { success: false, error: res?.error || 'Search failed', results: [] };
      const data = res.data;
      const results = [];
      if (data.Heading || data.AbstractText) {
        results.push({ title: data.Heading || q, snippet: data.AbstractText || '', url: data.AbstractURL || '' });
      }
      const rel = Array.isArray(data.RelatedTopics) ? data.RelatedTopics : [];
      for (const t of rel) {
        if (results.length >= 6) break;
        if (t && t.Text) results.push({ title: (t.Text || '').split(' - ')[0], snippet: t.Text || '', url: t.FirstURL || '' });
        if (Array.isArray(t.Topics)) {
          for (const u of t.Topics) {
            if (results.length >= 6) break;
            if (u && u.Text) results.push({ title: (u.Text || '').split(' - ')[0], snippet: u.Text || '', url: u.FirstURL || '' });
          }
        }
      }
      return { success: true, query: q, results };
    },
    apply_patch: async ({ patch }) => {
      try {
        if (!window.silva?.fs?.readFile || !window.silva?.fs?.writeFile) {
          return { success: false, error: 'fs.readFile/writeFile unavailable' };
        }
        const root = window.FileTreeManager?.getRootPath?.() || '';
        if (!root) return { success: false, error: 'Open a project folder first.' };

        const parsed = parsePatchText(patch);
        if (!parsed.ok) return { success: false, error: parsed.error || 'Invalid patch' };
        const filesList = (parsed.ops || []).map(op => op.file).filter(Boolean).slice(0, 20);
        const gate = await enforceGateAction('CODE_WRITE', { files: filesList, opCount: (parsed.ops || []).length, source: 'ai.toolProtocol.apply_patch' });
        if (!gate.allowed) return { success: false, error: gate.error || 'Blocked by policy' };

        const applied = [];
        for (const op of parsed.ops) {
          const abs = resolvePathWithinRoot(root, op.file);
          if (!abs) return { success: false, error: `Refusing to write outside project root: ${op.file}` };

          if (op.type === 'add') {
            const wr = await window.silva.fs.writeFile(abs, String(op.content || ''));
            if (!wr?.success) return { success: false, error: wr?.error || `Write failed: ${op.file}` };
            applied.push({ type: 'add', file: op.file, abs });
          } else if (op.type === 'update') {
            const rr = await window.silva.fs.readFile(abs);
            if (!rr?.success) return { success: false, error: rr?.error || `Read failed: ${op.file}` };
            const out = applyUnifiedHunksToText(String(rr.content || ''), op.hunkLines || []);
            if (!out.ok) return { success: false, error: out.error || `Patch failed: ${op.file}` };
            const wr = await window.silva.fs.writeFile(abs, out.text);
            if (!wr?.success) return { success: false, error: wr?.error || `Write failed: ${op.file}` };
            applied.push({ type: 'update', file: op.file, abs });
          } else {
            return { success: false, error: `Unknown op: ${op.type}` };
          }
        }
        return { success: true, applied };
      } catch (e) {
        return { success: false, error: e?.message || String(e) };
      }
    },
  };

  function updateAiHeaderToggles() {
    const btn = document.getElementById('btn-toggle-ai-research');
    if (btn) btn.style.color = aiWebResearchEnabled ? 'var(--accent)' : '';
    const autoBtn = document.getElementById('btn-toggle-auto-actions');
    if (autoBtn) autoBtn.style.color = autoActionRequested ? 'var(--green)' : '';
    const cap = document.getElementById('cap-web');
    if (cap) cap.textContent = `Web Research: ${aiWebResearchEnabled ? 'ON' : 'OFF'}`;
    const autoCap = document.getElementById('cap-autoexec');
    if (autoCap) autoCap.textContent = `Auto Execute: ${autoActionRequested ? 'ON' : 'OFF'}`;
  }

  function updateCapabilitiesUI() {
    const tq = document.getElementById('cap-turboquant');
    const tv = document.getElementById('cap-turbovec');
    const piper = document.getElementById('cap-piper');
    const perf = document.getElementById('cap-perf');
    if (tq) tq.textContent = `TurboQuant: ${capabilities.turboQuant ? 'ON' : 'OFF'}`;
    if (tv) tv.textContent = `TurboVec: ${capabilities.turboVec ? 'ON' : 'OFF'}`;
    if (piper) piper.textContent = `Piper TTS: ${capabilities.piper ? 'ON' : 'OFF'}`;
    if (perf) perf.textContent = `Speed: ${String(perfMode || 'fast').toUpperCase()}`;
  }

  function getMaxTokensFor(pid) {
    const isLocal = PROVIDERS[pid]?.type === 'local';
    if (!isLocal) return 4096;
    if (perfMode === 'fast') return 1024;
    if (perfMode === 'balanced') return 2048;
    return 4096;
  }

  function getContextLimit() {
    if (perfMode === 'fast') return 2600;
    if (perfMode === 'balanced') return 4500;
    return 6000;
  }

  function getKeyFileClipLimit() {
    if (perfMode === 'fast') return 650;
    if (perfMode === 'balanced') return 1000;
    return 1400;
  }

  function getTreeDepthForContext() {
    if (perfMode === 'fast') return 1;
    return 2;
  }

  function thinkVerbosity() {
    if (perfMode === 'fast') return 'minimal';
    if (perfMode === 'balanced') return 'normal';
    return 'verbose';
  }

  async function proxyJson({ url, method, headers, body, timeoutMs }) {
    if (!window.silva?.ai?.proxyRequest) throw new Error('AI proxy unavailable');
    const started = Date.now();
    const res = await withTimeout(window.silva.ai.proxyRequest({ url, method, headers, body }), timeoutMs || stability.requestTimeoutMs);
    if (!res?.success) {
      const msg = typeof res?.data === 'string' ? res.data : (res?.data?.error?.message || res?.error || `HTTP ${res?.status || ''}`.trim() || 'Request failed');
      const e = new Error(msg);
      e.status = res?.status;
      e.latencyMs = Date.now() - started;
      throw e;
    }
    return { data: res.data, status: res.status, latencyMs: Date.now() - started };
  }

  async function* proxyStreamLines({ url, method, headers, body }) {
    if (!window.silva?.ai?.proxyStream) throw new Error('AI proxy unavailable');
    let resolvePromise;
    let promise = new Promise((res) => { resolvePromise = res; });
    let isDone = false;
    let streamError = null;
    let buffer = '';

    const handle = window.silva.ai.proxyStream(
      { url, method: method || 'POST', headers, body },
      (chunk) => { buffer += chunk; resolvePromise(); promise = new Promise((res) => { resolvePromise = res; }); },
      (err) => { streamError = new Error(err); isDone = true; resolvePromise(); },
      () => { isDone = true; resolvePromise(); }
    );

    const waitForDataOrStall = async () => {
      let t;
      try {
        await Promise.race([
          promise,
          new Promise((_, reject) => { t = setTimeout(() => reject(new Error('Stream stalled')), stability.streamStallMs); })
        ]);
      } finally {
        clearTimeout(t);
      }
    };

    try {
      while (!isDone || buffer.length > 0) {
        await waitForDataOrStall();
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) yield trimmed;
        }
      }
      if (buffer.trim()) yield buffer.trim();
      if (streamError) throw streamError;
    } catch (e) {
      handle?.cancel?.();
      throw e;
    }
  }

  function createLimiter(maxConcurrent) {
    let active = 0;
    const queue = [];
    const pump = () => {
      while (active < maxConcurrent && queue.length > 0) {
        const job = queue.shift();
        active += 1;
        Promise.resolve()
          .then(job.fn)
          .then(
            (result) => { active -= 1; job.resolve(result); pump(); },
            (err) => { active -= 1; job.reject(err); pump(); }
          );
      }
    };
    return {
      run: (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); pump(); }),
      stats: () => ({ active, queued: queue.length, max: maxConcurrent }),
    };
  }

  function getLimiter(pid) {
    if (!limiterByProvider.has(pid)) {
      const max = PROVIDERS[pid]?.type === 'local' ? stability.localConcurrency : stability.cloudConcurrency;
      limiterByProvider.set(pid, createLimiter(max));
    }
    return limiterByProvider.get(pid);
  }

  function markHealth(pid, ok, meta = {}) {
    providerHealth[pid] = providerHealth[pid] || { ok: null, fails: 0, lastOkAt: 0, lastFailAt: 0, lastCheckAt: 0, latencyMs: 0, reason: '' };
    const h = providerHealth[pid];
    h.lastCheckAt = Date.now();
    if (ok) {
      h.ok = true;
      h.fails = 0;
      h.lastOkAt = Date.now();
      if (meta.latencyMs) h.latencyMs = meta.latencyMs;
      h.reason = '';
    } else {
      h.ok = false;
      h.fails += 1;
      h.lastFailAt = Date.now();
      h.reason = meta.reason || h.reason || 'unreachable';
    }
  }

  function isHealthy(pid) {
    const h = providerHealth[pid];
    if (!h) return true;
    if (h.ok === false && h.fails >= 2) return false;
    return true;
  }

  function isUsable(pid) {
    const p = PROVIDERS[pid];
    if (!p) return false;
    if (p.type !== 'local') return true;
    if (detectedLocal[pid]) return true;
    const h = providerHealth[pid];
    if (!h || h.ok !== true) return false;
    if ((Date.now() - h.lastOkAt) > stability.localHealthFreshMs) return false;
    return true;
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function withTimeout(promise, ms) {
    let t;
    const timeout = new Promise((_, reject) => { t = setTimeout(() => reject(new Error('Timeout')), ms); });
    try { return await Promise.race([promise, timeout]); }
    finally { clearTimeout(t); }
  }

  async function resolveLocalModelId(pid, model) {
    if (model && model !== 'auto') return model;
    if (resolvedLocalModelCache[pid]) return resolvedLocalModelCache[pid];
    try {
      const list = await fetchLocalModels(pid);
      const first = list?.[0]?.id;
      if (first) {
        resolvedLocalModelCache[pid] = first;
        return first;
      }
    } catch {}
    return model;
  }

  async function healthCheckLocal(ep, timeoutMs) {
    const started = Date.now();
    try {
      const res = await withTimeout(window.silva.ai.proxyRequest({ url: ep.url + ep.healthPath }), timeoutMs || Math.min(6000, stability.requestTimeoutMs));
      const ok = !!res?.success;
      markHealth(ep.id, ok, { latencyMs: Date.now() - started, reason: ok ? '' : (res?.error || 'unreachable') });
      return ok;
    } catch (e) {
      markHealth(ep.id, false, { latencyMs: Date.now() - started, reason: e.message || 'unreachable' });
      return false;
    }
  }

  async function ensureLocalUp(pid) {
    if (PROVIDERS[pid]?.type !== 'local') return true;
    if (isUsable(pid)) return true;
    const ep = LOCAL_ENDPOINTS.find(e => e.id === pid);
    if (!ep) return false;
    const ok = await healthCheckLocal(ep, 1800);
    if (ok) detectedLocal[pid] = detectedLocal[pid] || { url: ep.url, name: ep.name, style: ep.style };
    return ok;
  }

  async function watchdogTick() {
    if (!window.silva?.ai?.proxyRequest) return;

    // Always scan ALL known local endpoints to keep both providers alive
    const eps = [...LOCAL_ENDPOINTS];
    await Promise.allSettled(eps.map(ep => healthCheckLocal(ep, 3000)));

    let changed = false;
    for (const ep of eps) {
      const wasDetected = !!detectedLocal[ep.id];
      if (isHealthy(ep.id)) {
        if (!wasDetected) {
          detectedLocal[ep.id] = { url: ep.url, name: ep.name, style: ep.style };
          changed = true;
        }
      } else {
        const h = providerHealth[ep.id];
        if (wasDetected && h && h.fails >= 3) {
          delete detectedLocal[ep.id];
          changed = true;
        }
      }
    }

    updateLocalMessages();
    if (changed) populateProviders();

    // Auto-reconnect any slot that came back online
    [1, 2].forEach(n => {
      const pid = document.getElementById(`p${n}-provider`)?.value;
      const dot = document.getElementById(`p${n}-dot`);
      const isErr = dot?.classList.contains('dot-error') || dot?.classList.contains('dot-unchecked');
      if (pid && detectedLocal[pid] && isErr) {
        connectSlot(n, true);
      }
    });
  }

  function startWatchdog() {
    if (watchdogTimer) return;
    watchdogTimer = setInterval(() => { watchdogTick(); }, stability.watchdogPollMs);
  }

  function stopWatchdog() {
    if (watchdogTimer) clearInterval(watchdogTimer);
    watchdogTimer = null;
  }

  // Returns true only for providers that run on localhost (not LAN/network IPs)
  function isLocalhost(pid) {
    const url = detectedLocal[pid]?.url || LOCAL_ENDPOINTS.find(e => e.id === pid)?.url || '';
    return url.includes('127.0.0.1') || url.includes('localhost');
  }

  function fallbackChain(primaryPid) {
    const chain = [];
    const add = (pid) => { if (pid && !chain.includes(pid)) chain.push(pid); };
    add(primaryPid);

    // Always prefer the two provider slots currently selected by the user
    [1, 2].forEach(n => {
      const pid = document.getElementById(`p${n}-provider`)?.value;
      if (pid) add(pid);
    });

    // Add only known-localhost fallbacks — never network/LAN addresses
    ['jan', 'lmstudio', 'ollama', 'llamacpp', 'localai'].forEach(add);

    // From detectedLocal, only include those that proved to be on localhost
    Object.keys(detectedLocal)
      .filter(isLocalhost)
      .forEach(add);

    return chain.filter(pid => isUsable(pid) && isHealthy(pid) && isLocalhost(pid)).slice(0, stability.maxFallbacks);
  }

  async function callProviderStable(pid, model, key, msgs, maxTok) {
    const chain = fallbackChain(pid);
    let lastErr = null;
    for (let i = 0; i < chain.length; i++) {
      const curPid = chain[i];
      try {
        await ensureLocalUp(curPid);
        const res = await getLimiter(curPid).run(async () => {
          const timeoutMs =
            PROVIDERS[curPid]?.type === 'local'
              ? (i === 0 ? stability.localRequestTimeoutMs : stability.fallbackTimeoutMs)
              : stability.requestTimeoutMs;
          const attempt = async () => withTimeout(callProvider(curPid, model, key, msgs, maxTok), timeoutMs);
          let out = null;
          for (let r = 0; r <= stability.retryCount; r++) {
            try { out = await attempt(); break; }
            catch (e) { lastErr = e; if (r < stability.retryCount) await sleep(stability.retryBackoffMs * (r + 1)); }
          }
          if (out === null) throw lastErr || new Error('No response');
          return out;
        });
        return { pid: curPid, text: res };
      } catch (e) {
        lastErr = e;
        markHealth(curPid, false, { reason: e.message || 'error' });
        if (i < chain.length - 1) {
          const nxt = chain[i + 1];
          sysMsg(`↪ Falling back to ${PROVIDERS[nxt]?.name || nxt}`);
          window.AutomationManager?.log?.(`AI fallback: ${curPid} -> ${nxt} (${e.message || 'error'})`);
        }
      }
    }
    throw lastErr || new Error('All providers failed');
  }

  // ─── Init ────────────────────────────────────────────────────────────
  function init() {
    renderPanel();
    restoreAiUiState();
    bindEvents();
    forceEnableAll();
    loadProviderSettings().then(() => {
      autoDetectLocalAI(true);
      startWatchdog();
      continueFromLast(false).catch(() => {});
    });
    if (window.silva) window.silva.on('menu:toggle-ai', toggle);
    if (window.silva) window.silva.on('folder:opened', ({ path }) => {
      if (path) setContext(path, `Project: ${String(path).split(/[/\\]/).pop()}`);
      continueFromLast(false).catch(() => {});
    });
    hookActivity();
    if (!predictionTimer) predictionTimer = setInterval(() => { try { renderPredictions(); } catch {} }, 6000);
    initChatResizer();
  }

  function forceEnableAll() {
    aiWebResearchEnabled = false;
    autoActionRequested = true;
    capabilities = { turboQuant: true, turboVec: true, piper: true };
    perfMode = 'fast';
    updateAiHeaderToggles();
    updateCapabilitiesUI();
    window.silva?.store?.set?.('ui.aiWebResearch', false);
    window.silva?.store?.set?.('ui.aiAutoExecute', true);
    window.silva?.store?.set?.('ai.capabilities', capabilities);
    window.silva?.store?.set?.('ai.perfMode', perfMode);
  }

  function restoreAiUiState() {
    const panel = document.getElementById('ai-panel');
    if (!panel) return;
    const store = window.silva?.store;
    if (!store) return;
    Promise.all([
      store.get('ui.aiControlsHidden', null),
      store.get('ui.aiSuggestionsHidden', null),
      store.get('ui.aiWebResearch', null),
      store.get('ui.aiAutoExecute', null),
      store.get('ai.capabilities', null),
      store.get('ai.perfMode', null),
    ]).then(([c, s, r, ae, cap, pm]) => {
      if (c === true) panel.classList.add('ai-controls-hidden');
      if (s === true) panel.classList.add('ai-suggestions-hidden');
      if (typeof r === 'boolean') aiWebResearchEnabled = r;
      if (typeof ae === 'boolean') autoActionRequested = ae;
      if (cap && typeof cap === 'object') {
        capabilities = {
          turboQuant: cap.turboQuant !== false,
          turboVec: !!cap.turboVec,
          piper: !!cap.piper,
        };
      }
      if (pm === 'fast' || pm === 'balanced' || pm === 'quality') perfMode = pm;
      updateAiHeaderToggles();
      updateCapabilitiesUI();
      window.silva?.store?.get?.('ui.aiActionLogOpen', false).then((open) => {
        const box = document.getElementById('ai-action-log-wrap');
        if (!box) return;
        if (open) box.classList.remove('hidden');
        else box.classList.add('hidden');
      }).catch(() => {});
    }).catch(() => {});
  }

  function toggleAiControls() {
    const panel = document.getElementById('ai-panel');
    if (!panel) return;
    panel.classList.toggle('ai-controls-hidden');
    window.silva?.store?.set('ui.aiControlsHidden', panel.classList.contains('ai-controls-hidden'));
  }

  function toggleAiSuggestions() {
    const panel = document.getElementById('ai-panel');
    if (!panel) return;
    panel.classList.toggle('ai-suggestions-hidden');
    window.silva?.store?.set('ui.aiSuggestionsHidden', panel.classList.contains('ai-suggestions-hidden'));
  }

  function toggleAiThinking() { return; }

  function toggleAiResearch() {
    aiWebResearchEnabled = !aiWebResearchEnabled;
    window.silva?.store?.set('ui.aiWebResearch', aiWebResearchEnabled);
    updateAiHeaderToggles();
    sysMsg(aiWebResearchEnabled ? '🌐 Web research enabled' : '🌐 Web research disabled');
  }

  function toggleAutoActions() {
    autoActionRequested = !autoActionRequested;
    window.silva?.store?.set('ui.aiAutoExecute', autoActionRequested);
    updateAiHeaderToggles();
    sysMsg(autoActionRequested ? '🤖 Auto actions enabled' : '🤖 Auto actions disabled');
  }

  function toggleActionLog() {
    const box = document.getElementById('ai-action-log-wrap');
    if (!box) return;
    box.classList.toggle('hidden');
    const open = !box.classList.contains('hidden');
    window.silva?.store?.set?.('ui.aiActionLogOpen', open);
    if (open) renderActionLog();
  }

  function clearActionLog() {
    actionLog.splice(0, actionLog.length);
    renderActionLog();
    window.notify?.('Actions log cleared', 'info');
  }

  async function retryFailedCommands() {
    const failed = actionLog
      .filter(x => x && x.ok === false && x.kind === 'run_command' && (x.payload || x.target))
      .slice(0, 5);
    if (!failed.length) { window.notify?.('No failed commands to retry', 'info'); return; }
    for (const it of failed) {
      const cmd = String(it.payload || it.target || '').trim();
      if (!cmd) continue;
      try {
        const r = await toolProtocol.run_command({ command: cmd, cwd: window.FileTreeManager?.getRootPath?.() || undefined });
        if (!r?.success) throw new Error(r?.error || 'Command failed');
        logAction('retry_command', cmd, true);
      } catch (e) {
        logAction('retry_command', cmd, false, e?.message || String(e));
      }
    }
    renderActionLog();
  }

  async function setCapability(key, value) {
    capabilities = { ...capabilities, [key]: !!value };
    updateCapabilitiesUI();
    await window.silva?.store?.set?.('ai.capabilities', capabilities);
  }

  async function cyclePerfMode() {
    perfMode = perfMode === 'fast' ? 'balanced' : perfMode === 'balanced' ? 'quality' : 'fast';
    updateCapabilitiesUI();
    await window.silva?.store?.set?.('ai.perfMode', perfMode);
    sysMsg(`⚡ Speed mode: ${perfMode.toUpperCase()}`);
  }

  function clearThinking() {
    return;
  }

  function appendThinking(title, text) {
    return;
  }

  async function initChatResizer() {
    const top = document.getElementById('ai-top');
    const rz = document.getElementById('resizer-ai-chat');
    if (!top || !rz) return;

    const store = window.silva?.store;
    const setVar = (k, v) => document.documentElement.style.setProperty(k, v);
    if (store) {
      const h = await store.get('ui.aiTopH', null);
      if (h) setVar('--ai-top-h', h);
    }

    let isResizing = false;
    rz.addEventListener('mousedown', () => { isResizing = true; document.body.style.cursor = 'row-resize'; });
    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      const rect = top.getBoundingClientRect();
      const maxH = Math.max(180, Math.min(820, window.innerHeight - 220));
      const newH = Math.max(80, Math.min(maxH, e.clientY - rect.top));
      setVar('--ai-top-h', newH + 'px');
    });
    document.addEventListener('mouseup', async () => {
      if (!isResizing) return;
      isResizing = false;
      document.body.style.cursor = '';
      if (store) await store.set('ui.aiTopH', getComputedStyle(document.documentElement).getPropertyValue('--ai-top-h').trim());
    });
  }

  function renderPanel() {
    document.getElementById('ai-panel').innerHTML = `
<div id="ai-header">
  <div style="display:flex;align-items:center;gap:8px">
    <span style="font-size:12px;font-weight:700;color:var(--accent);letter-spacing:1.5px">⬡ SILVA AI</span>
  </div>
  <div style="display:flex;gap:4px;align-items:center">
    <button class="icon-btn" id="btn-ai-continue" title="Continue where we left off">↺</button>
    <button class="icon-btn" id="btn-toggle-ai-controls" title="Hide/Show AI controls">▾</button>
    <button class="icon-btn" id="btn-toggle-ai-suggestions" title="Hide/Show follow-ups">✦</button>
    <button class="icon-btn" id="btn-toggle-ai-research" title="Toggle web research">🌐</button>
    <button class="icon-btn" id="btn-toggle-auto-actions" title="Toggle auto actions">⚡</button>
    <button class="ai-scan-btn icon-btn" id="btn-ai-scan" title="Auto-detect local AI">⟳ Scan Local</button>
    <button class="icon-btn" id="btn-clear-ai">✕</button>
    <button class="icon-btn" id="btn-close-ai">×</button>
  </div>
</div>

<div id="ai-top">
  <div id="ai-dual-providers">
    ${providerSlotHTML(1)}
    <div class="provider-divider">
      <button id="btn-swap-providers" class="swap-btn" title="Swap providers">⇄</button>
    </div>
    ${providerSlotHTML(2)}
  </div>

  <div id="ai-active-bar">
    <span class="active-bar-label">SEND TO:</span>
    <button id="btn-use-p1" class="use-btn use-btn-active">P1 <span id="active-p1-label">—</span></button>
    <button id="btn-use-p2" class="use-btn">P2 <span id="active-p2-label">—</span></button>
    <button id="btn-use-both" class="use-btn" title="Compare both providers">⊕ Both</button>
    <button id="btn-use-collab" class="use-btn" title="Collaborative Merged Thinking">🤝 Collab</button>
  </div>

  <div id="ai-timeline">
    <div class="tl-tabs">
      <button class="tl-tab tl-active" data-tl="past">⏮ Past</button>
      <button class="tl-tab" data-tl="present">⏺ Now</button>
      <button class="tl-tab" data-tl="future">⏭ Queue</button>
    </div>
    <div id="tl-past" class="tl-pane tl-pane-active"><div id="tl-past-list" class="tl-list"><div class="tl-empty">No completed tasks</div></div></div>
    <div id="tl-present" class="tl-pane"><div id="tl-now-content"><div class="tl-empty">No active task</div></div></div>
    <div id="tl-future" class="tl-pane">
      <div id="tl-predictions" class="tl-list" style="margin:6px 6px 0;background:var(--surface0)22;border:1px solid var(--surface0);border-radius:6px;padding:8px"></div>
      <div id="tl-future-list" class="tl-list"><div class="tl-empty">No queued tasks</div></div>
      <div style="padding:4px 6px;display:flex;gap:4px">
        <input id="tl-queue-input" class="tl-input" placeholder="Queue a task for later...">
        <button id="btn-queue-task" class="tl-queue-btn">+</button>
      </div>
    </div>
  </div>

  <div id="ai-quick-actions">
    <button class="qa-btn" data-action="audit">Project Audit</button>
    <button class="qa-btn" data-action="improve">Improve Plan</button>
    <button class="qa-btn" data-action="explain">Explain</button>
    <button class="qa-btn" data-action="fix">Fix Bugs</button>
    <button class="qa-btn" data-action="refactor">Refactor</button>
    <button class="qa-btn" data-action="document">Add Docs</button>
    <button class="qa-btn" data-action="test">Write Tests</button>
    <button class="qa-btn" data-action="review">Code Review</button>
    <button class="qa-btn" data-action="optimize">Optimize</button>
    <button class="qa-btn" data-action="security">Security</button>
  </div>

  <div id="ai-capabilities" style="padding:8px;border-bottom:1px solid var(--surface0);display:flex;flex-direction:column;gap:6px">
    <div style="font-size:9px;color:var(--overlay0);font-weight:800;letter-spacing:1px">CAPABILITIES</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;font-size:11px;color:var(--subtext1)">
      <span style="background:var(--surface0);border:1px solid var(--surface1);padding:3px 8px;border-radius:999px">✓ Jarvice Automation</span>
      <span style="background:var(--surface0);border:1px solid var(--surface1);padding:3px 8px;border-radius:999px">✓ Dual‑Model Collab</span>
      <span style="background:var(--surface0);border:1px solid var(--surface1);padding:3px 8px;border-radius:999px">✓ Stability Layer</span>
      <span style="background:var(--surface0);border:1px solid var(--surface1);padding:3px 8px;border-radius:999px">✓ Mirofish Predictions</span>
      <span id="cap-web" style="background:var(--surface0);border:1px solid var(--surface1);padding:3px 8px;border-radius:999px">Web Research: OFF</span>
      <span id="cap-autoexec" style="background:var(--surface0);border:1px solid var(--surface1);padding:3px 8px;border-radius:999px;cursor:pointer" title="Toggle automatic execution of FILE/Patch/Command blocks">Auto Execute: ON</span>
      <span id="cap-turboquant" style="background:var(--surface0);border:1px solid var(--surface1);padding:3px 8px;border-radius:999px;cursor:pointer" title="Toggle TurboQuant capability">TurboQuant: ON</span>
      <span id="cap-turbovec" style="background:var(--surface0);border:1px solid var(--surface1);padding:3px 8px;border-radius:999px;cursor:pointer" title="Toggle TurboVec capability">TurboVec: OFF</span>
      <span id="cap-piper" style="background:var(--surface0);border:1px solid var(--surface1);padding:3px 8px;border-radius:999px;cursor:pointer" title="Toggle Piper TTS capability">Piper TTS: OFF</span>
      <span id="cap-perf" style="background:var(--surface0);border:1px solid var(--surface1);padding:3px 8px;border-radius:999px;cursor:pointer" title="Cycle speed mode (fast/balanced/quality)">Speed: FAST</span>
      <span id="cap-actionlog" style="background:var(--surface0);border:1px solid var(--surface1);padding:3px 8px;border-radius:999px;cursor:pointer" title="Show/hide executed actions log">Actions Log</span>
    </div>
  </div>
</div>

<div class="resizer resizer-v" id="resizer-ai-chat"></div>

<div id="ai-messages"></div>

<div id="ai-action-log-wrap" class="hidden" style="max-height:180px;overflow:auto;border-top:1px solid var(--surface0);border-bottom:1px solid var(--surface0);padding:8px;background:var(--base)">
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
    <div style="font-size:10px;color:var(--overlay0);font-weight:800;letter-spacing:1px">EXECUTED ACTIONS</div>
    <div style="flex:1"></div>
    <button id="btn-retry-actions" class="icon-btn" title="Retry failed commands">↻</button>
    <button id="btn-clear-actions" class="icon-btn" title="Clear actions log">✕</button>
  </div>
  <div id="ai-action-log"><div class="tl-empty">No executed actions yet</div></div>
</div>

<div id="ai-suggestions" class="hidden"></div>

<div id="ai-input-area">
  <div id="ai-context-indicator" class="hidden">
    <span id="ai-context-text"></span>
    <button id="btn-clear-context" class="icon-btn">×</button>
  </div>
  <div id="ai-input-row">
    <textarea id="ai-input" placeholder="Ask anything… Enter=send, Shift+Enter=newline" rows="2"></textarea>
    <div style="display:flex;flex-direction:column;gap:3px">
      <button id="btn-ai-send" class="send-btn" title="Send">▶</button>
      <div style="display:flex;gap:3px">
        <button id="btn-ai-compare" class="compare-send-btn" title="Send to both providers" style="flex:1">⊕</button>
        <button id="btn-ai-voice" class="voice-btn" title="Voice Jarvis" style="flex:1">🎙</button>
      </div>
    </div>
  </div>
</div>
`;
  }

  function providerSlotHTML(n) {
    return `
<div class="provider-slot" id="pslot${n}">
  <div class="pslot-header">
    <span class="pslot-label">PROVIDER ${n}</span>
    <div id="p${n}-dot" class="status-dot dot-unchecked" title="Not connected"></div>
  </div>
  <select id="p${n}-provider" class="prov-select"></select>
  <div style="display:flex;gap:4px;margin-top:4px">
    <select id="p${n}-model" class="prov-model-select" style="flex:1"></select>
    <button id="p${n}-connect" class="connect-btn">Connect</button>
  </div>
  <div id="p${n}-key-row" class="key-row">
    <input id="p${n}-key" type="password" class="key-input" placeholder="API key...">
    <span id="p${n}-free-tip" class="free-tip"></span>
  </div>
  <div id="p${n}-local-msg" class="local-msg hidden"></div>
</div>`;
  }

  function bindEvents() {
    document.getElementById('btn-toggle-ai')?.addEventListener('click', toggle);
    document.getElementById('btn-close-ai').addEventListener('click', hide);
    document.getElementById('btn-clear-ai').addEventListener('click', clearChat);
    document.getElementById('btn-ai-continue')?.addEventListener('click', () => continueFromLast(true));
    document.getElementById('btn-ai-scan').addEventListener('click', () => autoDetectLocalAI(false));
    document.getElementById('btn-toggle-ai-controls')?.addEventListener('click', toggleAiControls);
    document.getElementById('btn-toggle-ai-suggestions')?.addEventListener('click', toggleAiSuggestions);
    document.getElementById('btn-toggle-ai-research')?.addEventListener('click', toggleAiResearch);
    document.getElementById('btn-toggle-auto-actions')?.addEventListener('click', toggleAutoActions);
    document.getElementById('cap-autoexec')?.addEventListener('click', toggleAutoActions);
    document.getElementById('cap-actionlog')?.addEventListener('click', toggleActionLog);
    document.getElementById('btn-retry-actions')?.addEventListener('click', () => retryFailedCommands());
    document.getElementById('btn-clear-actions')?.addEventListener('click', clearActionLog);
    document.getElementById('cap-turboquant')?.addEventListener('click', () => setCapability('turboQuant', !capabilities.turboQuant));
    document.getElementById('cap-turbovec')?.addEventListener('click', () => setCapability('turboVec', !capabilities.turboVec));
    document.getElementById('cap-piper')?.addEventListener('click', () => setCapability('piper', !capabilities.piper));
    document.getElementById('cap-perf')?.addEventListener('click', () => cyclePerfMode());
    document.getElementById('btn-swap-providers').addEventListener('click', swapProviders);
    document.getElementById('btn-use-p1').addEventListener('click', () => setActive(1));
    document.getElementById('btn-use-p2').addEventListener('click', () => setActive(2));
    document.getElementById('btn-use-both').addEventListener('click', () => setActive('both'));
    document.getElementById('btn-use-collab').addEventListener('click', () => setActive('collab'));
    document.getElementById('btn-ai-send').addEventListener('click', () => doSend(false));
    document.getElementById('btn-ai-compare').addEventListener('click', () => doSend(true));
    document.getElementById('btn-ai-voice').addEventListener('click', toggleVoice);
    document.getElementById('p1-connect').addEventListener('click', () => connectSlot(1));
    document.getElementById('p2-connect').addEventListener('click', () => connectSlot(2));
    document.getElementById('p1-provider').addEventListener('change', () => onProvChange(1));
    document.getElementById('p2-provider').addEventListener('change', () => onProvChange(2));
    document.getElementById('p1-model').addEventListener('change', () => onModelChange(1));
    document.getElementById('p2-model').addEventListener('change', () => onModelChange(2));
    document.getElementById('p1-key')?.addEventListener('change', () => onKeyChange(1));
    document.getElementById('p2-key')?.addEventListener('change', () => onKeyChange(2));
    document.getElementById('p1-key')?.addEventListener('blur', () => onKeyChange(1));
    document.getElementById('p2-key')?.addEventListener('blur', () => onKeyChange(2));
    document.getElementById('btn-queue-task').addEventListener('click', queueTask);
    document.getElementById('tl-queue-input').addEventListener('keydown', e => { if (e.key === 'Enter') queueTask(); });
    document.getElementById('btn-clear-context').addEventListener('click', () => document.getElementById('ai-context-indicator').classList.add('hidden'));
    document.getElementById('ai-input').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(false); } });
    document.getElementById('ai-input').addEventListener('input', () => { const i = document.getElementById('ai-input'); i.style.height = 'auto'; i.style.height = Math.min(i.scrollHeight, 140) + 'px'; });

    document.querySelectorAll('.tl-tab').forEach(b => b.addEventListener('click', () => {
      document.querySelectorAll('.tl-tab').forEach(x => x.classList.remove('tl-active'));
      document.querySelectorAll('.tl-pane').forEach(x => x.classList.remove('tl-pane-active'));
      b.classList.add('tl-active');
      document.getElementById('tl-' + b.dataset.tl).classList.add('tl-pane-active');
    }));

    document.querySelectorAll('.qa-btn').forEach(b => b.addEventListener('click', () => {
      const sel = window.EditorManager?.getSelectedText() || '';
      const fn = window.EditorManager?.getActiveTab()?.name || 'code';
      const prompts = {
        audit:    `Audit this project using the IDE project context. Output: (1) what it is, (2) how it runs, (3) concrete gaps/bugs with file hints, (4) prioritized improvements that do NOT require framework migration unless asked.`,
        improve:  `Create a careful, step-by-step improvement plan for this project based on the IDE project context. Do not ask "should I proceed". Start immediately with the top 5 actions.`,
        explain:  `Explain this ${fn} code:\n\n\`\`\`\n${sel || '[select code first]'}\n\`\`\``,
        fix:      `Find and fix ALL bugs in this ${fn} code:\n\n\`\`\`\n${sel || '[select code first]'}\n\`\`\``,
        refactor: `Refactor this ${fn} code for clarity and best practices:\n\n\`\`\`\n${sel || '[select code first]'}\n\`\`\``,
        document: `Add comprehensive docs and comments to this ${fn} code:\n\n\`\`\`\n${sel || '[select code first]'}\n\`\`\``,
        test:     `Write thorough unit tests with edge cases for this ${fn} code:\n\n\`\`\`\n${sel || '[select code first]'}\n\`\`\``,
        review:   `Code review this ${fn} code. Check security, performance, best practices:\n\n\`\`\`\n${sel || '[select code first]'}\n\`\`\``,
        optimize: `Optimize this ${fn} code for maximum performance. Show complexity analysis:\n\n\`\`\`\n${sel || '[select code first]'}\n\`\`\``,
        security: `Security audit this ${fn} code. Find all vulnerabilities:\n\n\`\`\`\n${sel || '[select code first]'}\n\`\`\``,
      };
      document.getElementById('ai-input').value = prompts[b.dataset.action] || '';
      show(); document.getElementById('ai-input').focus();
    }));
  }

  // ─── Provider dropdowns ──────────────────────────────────────────────
  function populateProviders() {
    [1, 2].forEach(n => {
      const sel = document.getElementById(`p${n}-provider`);
      sel.innerHTML = Object.entries(PROVIDERS).map(([id, p]) => {
        const tags = [];
        if (p.type === 'local') tags.push('[Local]');
        if (p.freeTier) tags.push('✦Free');
        if (detectedLocal[id]) tags.push('●');
        return `<option value="${id}">${p.name}${tags.length ? ' ' + tags.join(' ') : ''}</option>`;
      }).join('');
      sel.value = n === 1 ? provider1.id : provider2.id;
      updateModelSelect(n);
      updateKeyRow(n);
    });
    updateActiveLabels();
    updateLocalMessages();
  }

  function updateModelSelect(n) {
    const pid = document.getElementById(`p${n}-provider`).value;
    const sel = document.getElementById(`p${n}-model`);
    const saved = n === 1 ? provider1.model : provider2.model;

    if (PROVIDERS[pid]?.type === 'local' && detectedLocal[pid]) {
      sel.innerHTML = '<option>Loading...</option>';
      fetchLocalModels(pid).then(list => {
        if (list.length) {
          sel.innerHTML = list.map(m => `<option value="${m.id}">${m.label}</option>`).join('');
        } else {
          sel.innerHTML = (MODELS[pid] || []).map(([id, l]) => `<option value="${id}">${l}</option>`).join('');
        }
        
        let toSelect = saved;
        if (!toSelect || toSelect === 'auto') {
          toSelect = PREFERRED_MODELS[pid] || '';
        }

        if (toSelect) {
          sel.value = toSelect;
          if (sel.value !== toSelect) {
            const s = toSelect.toLowerCase();
            const opt = Array.from(sel.options).find(o => (o.value || '').toLowerCase().includes(s) || (o.textContent || '').toLowerCase().includes(s));
            if (opt) sel.value = opt.value;
          }
        }
      });
      return;
    }
    sel.innerHTML = (MODELS[pid] || [['auto','Auto']]).map(([id, l]) => `<option value="${id}">${l}</option>`).join('');
    if (saved) sel.value = saved;
    else if (PREFERRED_MODELS[pid]) {
      const p = PREFERRED_MODELS[pid];
      const opt = Array.from(sel.options).find(o => o.value.includes(p));
      if (opt) sel.value = opt.value;
    }
  }

  async function fetchLocalModels(pid) {
    const ep = LOCAL_ENDPOINTS.find(e => e.id === pid) || Object.values(detectedLocal).find(d => d.url.includes(pid));
    if (!ep && !detectedLocal[pid]) return [];
    const url = (detectedLocal[pid]?.url || ep?.url);
    const health = ep?.healthPath || '/v1/models';
    
    try {
      // PROXIED model fetch to bypass CORS
      const res = await window.silva.ai.proxyRequest({ url: url + health });
      if (!res.success || !res.data) return [];
      
      const data = res.data;
      let list = [];
      if (Array.isArray(data)) list = data;
      else if (data.models && Array.isArray(data.models)) list = data.models;
      else if (data.data && Array.isArray(data.data)) list = data.data;
      
      return list.map(m => {
        const id = m.id || m.name || m.model || '';
        const label = (m.name || m.id || id).replace(':latest', '').split('/').pop();
        return { id, label };
      }).filter(m => m.id);
    } catch (e) {
      console.warn(`Failed to fetch models for ${pid}:`, e);
      return [];
    }
  }

  function updateKeyRow(n) {
    const pid = document.getElementById(`p${n}-provider`).value;
    const p = PROVIDERS[pid];
    const keyRow = document.getElementById(`p${n}-key-row`);
    const freeTip = document.getElementById(`p${n}-free-tip`);
    const keyInp = document.getElementById(`p${n}-key`);
    if (p.type === 'local') {
      keyRow.style.display = 'none';
    } else {
      keyRow.style.display = '';
      keyInp.placeholder = p.keyHint || 'API key...';
      if (p.freeTier && p.freeUrl) {
        freeTip.innerHTML = `<a href="#" onclick="return false" style="color:var(--green);font-size:10px" title="Get free key at ${p.freeUrl}">✦ Free key at ${p.freeUrl}</a>`;
      } else {
        freeTip.innerHTML = '';
      }
    }
  }

  function updateLocalMessages() {
    [1, 2].forEach(n => {
      const pid = document.getElementById(`p${n}-provider`).value;
      const msg = document.getElementById(`p${n}-local-msg`);
      if (PROVIDERS[pid]?.type === 'local') {
        msg.classList.remove('hidden');
        if (detectedLocal[pid]) {
          msg.innerHTML = `<span class="dot-green">●</span> Running at ${detectedLocal[pid].url}`;
        } else {
          msg.innerHTML = `<span class="dot-red">●</span> Not detected — start ${PROVIDERS[pid].name} first`;
        }
      } else {
        msg.classList.add('hidden');
      }
    });
  }

  function onProvChange(n) {
    const sel = document.getElementById(`p${n}-provider`);
    let pid = sel.value;
    const map = { jan2: 'jan', lmnet: 'lmstudio', ollama2: 'ollama' };
    const alt = map[pid];
    if (alt && !detectedLocal[pid] && detectedLocal[alt]) {
      sel.value = alt;
      pid = alt;
    }
    if (n === 1) provider1.id = pid;
    else provider2.id = pid;
    if (resolvedLocalModelCache[pid]) delete resolvedLocalModelCache[pid];
    updateModelSelect(n);
    updateKeyRow(n);
    updateLocalMessages();
    setDot(n, 'unchecked');
    updateActiveLabels();
    saveSettings();
  }

  function onModelChange(n) {
    const model = document.getElementById(`p${n}-model`)?.value || '';
    if (n === 1) provider1.model = model;
    else provider2.model = model;
    saveSettings();
  }

  function onKeyChange(n) {
    const key = document.getElementById(`p${n}-key`)?.value?.trim() || '';
    if (n === 1) provider1.key = key;
    else provider2.key = key;
    saveSettings();
  }

  // ─── Connect & test ──────────────────────────────────────────────────
  async function connectSlot(n, silent = false) {
    const pid = document.getElementById(`p${n}-provider`).value;
    const model = document.getElementById(`p${n}-model`).value;
    const key = document.getElementById(`p${n}-key`)?.value?.trim() || '';

    if (n === 1) { provider1 = { id: pid, model, key, status: 'checking' }; }
    else { provider2 = { id: pid, model, key, status: 'checking' }; }

    const btn = document.getElementById(`p${n}-connect`);
    if (btn) { btn.disabled = true; btn.textContent = '...'; }
    setDot(n, 'checking');

    let ok = false;
    try { 
      ok = await testConn(pid, model, key); 
    } catch (e) {
      console.error(`Connect test failed for Slot ${n}:`, e);
    }

    setDot(n, ok ? 'connected' : 'error');
    if (btn) {
      btn.disabled = false;
      btn.textContent = ok ? '✓ OK' : '✗ Retry';
    }

    if (ok) {
      saveSettings();
      updateActiveLabels();
      if (!silent) {
        sysMsg(`✅ ${PROVIDERS[pid]?.name} (${model}) connected.`);
        window.notify?.(`${PROVIDERS[pid]?.name} connected!`, 'success');
      }
    } else if (!silent) {
      const p = PROVIDERS[pid];
      if (p.type === 'local') {
        sysMsg(`❌ ${p.name} not reachable. Make sure it is running on your machine.`);
      } else {
        sysMsg(`❌ Could not connect to ${p.name}. Check your API key.`);
      }
    }
  }

  async function testConn(pid, model, key) {
    // For local engines, use proxy to bypass CORS
    if (PROVIDERS[pid]?.type === 'local') {
      const ep = LOCAL_ENDPOINTS.find(e => e.id === pid) || Object.values(detectedLocal).find(d => d.url.includes(pid));
      if (!ep && !detectedLocal[pid]) return false;
      const url = detectedLocal[pid]?.url || ep?.url;
      const res = await window.silva.ai.proxyRequest({ url: url + (ep?.healthPath || '/v1/models') });
      return res.success;
    }
    
    // For cloud, use standard call
    const r = await callProviderStable(pid, model, key, [{ role: 'user', content: 'ping' }], 5);
    return !!r;
  }

  // ─── Auto-detect local AI ────────────────────────────────────────────
  async function autoDetectLocalAI(silent) {
    if (!silent) {
      const btn = document.getElementById('btn-ai-scan');
      btn.textContent = '⟳ Scanning...';
      btn.disabled = true;
      setTimeout(() => { btn.textContent = '⟳ Scan Local'; btn.disabled = false; }, 5000);
    }

    detectedLocal = {};
    const scanList = [...LOCAL_ENDPOINTS];

    const results = await Promise.allSettled(
      scanList.map(async ep => {
        try {
          // Use main process proxy to bypass CORS/Network restrictions
          const res = await window.silva.ai.proxyRequest({ url: ep.url + ep.healthPath });
          if (res.success) { 
            detectedLocal[ep.id] = { url: ep.url, name: ep.name, style: ep.style }; 
            return ep; 
          }
        } catch (e) {}
        return null;
      })
    );

    const found = Object.keys(detectedLocal);
    if (!silent) {
      if (found.length) {
        sysMsg(`✅ Found: ${found.map(id => detectedLocal[id].name).join(', ')}. Dropdowns updated!`);
        window.notify?.(`Local AI detected: ${found.map(id => detectedLocal[id].name).join(', ')}`, 'success');
      } else {
        sysMsg(`ℹ️ No local AI detected. Install Ollama, Jan, or LM Studio to run models locally.`);
      }
    }
    populateProviders();

    const normalize = (pid) => {
      const map = { jan2: 'jan', lmnet: 'lmstudio', ollama2: 'ollama' };
      const alt = map[pid];
      if (alt && detectedLocal[alt]) return alt;
      return pid;
    };
    [1, 2].forEach(n => {
      const sel = document.getElementById(`p${n}-provider`);
      const cur = sel.value;
      const next = normalize(cur);
      if (next !== cur) {
        sel.value = next;
        onProvChange(n);
      }
    });

    // AUTO-CONNECT found slots
    [1, 2].forEach(n => {
      const pid = document.getElementById(`p${n}-provider`).value;
      if (detectedLocal[pid]) {
        connectSlot(n, true); // silent connect
      }
    });
  }

  // ─── Sending messages ────────────────────────────────────────────────
  function extractFolderPath(text) {
    const s = String(text || '').trim();
    const fromCd = s.match(/\bcd\s+("([A-Za-z]:[\\/][^"\r\n]+)"|([A-Za-z]:[\\/][^\r\n]+))/i);
    let p = fromCd ? (fromCd[2] || fromCd[3] || '') : '';
    if (!p) {
      const quoted = s.match(/"([A-Za-z]:[\\/][^"\r\n]+)"/);
      if (quoted) p = quoted[1];
    }
    if (!p) {
      const bare = s.match(/([A-Za-z]:[\\/][^\s"'<>\r\n`]+)/);
      if (bare) p = bare[1];
    }
    p = p.trim()
      .replace(/[)\].,;`]+$/g, '')
      .replace(/\\+$/g, '')
      .replace(/^"+|"+$/g, '');
    return /^[A-Za-z]:[\\/]/.test(p) ? p : null;
  }

  async function maybeOpenFolderFromText(text) {
    const p = extractFolderPath(text);
    if (!p) return null;
    if (!window.silva?.fs?.openFolderPath) return false;
    const r = await window.silva.fs.openFolderPath(p);
    if (r?.success) {
      sysMsg(`📁 Project loaded: ${r.path}`);
      setContext(r.path, `Project: ${r.path.split(/[/\\\\]/).pop()}`);
      return r.path;
    }
    if (r?.error) sysMsg(`❌ Cannot open folder: ${r.error}`);
    return null;
  }

  function isProjectIntent(text) {
    const t = String(text || '').toLowerCase();
    return t.includes('project') || t.includes('repo') || t.includes('repository') || t.includes('codebase');
  }

  function treeToLines(items, depthLimit = 2, maxLines = 220) {
    const out = [];
    const walk = (nodes, depth) => {
      if (!nodes || out.length >= maxLines) return;
      for (const n of nodes) {
        if (out.length >= maxLines) return;
        const indent = '  '.repeat(depth);
        out.push(`${indent}${n.type === 'directory' ? '📁' : '📄'} ${n.name}`);
        if (n.type === 'directory' && depth < depthLimit) walk(n.children || [], depth + 1);
      }
    };
    walk(items, 0);
    return out.join('\n');
  }

  function flattenTree(items, out = []) {
    if (!items) return out;
    for (const n of items) {
      out.push(n);
      if (n.type === 'directory') flattenTree(n.children || [], out);
    }
    return out;
  }

  async function buildProjectContextEnvelope(userText) {
    const root = window.FileTreeManager?.getRootPath?.();
    const tree = window.FileTreeManager?.getTree?.();
    if (!root || !tree || !tree.length) return null;
    if (!shouldAttachProjectContext(userText)) return null;

    const now = Date.now();
    if (projectCtxState.root === root && projectCtxState.summary && (now - projectCtxState.builtAt) < 15000) {
      return projectCtxState.summary;
    }

    const treeText = treeToLines(tree, getTreeDepthForContext(), perfMode === 'fast' ? 140 : 280);
    const flat = flattenTree(tree, []);
    const keyNames = new Set(['package.json', 'README.md', 'README', 'pyproject.toml', 'requirements.txt', 'Cargo.toml', 'go.mod', 'tsconfig.json', 'vite.config.ts', 'vite.config.js']);
    const keyFiles = flat.filter(f => f.type === 'file' && keyNames.has(f.name)).slice(0, 4);

    const snippets = [];
    for (const f of keyFiles) {
      try {
        const r = await toolProtocol.read_file({ path: f.path });
        if (r.success && r.content) {
          const clipped = r.content.slice(0, getKeyFileClipLimit());
          snippets.push(`FILE ${f.path}\n${clipped}`);
        }
      } catch {}
    }

    const summary = [
      `[IDE_PROJECT_CONTEXT]`,
      `project_loaded=true`,
      `project_root=${root}`,
      `project_tree_depth2:`,
      treeText,
      snippets.length ? `key_files:\n${snippets.join('\n\n---\n\n')}` : `key_files: (none sampled)`,
      `[END_IDE_PROJECT_CONTEXT]`,
    ].join('\n');

    // Cap total context size — large models still choke on very long inputs
    const CTX_LIMIT = getContextLimit();
    const capped = summary.length > CTX_LIMIT
      ? summary.slice(0, CTX_LIMIT) + '\n...(context truncated for speed)[END_IDE_PROJECT_CONTEXT]'
      : summary;

    projectCtxState.root = root;
    projectCtxState.summary = capped;
    projectCtxState.keyFiles = keyFiles.map(f => f.path);
    projectCtxState.builtAt = now;
    return capped;
  }

  function shouldAttachProjectContext(text) {
    const t = (text || '').toLowerCase();
    if (t.includes('check this project')) return true;
    if (t.includes('analy') || t.includes('analyse') || t.includes('analyze') || t.includes('analysis')) return true;
    if (t.includes('review')) return true;
    if (t.includes('audit')) return true;
    if (t.includes('architecture') || t.includes('arch')) return true;
    if (t.includes('roadmap') || t.includes('plan')) return true;
    if (t.includes('improve') || t.includes('improvement')) return true;
    if (t.includes('breakdown') || t.includes('how it works')) return true;
    if (t.includes('tell me')) return true;
    if (t.includes('what is this project')) return true;
    if (t.includes('project') && /[a-z]:\\/.test(t)) return true;
    return false;
  }

  function buildWebQuery(text) {
    const s = String(text || '')
      .replace(/\[IDE_PROJECT_CONTEXT\][\s\S]*?\[END_IDE_PROJECT_CONTEXT\]/g, ' ')
      .trim();
    const cleaned = s
      .replace(/^(hey|hi|hello|yo|sup|how are you|good morning|good afternoon|good evening)[\s,!.:-]*/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    const tokens = cleaned.split(' ').filter(Boolean);
    return tokens.slice(0, 14).join(' ');
  }

  function shouldWebSearch(text) {
    const t = String(text || '').toLowerCase();
    if (t.length < 24 && /^(hey|hi|hello|yo)\b/.test(t.trim())) return false;
    if (!shouldAttachProjectContext(text) && !isProjectIntent(text)) return false;
    return true;
  }

  async function doSend(compare) {
    if (isStreaming) return;
    const input = document.getElementById('ai-input');
    const text = input.value.trim();
    if (!text) return;
    autoActionRequested = shouldAutoExecuteActions(text);
    const openedPath = await maybeOpenFolderFromText(text);
    input.value = ''; input.style.height = '';

    const sel = window.EditorManager?.getSelectedText() || '';
    const lang = window.EditorManager?.getActiveTab()?.language || '';
    let full = text;
    if (sel && !text.includes('```')) full = `${text}\n\n\`\`\`${lang}\n${sel}\n\`\`\``;

    addUserMsg(text);
    if (openedPath) {
      const trimmed = text.replace(/^"+|"+$/g, '').trim();
      if (trimmed === openedPath) {
        sysMsg('✅ Project opened. Ask: "analyze project" or "what is this repo for?"');
        return;
      }
    }

    const root = window.FileTreeManager?.getRootPath?.();
    const tree = window.FileTreeManager?.getTree?.();
    const isNowProjectIntent = isProjectIntent(text) || shouldAttachProjectContext(text);
    if (!root && (isNowProjectIntent || lastProjectIntent)) {
      sysMsg('📁 No local project is loaded. Open a real local folder path first (example: `C:\\Users\\Silva\\WORKSPACE\\desktopclaw`). I will not guess project details.');
      return;
    }
    if (root && tree && (isNowProjectIntent || lastProjectIntent)) {
      const ctx = await buildProjectContextEnvelope(text);
      if (ctx) full = `${text}\n\n${ctx}`;
    }
    lastProjectIntent = isNowProjectIntent;

    recordMessage('user', full);

    if (activeProvider === 'collab') {
      await sendCollab(full);
    } else if (compare || activeProvider === 'both') {
      await sendBoth(full);
    } else {
      const n = activeProvider === 2 ? 2 : 1;
      const p = n === 1 ? provider1 : provider2;
      const curPid = document.getElementById(`p${n}-provider`).value;
      const model = document.getElementById(`p${n}-model`).value;
      const key = document.getElementById(`p${n}-key`)?.value?.trim() || p.key || '';
      setPresent({ label: text.slice(0, 80), provider: PROVIDERS[curPid]?.name });
      await streamResp(curPid, model, key);
    }
  }

  // Quick health probe — ensures an endpoint is in detectedLocal before collab uses it
  async function ensureEndpointReady(pid) {
    if (detectedLocal[pid] && isHealthy(pid)) return true;
    const ep = LOCAL_ENDPOINTS.find(e => e.id === pid);
    if (!ep) return false;
    if (!ep.url.includes('127.0.0.1') && !ep.url.includes('localhost')) return false;
    try {
      const res = await withTimeout(window.silva.ai.proxyRequest({ url: ep.url + ep.healthPath }), 4000);
      if (res?.success) {
        detectedLocal[pid] = { url: ep.url, name: ep.name, style: ep.style };
        markHealth(pid, true);
        if (providerHealth[pid]) providerHealth[pid].fails = 0;
        return true;
      }
    } catch {}
    return false;
  }

  // Direct provider call for collab — NO fallback chain, fixed 3-minute timeout
  async function callDirect(pid, model, key, msgs, maxTok) {
    const COLLAB_TIMEOUT = 180000;
    return withTimeout(callProvider(pid, model, key, msgs, maxTok), COLLAB_TIMEOUT);
  }

  async function sendCollab(prompt) {
    isStreaming = true;
    document.getElementById('btn-ai-send').disabled = true;
    const collabStart = Date.now();
    
    try {
      const pid1 = document.getElementById('p1-provider').value;
      const m1 = document.getElementById('p1-model').value;
      const k1 = document.getElementById('p1-key')?.value?.trim() || provider1.key || '';
      
      const pid2 = document.getElementById('p2-provider').value;
      const m2 = document.getElementById('p2-model').value;
      const k2 = document.getElementById('p2-key')?.value?.trim() || provider2.key || '';

      setPresent({ label: prompt.slice(0, 80), provider: 'Collab (Merged)' });
      const msgEl = beginAssistantTurn('Silva AI');

      const n1 = PROVIDERS[pid1]?.name || pid1;
      const n2 = PROVIDERS[pid2]?.name || pid2;
      const webTrace = {
        queries: [],
        resultsInspected: 0,
        sourcesSeen: [],
        sourcesIncluded: [],
        accepted: [],
        rejected: [],
      };
      appendThinkLine(msgEl, `Planner: task classified as ${shouldAttachProjectContext(prompt) ? 'project-improvement/analysis' : 'general'}`);
      appendThinkLine(msgEl, `Capabilities: TurboQuant=${capabilities.turboQuant ? 'ON' : 'OFF'} · TurboVec=${capabilities.turboVec ? 'ON' : 'OFF'} · Piper=${capabilities.piper ? 'ON' : 'OFF'} · Speed=${perfMode.toUpperCase()}`);
      appendThinkLine(msgEl, `Router: collab mode (${n1} ⇄ ${n2})`);
      appendThinkLine(msgEl, `Context: ${messages.length} message(s)`);

      // ── Pre-flight: ping both providers in parallel ──────────────────────
      appendThinkLine(msgEl, `Providers: checking availability...`, 'providers-status');
      const [ok1, ok2] = await Promise.all([ensureEndpointReady(pid1), ensureEndpointReady(pid2)]);
      if (!ok1 && !ok2) throw new Error(`Both providers offline — ${n1} and ${n2}`);
      appendThinkLine(msgEl, `Providers: ${n1}=${ok1 ? 'OK' : 'OFF'} · ${n2}=${ok2 ? 'OK' : 'OFF'}`, 'providers-status');

      // ── Web research (optional) ──────────────────────────────────
      let webMsg = null;
      if (aiWebResearchEnabled && shouldWebSearch(prompt)) {
        const q = buildWebQuery(prompt);
        webTrace.queries.push(q);
        appendThinkLine(msgEl, `Web Research: query[${webTrace.queries.length}] "${q}"`);
        const r = await toolProtocol.web_search({ query: q });
        if (r?.success) {
          const results = (r.results || []);
          webTrace.resultsInspected = results.length;
          webTrace.sourcesSeen = results.map(x => x.url || x.title || '(unknown source)').filter(Boolean);
          webTrace.sourcesIncluded = results.slice(0, 5).map(x => x.url || x.title || '(unknown source)').filter(Boolean);
          webTrace.accepted = webTrace.sourcesIncluded.map(s => `Included in context: ${s}`);
          webTrace.rejected = webTrace.sourcesSeen
            .filter(s => !webTrace.sourcesIncluded.includes(s))
            .map(s => `Not included: ${s}`);
          const lines = (r.results || []).slice(0, 5).map(x => `- ${x.title}${x.snippet ? ` — ${x.snippet}` : ''}${x.url ? ` (${x.url})` : ''}`).join('\n');
          webMsg = { role: 'user', content: `Web research results:\n${lines}` };
          appendThinkLine(msgEl, `Web Research: results_inspected=${webTrace.resultsInspected}`);
        } else {
          webTrace.rejected.push(`Search failed: ${r?.error || 'error'}`);
          appendThinkLine(msgEl, `Web Research: failed (${r?.error || 'error'})`);
        }
      }

      const baseMessages = webMsg ? [...messages, webMsg] : messages;

      // ── Step 1: Draft ───────────────────────────────────────────────
      const drafter = ok1 ? { pid: pid1, model: m1, key: k1, name: n1 } : { pid: pid2, model: m2, key: k2, name: n2 };
      const refiner = ok1 && ok2 ? { pid: pid2, model: m2, key: k2, name: n2 } : drafter;
      const maxTok = getMaxTokensFor(drafter.pid);

      const t1Start = Date.now();
      appendThinkLine(msgEl, `${drafter.name}: drafting with ${drafter.model || 'auto'}`);

      let resp1;
      try {
        resp1 = await callDirect(drafter.pid, drafter.model, drafter.key, baseMessages, maxTok);
      } catch (e1) {
        // If drafter fails, try the other provider before giving up
        if (ok1 && ok2 && drafter.pid !== refiner.pid) {
          appendThinkLine(msgEl, `${drafter.name}: failed (${e1.message})`);
          appendThinkLine(msgEl, `Router: switching draft to ${refiner.name}`);
          resp1 = await callDirect(refiner.pid, refiner.model, refiner.key, baseMessages, getMaxTokensFor(refiner.pid));
        } else {
          throw new Error(`${drafter.name} failed: ${e1.message}`);
        }
      }

      const t1Ms = Date.now() - t1Start;
      const words1 = (resp1 || '').trim().split(/\s+/).length;
      appendThinkLine(msgEl, `${drafter.name}: draft done (${(t1Ms / 1000).toFixed(1)}s, ~${words1} words)`);

      // ── Step 2: Refine ──────────────────────────────────────────────
      const t2Start = Date.now();
      let finalResp;

      if (ok1 && ok2) {
        // True collab: model 2 refines model 1's draft
        appendThinkLine(msgEl, `${drafter.name} → ${refiner.name}: cross-check requested`);
        appendThinkLine(msgEl, `${refiner.name}: refining with ${refiner.model || 'auto'}`);
        const collabMsgs = [
          ...baseMessages,
          { role: 'assistant', content: resp1 },
          { role: 'user', content: `Refine and finalize the above answer. Be direct and complete. Start with: "Silva AI — ${drafter.name} + ${refiner.name} responding together."` }
        ];
        let resp2;
        try {
          resp2 = await callDirect(refiner.pid, refiner.model, refiner.key, collabMsgs, getMaxTokensFor(refiner.pid));
        } catch (e2) {
          appendThinkLine(msgEl, `${refiner.name}: refine failed (${e2.message})`);
          resp2 = resp1;
        }
        const t2Ms = Date.now() - t2Start;
        const tagLine = `Silva AI — ${drafter.name} + ${refiner.name} responding together.`;
        finalResp = resp2?.trim()?.toLowerCase()?.startsWith('silva ai —')
          ? resp2 : `${tagLine}\n\n${resp2 || ''}`;
        appendThinkLine(msgEl, `${refiner.name}: refine done (${(t2Ms / 1000).toFixed(1)}s)`);
        appendThinkLine(msgEl, `${drafter.name} + ${refiner.name}: consensus reached (hi-five)`);
      } else {
        // Single-model mode: one provider answered, format nicely
        finalResp = `Silva AI — ${drafter.name} responding.\n\n${resp1}`;
        appendThinkLine(msgEl, `Router: single-provider (${drafter.name})`);
      }

      if (webTrace.queries.length) {
        appendThinkLine(msgEl, `Web Research: queries_run=${webTrace.queries.length}`);
        appendThinkLine(msgEl, `Web Research: queries=${webTrace.queries.join(' | ')}`);
        appendThinkLine(msgEl, `Web Research: results_inspected=${webTrace.resultsInspected}`);
        if (webTrace.sourcesSeen.length) appendThinkLine(msgEl, `Web Research: sources_seen=${webTrace.sourcesSeen.slice(0, 8).join(' | ')}`);
        if (webTrace.sourcesIncluded.length) appendThinkLine(msgEl, `Web Research: sources_included_in_context=${webTrace.sourcesIncluded.join(' | ')}`);
        if (webTrace.accepted.length) appendThinkLine(msgEl, `Web Research: accepted=${webTrace.accepted.join(' | ')}`);
        if (webTrace.rejected.length) appendThinkLine(msgEl, `Web Research: rejected=${webTrace.rejected.join(' | ')}`);
        appendThinkLine(msgEl, `Web Research: decision_summary=Attached top results to model context for this answer`);
      }

      // ── Merge and display ─────────────────────────────────────────────
      const lbl = ok1 && ok2 ? `Silva AI · ${drafter.name} + ${refiner.name}` : `Silva AI · ${drafter.name}`;
      appendThinkLine(msgEl, `Done: total ${( (Date.now() - collabStart) / 1000).toFixed(1)}s`);
      finalizeAssistantTurn(msgEl, finalResp, lbl);
      recordMessage('assistant', finalResp);
      window.AutomationManager?.log?.(`Collab done in ${((Date.now()-collabStart)/1000).toFixed(1)}s`);
      finishTask(finalResp);
    } catch (e) {
      addErrMsg('Collab Error: ' + e.message);
      finishTask(null);
    } finally {
      isStreaming = false;
      document.getElementById('btn-ai-send').disabled = false;
    }
  }

  async function sendBoth(prompt) {
    isStreaming = true;
    document.getElementById('btn-ai-send').disabled = true;

    const pid1 = document.getElementById('p1-provider').value, m1 = document.getElementById('p1-model').value, k1 = document.getElementById('p1-key')?.value?.trim() || provider1.key || '';
    const pid2 = document.getElementById('p2-provider').value, m2 = document.getElementById('p2-model').value, k2 = document.getElementById('p2-key')?.value?.trim() || provider2.key || '';

    const hdr = document.createElement('div');
    hdr.style.cssText = 'text-align:center;font-size:10px;color:var(--accent);padding:5px;background:var(--surface0)33;border-radius:4px;';
    hdr.textContent = `⊕ Comparing ${PROVIDERS[pid1]?.name || pid1} vs ${PROVIDERS[pid2]?.name || pid2}`;
    document.getElementById('ai-messages').appendChild(hdr);
    scrollBottom();

    const [r1, r2] = await Promise.allSettled([
      callProviderStable(pid1, m1, k1, messages),
      callProviderStable(pid2, m2, k2, messages),
    ]);

    const resp1 = r1.status === 'fulfilled' ? r1.value.text : `Error: ${r1.reason?.message || 'failed'}`;
    const resp2 = r2.status === 'fulfilled' ? r2.value.text : `Error: ${r2.reason?.message || 'failed'}`;

    addCompareMsg(pid1, m1, resp1, pid2, m2, resp2);
    autoExecuteActionTextsNoThink([resp1, resp2]).catch(() => {});
    recordMessage('assistant', resp1 || resp2 || '');
    finishTask(resp1);

    isStreaming = false;
    document.getElementById('btn-ai-send').disabled = false;
  }

  async function streamResp(pid, model, key) {
    isStreaming = true;
    document.getElementById('btn-ai-send').disabled = true;
    const msgEl = beginAssistantTurn('Silva AI');
    appendThinkLine(msgEl, `Router: starting request`);
    appendThinkLine(msgEl, `Capabilities: TurboQuant=${capabilities.turboQuant ? 'ON' : 'OFF'} · TurboVec=${capabilities.turboVec ? 'ON' : 'OFF'} · Piper=${capabilities.piper ? 'ON' : 'OFF'} · Speed=${perfMode.toUpperCase()}`);
    
    try {
      const chain = fallbackChain(pid);
      let lastErr = null;
      if (thinkVerbosity() !== 'minimal') appendThinkLine(msgEl, `Router: fallback chain = ${chain.map(x => PROVIDERS[x]?.name || x).join(' → ')}`);

      for (let i = 0; i < chain.length; i++) {
        const curPid = chain[i];
        const lbl = msgEl.querySelector('.ai-msg-label');
        if (lbl) lbl.textContent = `${PROVIDERS[curPid]?.name || curPid} · ${model}`;
        let fullText = '';
        let progressChars = 0;
        let lastProgressAt = 0;

        try {
          appendThinkLine(msgEl, `Provider: trying ${PROVIDERS[curPid]?.name || curPid}`, 'provider-active');
          const ok = await ensureLocalUp(curPid);
          if (!ok) throw new Error('Provider not reachable');
          await getLimiter(curPid).run(async () => {
            const stream = streamProvider(curPid, model, key, messages, getMaxTokensFor(curPid));
            let started = false;

            for await (const chunk of stream) {
              if (!started) {
                started = true;
                appendThinkLine(msgEl, `Provider: streaming started`, 'provider-stream');
              }
              fullText += chunk;
              progressChars += chunk.length;
              const now = Date.now();
              if (thinkVerbosity() !== 'minimal' && (now - lastProgressAt) > 2000) {
                appendThinkLine(msgEl, `Provider: received ${progressChars} chars`, 'provider-stream');
                lastProgressAt = now;
              }
            }

            if (!started) throw new Error('No response from provider');
          });

          recordMessage('assistant', fullText);
          appendThinkLine(msgEl, `Provider: stream complete`, 'provider-stream');
          finishTask(fullText);
          finalizeAssistantTurn(msgEl, fullText, `${PROVIDERS[curPid]?.name || curPid} · ${model}`);
          return;
        } catch (e) {
          lastErr = e;
          markHealth(curPid, false, { reason: e.message || 'error' });
          appendThinkLine(msgEl, `Provider: failed (${e.message || 'error'})`, 'provider-active');
          if (i < chain.length - 1) appendThinkLine(msgEl, `Router: switching to ${PROVIDERS[chain[i + 1]]?.name || chain[i + 1]}`);
        }
      }

      throw lastErr || new Error('All providers failed');
    } catch (e) {
      let msg = e.message || 'Unknown error';
      if (msg.includes('401') || msg.includes('Unauthorized') || msg.includes('invalid_api_key')) msg = `Invalid API key for ${PROVIDERS[pid]?.name || pid}.`;
      else if (msg.includes('fetch') || msg.includes('ECONNREFUSED') || msg.includes('network')) {
        msg = PROVIDERS[pid]?.type === 'local' ? `${PROVIDERS[pid].name} not running. Start it first.` : 'Network error.';
      }
      appendThinkLine(msgEl, `Error: ${msg}`);
      finalizeAssistantTurn(msgEl, `⚠ ${msg}`, 'SILVA AI', { skipInsights: true });
      finishTask(null);
    } finally {
      isStreaming = false;
      document.getElementById('btn-ai-send').disabled = false;
    }
  }

  // ─── Provider call routing ───────────────────────────────────────────
  async function* streamProvider(pid, model, key, msgs, maxTok) {
    const sys = getSysPrompt();
    const max = typeof maxTok === 'number' && maxTok > 0 ? maxTok : 4096;

    if (pid === 'anthropic') {
      yield* streamAnthropic(key, model, msgs, sys, max);
    } else if (pid === 'google') {
      yield* streamGoogle(key, model, msgs, sys, max);
    } else if (PROVIDERS[pid]?.type === 'local') {
      yield* streamLocal(pid, model, msgs, sys, max);
    } else {
      // OpenAI and other OAI-compatible providers
      const urls = {
        openai: 'https://api.openai.com/v1/chat/completions',
        groq: 'https://api.groq.com/openai/v1/chat/completions',
        together: 'https://api.together.xyz/v1/chat/completions',
        mistral: 'https://api.mistral.ai/v1/chat/completions',
        perplexity: 'https://api.perplexity.ai/chat/completions'
      };
      yield* streamOAICompat(urls[pid], key, model, msgs, sys, max);
    }
  }

  async function* bufferedLineReader(reader, onStall) {
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      let result;
      try {
        result = await withTimeout(reader.read(), stability.streamStallMs);
      } catch (e) {
        try { onStall?.(e); } catch {}
        throw e;
      }
      const { done, value } = result;
      if (done) {
        if (buffer.trim()) yield buffer;
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep the last partial line in buffer
      for (const line of lines) {
        if (line.trim()) yield line;
      }
    }
  }

  async function* streamAnthropic(key, model, msgs, sys, max) {
    if (!key) throw new Error('No Anthropic API key.');
    for await (const line of proxyStreamLines({
      url: 'https://api.anthropic.com/v1/messages',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: { model, max_tokens: max, system: sys, messages: msgs.map(m => ({ role: m.role, content: m.content })), stream: true },
    })) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'content_block_delta' && data.delta?.text) yield data.delta.text;
        } catch {}
      }
    }
  }

  async function* streamOAICompat(url, key, model, msgs, sys, max) {
    if (!key && !url.includes('localhost') && !url.includes('127.0.0.1') && !url.includes('192.168.')) throw new Error('No API key.');
    for await (const line of proxyStreamLines({
      url,
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://127.0.0.1',
        ...(key ? { 'Authorization': `Bearer ${key}` } : {})
      },
      body: { model, max_tokens: max, messages: [{ role: 'system', content: sys }, ...msgs], stream: true },
    })) {
      if (line.trim() === 'data: [DONE]') break;
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          const delta = data.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {}
      }
    }
  }

  async function* streamGoogle(key, model, msgs, sys, max) {
    if (!key) throw new Error('No Google AI key.');
    for await (const line of proxyStreamLines({
      url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${key}`,
      headers: { 'Content-Type': 'application/json' },
      body: { systemInstruction: { parts: [{ text: sys }] }, contents: msgs.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })), generationConfig: { maxOutputTokens: max } },
    })) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) yield text;
        } catch {}
      }
    }
  }

  async function* streamLocal(pid, model, msgs, sys, max) {
    const ep = LOCAL_ENDPOINTS.find(e => e.id === pid) || Object.values(detectedLocal).find(d => d.url.includes(pid)) || LOCAL_ENDPOINTS.find(e => e.id === 'ollama');
    const base = detectedLocal[pid]?.url || ep?.url;
    if (!base) throw new Error(`${PROVIDERS[pid]?.name || pid} not running.`);

    const style = detectedLocal[pid]?.style || ep?.style || 'openai';
    const resolvedModel = await resolveLocalModelId(pid, model);
    const url = style === 'ollama' ? `${base}/api/chat` : `${base}/v1/chat/completions`;
    const body = style === 'ollama' 
      ? { model: resolvedModel || model, messages: [{ role: 'system', content: sys }, ...msgs], stream: true }
      : { model: resolvedModel || model, max_tokens: max, messages: [{ role: 'system', content: sys }, ...msgs], stream: true };

    let resolvePromise;
    let promise = new Promise((res) => { resolvePromise = res; });
    let isDone = false;
    let textBuffer = [];
    let streamError = null;

    const waitForDataOrStall = async () => {
      let t;
      try {
        await Promise.race([
          promise,
          new Promise((_, reject) => { t = setTimeout(() => reject(new Error('Stream stalled')), stability.streamStallMs); })
        ]);
      } finally {
        clearTimeout(t);
      }
    };

    const handle = window.silva.ai.proxyStream({ url, body }, 
      (chunk) => {
        // Parse the chunk based on style
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            if (style === 'ollama') {
              const data = JSON.parse(line);
              if (data.message?.content) textBuffer.push(data.message.content);
            } else {
              if (line.includes('[DONE]')) return;
              const jsonStr = line.replace(/^data: /, '').trim();
              if (!jsonStr) continue;
              const data = JSON.parse(jsonStr);
              const delta = data.choices?.[0]?.delta?.content;
              if (delta) textBuffer.push(delta);
            }
          } catch(e) {}
        }
        resolvePromise();
        promise = new Promise((res) => { resolvePromise = res; });
      },
      (err) => { streamError = new Error(err); isDone = true; resolvePromise(); },
      () => { isDone = true; resolvePromise(); }
    );

    try {
      while (!isDone || textBuffer.length > 0) {
        await waitForDataOrStall();
        while (textBuffer.length > 0) {
          yield textBuffer.shift();
        }
      }
      if (streamError) throw streamError;
    } catch (e) {
      handle?.cancel?.();
      throw e;
    }
  }

  async function callProvider(pid, model, key, msgs, maxTok) {
    const max = maxTok || 4096;
    const sys = getSysPrompt();

    if (PROVIDERS[pid]?.type === 'local') return callLocal(pid, model, msgs, sys, max);

    switch (pid) {
      case 'anthropic':  return callAnthropic(key, model, msgs, sys, max);
      case 'openai':     return callOAICompat('https://api.openai.com/v1/chat/completions', key, model, msgs, sys, max);
      case 'google':     return callGoogle(key, model, msgs, sys, max);
      case 'groq':       return callOAICompat('https://api.groq.com/openai/v1/chat/completions', key, model, msgs, sys, max);
      case 'together':   return callOAICompat('https://api.together.xyz/v1/chat/completions', key, model, msgs, sys, max);
      case 'mistral':    return callOAICompat('https://api.mistral.ai/v1/chat/completions', key, model, msgs, sys, max);
      case 'cohere':     return callCohere(key, model, msgs, sys, max);
      case 'perplexity': return callOAICompat('https://api.perplexity.ai/chat/completions', key, model, msgs, sys, max);
      default: throw new Error(`Unknown provider: ${pid}`);
    }
  }

  async function callAnthropic(key, model, msgs, sys, max) {
    if (!key) throw new Error('No Anthropic API key.');
    const res = await proxyJson({
      url: 'https://api.anthropic.com/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'Origin': 'http://127.0.0.1'
      },
      body: { model, max_tokens: max, system: sys, messages: msgs.map(m => ({ role: m.role, content: m.content })) }
    });
    return res.data?.content?.[0]?.text || '';
  }


  async function callOAICompat(url, key, model, msgs, sys, max) {
    if (!key && !url.includes('localhost') && !url.includes('127.0.0.1') && !url.includes('192.168.')) throw new Error('No API key. Get a free one from the provider.');
    const res = await proxyJson({
      url,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://127.0.0.1',
        ...(key ? { 'Authorization': `Bearer ${key}` } : {})
      },
      body: { model, max_tokens: max, messages: [{ role: 'system', content: sys }, ...msgs] }
    });
    return res.data?.choices?.[0]?.message?.content || '';
  }

  async function callGoogle(key, model, msgs, sys, max) {
    if (!key) throw new Error('No Google AI key. Get one free at aistudio.google.com');
    const res = await proxyJson({
      url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { systemInstruction: { parts: [{ text: sys }] }, contents: msgs.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })), generationConfig: { maxOutputTokens: max } }
    });
    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  async function callCohere(key, model, msgs, sys, max) {
    if (!key) throw new Error('No Cohere API key. Get one free at cohere.com');
    const hist = msgs.slice(0, -1).map(m => ({ role: m.role === 'assistant' ? 'CHATBOT' : 'USER', message: m.content }));
    const last = msgs[msgs.length - 1]?.content || '';
    const res = await proxyJson({
      url: 'https://api.cohere.ai/v1/chat',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: { model, message: last, chat_history: hist, preamble: sys, max_tokens: max }
    });
    return res.data?.text || '';
  }

  async function callLocal(pid, model, msgs, sys, max) {
    const ep = LOCAL_ENDPOINTS.find(e => e.id === pid) || Object.values(detectedLocal).find(d => d.url.includes(pid)) || LOCAL_ENDPOINTS.find(e => e.id === 'ollama');
    const base = detectedLocal[pid]?.url || ep?.url;
    if (!base) throw new Error(`${PROVIDERS[pid]?.name || pid} not running.`);

    const style = detectedLocal[pid]?.style || ep?.style || 'openai';
    const resolvedModel = await resolveLocalModelId(pid, model);
    const url = style === 'ollama' ? `${base}/api/chat` : `${base}/v1/chat/completions`;
    const body = style === 'ollama' 
      ? { model: resolvedModel || model, messages: [{ role: 'system', content: sys }, ...msgs], stream: false }
      : { model: resolvedModel || model, max_tokens: max, messages: [{ role: 'system', content: sys }, ...msgs], stream: false };

    const res = await window.silva.ai.proxyRequest({ url, method: 'POST', body });
    if (!res.success) throw new Error(`Cannot reach ${PROVIDERS[pid]?.name} at ${base}.`);
    
    if (style === 'ollama') {
      return res.data?.message?.content || '';
    } else {
      return res.data?.choices?.[0]?.message?.content || '';
    }
  }

  function getSysPrompt() {
    const t = window.EditorManager?.getActiveTab();
    const root = window.FileTreeManager?.getRootPath?.() || '';
    const fileLine = `File: ${t?.name || 'none'} | Lang: ${t?.language || 'none'}.`;
    const projectLine = root ? `ProjectRoot: ${root}.` : `ProjectRoot: none.`;
    const keyLine = projectCtxState.keyFiles?.length ? `KeyFiles: ${projectCtxState.keyFiles.slice(0, 4).join(', ')}.` : `KeyFiles: none sampled.`;
    const tree1 = (() => {
      try {
        const tree = window.FileTreeManager?.getTree?.() || [];
        if (!root || !tree?.length) return '';
        const txt = treeToLines(tree, 1, 60);
        return txt ? `ProjectTreeDepth1:\n${txt}` : '';
      } catch { return ''; }
    })();
    return [
      `You are Silva AI, an expert code assistant inside Silva IDE (desktop app, not a web chat).`,
      fileLine,
      projectLine,
      keyLine,
      tree1,
      `When ProjectRoot is set, assume the project is already loaded and you can ask for specific files by name/path.`,
      `When ProjectRoot is none, never fabricate repository names, stacks, folders, or architecture. Ask the user to open the local folder first.`,
      `Do not say you cannot access the local drive. Do not ask the user to "upload files".`,
      `Never claim a GitHub repo exists unless explicitly confirmed by user-provided path/tree in this IDE context.`,
      `Do not ask "Should I proceed?" If the user asks for a plan or says "yes/all", proceed with a concrete, step-by-step implementation plan immediately.`,
      `Do not propose big framework migrations unless the user explicitly asked for a migration. Prefer incremental changes based on evidence from the project context.`,
      `When asked to implement changes, output file-ready blocks so the IDE can apply them. Use code blocks that start with "FILE: relative/path.ext" on the first line to write files. Use one-line command blocks for commands to run.`,
      `If the user says "do all", "yes all", or "implement", start by writing the first concrete files/commands instead of asking which step to start.`,
      `Capabilities (current toggles): TurboQuant=${capabilities.turboQuant ? 'ON' : 'OFF'}, TurboVec=${capabilities.turboVec ? 'ON' : 'OFF'}, Piper=${capabilities.piper ? 'ON' : 'OFF'}. Do not claim TurboVec is installed/active unless TurboVec is ON.`,
      `Write clean, production-quality code. Use markdown with fenced code blocks.`,
    ].join(' ');
  }

  // ─── Timeline ────────────────────────────────────────────────────────
  function setPresent(task) {
    tasks.present = { ...task, time: new Date().toLocaleTimeString() };
    renderTimeline();
  }

  function finishTask(result) {
    if (tasks.present) {
      tasks.past.unshift({ ...tasks.present, result: result?.slice(0, 100) || '', done: new Date().toLocaleTimeString() });
      if (tasks.past.length > 50) tasks.past.pop();
      tasks.present = null;
    }
    if (tasks.future.length > 0) {
      const nxt = tasks.future.shift();
      tasks.present = { ...nxt, time: new Date().toLocaleTimeString() };
    }
    renderTimeline();
  }

  function queueTask() {
    const inp = document.getElementById('tl-queue-input');
    const txt = inp.value.trim();
    if (!txt) return;
    tasks.future.push({ id: Date.now(), label: txt });
    inp.value = '';
    renderTimeline();
    window.notify?.('Task queued', 'success');
  }

  function removeFuture(id) { tasks.future = tasks.future.filter(t => t.id !== id); renderTimeline(); }

  function renderTimeline() {
    // Past
    const pastEl = document.getElementById('tl-past-list');
    pastEl.innerHTML = tasks.past.length === 0 ? '<div class="tl-empty">No completed tasks</div>' :
      tasks.past.slice(0, 25).map(t => `
        <div class="tl-item tl-done">
          <span class="tl-check">✓</span>
          <div class="tl-body">
            <div class="tl-label">${esc(t.label)}</div>
            ${t.result ? `<div class="tl-result">${esc(t.result)}</div>` : ''}
            <div class="tl-meta">${t.done || t.time} · ${t.provider || '?'}</div>
          </div>
        </div>`).join('');

    // Present
    const nowEl = document.getElementById('tl-now-content');
    if (!tasks.present) {
      nowEl.innerHTML = '<div class="tl-empty">No active task</div>';
    } else {
      nowEl.innerHTML = `
        <div class="tl-item tl-active-task">
          <div class="tl-pulse"></div>
          <div class="tl-body" style="flex:1">
            <div class="tl-label">${esc(tasks.present.label)}</div>
            <div class="tl-meta">Started ${tasks.present.time} · ${tasks.present.provider || '?'}</div>
            <div class="tl-progress"><div class="tl-progress-bar"></div></div>
          </div>
        </div>`;
    }

    // Future
    const futEl = document.getElementById('tl-future-list');
    futEl.innerHTML = tasks.future.length === 0 ? '<div class="tl-empty">No queued tasks</div>' :
      tasks.future.map((t, i) => `
        <div class="tl-item tl-queued">
          <span class="tl-num">${i + 1}</span>
          <div class="tl-body" style="flex:1"><div class="tl-label">${esc(t.label)}</div></div>
          <button class="tl-remove" onclick="window.AIManager._rm(${t.id})">×</button>
        </div>`).join('');

    renderPredictions();
  }

  function pushActivity(type, meta = {}) {
    activity.unshift({ type, meta, at: Date.now() });
    if (activity.length > 50) activity.pop();
  }

  function hookActivity() {
    if (window.silva?.on) {
      window.silva.on('folder:opened', ({ path }) => pushActivity('folder:opened', { path }));
      window.silva.on('file:opened', ({ path }) => pushActivity('file:opened', { path }));
    }

    const tryHookEditor = () => {
      if (!window.EditorManager?.on) return false;
      window.EditorManager.on('file-saved', (p) => pushActivity('file:saved', { path: p }));
      return true;
    };
    if (!tryHookEditor()) {
      let tries = 0;
      const t = setInterval(() => {
        tries += 1;
        if (tryHookEditor() || tries > 20) clearInterval(t);
      }, 500);
    }
  }

  function computePredictions() {
    const preds = [];

    const root = window.FileTreeManager?.getRootPath?.();
    if (!root) {
      preds.push('Next likely action: Open a folder');
    } else {
      const lastFile = activity.find(a => a.type === 'file:opened')?.meta?.path;
      if (lastFile) preds.push(`Next likely action: Edit ${lastFile.split(/[/\\\\]/).pop()}`);
    }

    if (!tasks.present && tasks.future.length > 0) {
      preds.push(`Next queued task: ${tasks.future[0].label}`);
    }

    const pids = [document.getElementById('p1-provider')?.value, document.getElementById('p2-provider')?.value].filter(Boolean);
    for (const pid of pids) {
      const h = providerHealth[pid];
      if (h?.ok === false && h.fails >= 1) preds.push(`${PROVIDERS[pid]?.name || pid} forecast: unstable (recent failures)`);
      const lim = limiterByProvider.get(pid)?.stats?.();
      if (lim?.queued > 0) preds.push(`${PROVIDERS[pid]?.name || pid} forecast: queueing (${lim.queued} pending)`);
    }

    if (preds.length === 0) preds.push('No predictions yet');
    return preds.slice(0, 6);
  }

  function renderPredictions() {
    const el = document.getElementById('tl-predictions');
    if (!el) return;
    const preds = computePredictions();
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <div style="font-size:10px;color:var(--overlay0);font-weight:800;letter-spacing:1px">🔮 PREDICTIONS</div>
        <div style="flex:1"></div>
        <button id="btn-pred-speak" class="icon-btn" title="Speak predictions">🎙</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px">
        ${preds.map(p => `<div style="font-size:11px;color:var(--subtext1)">• ${esc(p)}</div>`).join('')}
      </div>
    `;
    el.querySelector('#btn-pred-speak')?.addEventListener('click', () => {
      const text = preds.join('. ');
      const u = new SpeechSynthesisUtterance(text);
      try { speechSynthesis.cancel(); speechSynthesis.speak(u); } catch {}
    });
  }

  // ─── UI helpers ──────────────────────────────────────────────────────
  function setDot(n, state) {
    const dot = document.getElementById(`p${n}-dot`);
    dot.className = 'status-dot dot-' + state;
    if (n === 1) provider1.status = state;
    else provider2.status = state;
  }

  function setActive(which) {
    activeProvider = which;
    document.querySelectorAll('.use-btn').forEach(b => b.classList.remove('use-btn-active'));
    if (which === 1) document.getElementById('btn-use-p1').classList.add('use-btn-active');
    else if (which === 2) document.getElementById('btn-use-p2').classList.add('use-btn-active');
    else if (which === 'both') document.getElementById('btn-use-both').classList.add('use-btn-active');
    else if (which === 'collab') document.getElementById('btn-use-collab').classList.add('use-btn-active');
    window.silva?.store?.set('activeMode', which);
  }

  function swapProviders() {
    const tmp = { ...provider1 };
    provider1 = { ...provider2 };
    provider2 = { ...tmp };
    document.getElementById('p1-provider').value = provider1.id;
    document.getElementById('p2-provider').value = provider2.id;
    document.getElementById('p1-key').value = provider1.key || '';
    document.getElementById('p2-key').value = provider2.key || '';
    updateModelSelect(1); updateModelSelect(2);
    updateKeyRow(1); updateKeyRow(2);
    updateLocalMessages();
    updateActiveLabels();
    window.notify?.('Providers swapped', 'info');
  }

  function updateActiveLabels() {
    const n1 = PROVIDERS[document.getElementById('p1-provider')?.value || provider1.id]?.name || '';
    const n2 = PROVIDERS[document.getElementById('p2-provider')?.value || provider2.id]?.name || '';
    const lbl1 = document.getElementById('active-p1-label');
    const lbl2 = document.getElementById('active-p2-label');
    if (lbl1) lbl1.textContent = n1.split(' ')[0] || '—';
    if (lbl2) lbl2.textContent = n2.split(' ')[0] || '—';
  }

  function addUserMsg(text) {
    const el = mkMsgEl('user', 'YOU', esc(text));
    document.getElementById('ai-messages').appendChild(el);
    scrollBottom();
    clearThinking();
    // Clear suggestions on new user message
    const sug = document.getElementById('ai-suggestions');
    if (sug) { sug.innerHTML = ''; sug.classList.add('hidden'); }
  }

  function addAiMsg(text, label, opts = {}) {
    const clean = sanitizeOutput(text);
    const el = mkMsgEl('assistant', label || 'SILVA AI', md(clean));
    el.dataset.raw = clean;
    
    // Add Copy All button
    const copyAllBtn = document.createElement('button');
    copyAllBtn.className = 'copy-all-msg-btn';
    copyAllBtn.innerHTML = '📋 Copy All';
    copyAllBtn.onclick = () => {
      navigator.clipboard.writeText(clean);
      copyAllBtn.textContent = '✓ Copied';
      setTimeout(() => copyAllBtn.innerHTML = '📋 Copy All', 2000);
    };
    el.querySelector('.ai-message-content').appendChild(copyAllBtn);

    document.getElementById('ai-messages').appendChild(el);
    scrollBottom();
    wireCodeBtns(el);
    wireSpeakBtn(el);
    
    if (!opts.skipInsights) showJarviceInsights(clean);
  }

  function showJarviceInsights(resp) {
    const sug = document.getElementById('ai-suggestions');
    if (!sug) return;
    if (document.getElementById('ai-panel')?.classList.contains('ai-suggestions-hidden')) return;
    sug.classList.remove('hidden');

    const lower = (resp || '').toLowerCase();
    const root = window.FileTreeManager?.getRootPath?.() || '';
    const suggestions = [];
    const add = (s) => { if (s && !suggestions.includes(s) && suggestions.length < 5) suggestions.push(s); };

    if (lower.includes('error') || lower.includes('bug') || lower.includes('fail')) {
      add('Show the top 3 risks');
      add('Find concrete fixes');
      add('Add regression tests');
      add('Identify root cause');
    }
    if (lower.includes('security') || lower.includes('vulnerab') || lower.includes('threat')) {
      add('Do a security audit');
      add('Threat model this');
    }
    if (lower.includes('tauri') || lower.includes('rust') || lower.includes('cargo')) {
      add('Review Rust/Tauri build');
      add('Check Cargo dependencies');
    }
    if (lower.includes('typescript') || lower.includes('tsconfig') || lower.includes('vite')) {
      add('Review TS/Vite config');
      add('Check bundler settings');
    }
    if (lower.includes('architecture') || lower.includes('layer') || lower.includes('module') || lower.includes('agent')) {
      add('Draw module diagram');
      add('Propose refactor plan');
    }

    add('Summarize key entrypoints');
    add('List TODOs and placeholders');
    if (root) add('Search for failing scripts');

    while (suggestions.length < 5) add(['Explain further', 'Give examples', 'Optimize performance', 'Improve UX', 'Add docs'][suggestions.length] || 'Explain further');

    sug.innerHTML =
      `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">` +
      `<div style="font-size:9px;color:var(--overlay0);font-weight:700;letter-spacing:1px">JARVICE FOLLOW-UPS</div>` +
      `<div style="flex:1"></div>` +
      `<button class="icon-btn" id="btn-hide-followups" title="Hide">×</button>` +
      `</div>` +
      `<div style="display:flex;flex-wrap:wrap;gap:5px">` +
      suggestions.map(s => `<button class="suggestion-chip" onclick="window.AIManager.ask('${s.replace(/'/g, "\\'")}')">${s}</button>`).join('') +
      `</div>`;
    sug.querySelector('#btn-hide-followups')?.addEventListener('click', () => {
      document.getElementById('ai-panel')?.classList.add('ai-suggestions-hidden');
      window.silva?.store?.set('ui.aiSuggestionsHidden', true);
      sug.classList.add('hidden');
    });
  }

  function ask(text) {
    document.getElementById('ai-input').value = text;
    doSend(false);
  }

  function addCompareMsg(pid1, m1, resp1, pid2, m2, resp2) {
    const w = document.createElement('div');
    w.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
    const c1 = sanitizeOutput(resp1);
    const c2 = sanitizeOutput(resp2);
    w.innerHTML = `
      <div class="cmp-block"><div class="cmp-lbl" style="color:var(--blue)">${esc(PROVIDERS[pid1]?.name||pid1)} · ${esc(m1)}</div><div class="ai-message-content">${md(c1)}</div></div>
      <div class="cmp-divider">— vs —</div>
      <div class="cmp-block"><div class="cmp-lbl" style="color:var(--mauve)">${esc(PROVIDERS[pid2]?.name||pid2)} · ${esc(m2)}</div><div class="ai-message-content">${md(c2)}</div></div>`;
    const blocks = w.querySelectorAll('.cmp-block .ai-message-content');
    const addCopy = (el, txt) => {
      const b = document.createElement('button');
      b.className = 'copy-all-msg-btn';
      b.innerHTML = '📋 Copy All';
      b.onclick = () => {
        navigator.clipboard.writeText(txt);
        b.textContent = '✓ Copied';
        setTimeout(() => b.innerHTML = '📋 Copy All', 2000);
      };
      el.appendChild(b);
    };
    if (blocks[0]) addCopy(blocks[0], c1);
    if (blocks[1]) addCopy(blocks[1], c2);
    document.getElementById('ai-messages').appendChild(w);
    scrollBottom();
    wireCodeBtns(w);
  }

  function wireCodeBtns(container) {
    container.querySelectorAll('pre').forEach(pre => {
      pre.style.position = 'relative';
      const code = pre.textContent.trim();
      const cb = document.createElement('button');
      cb.textContent = 'Copy';
      cb.style.cssText = 'position:absolute;top:4px;right:4px;background:var(--surface1);border:none;color:var(--subtext1);padding:2px 7px;border-radius:3px;font-size:10px;cursor:pointer;opacity:0;transition:opacity .2s';
      const ib = document.createElement('button');
      ib.textContent = 'Insert';
      ib.style.cssText = 'position:absolute;top:4px;right:50px;background:var(--accent);border:none;color:var(--crust);padding:2px 7px;border-radius:3px;font-size:10px;cursor:pointer;opacity:0;transition:opacity .2s';
      const rb = document.createElement('button');
      rb.textContent = 'Run';
      rb.style.cssText = 'position:absolute;top:4px;right:104px;background:var(--green);border:none;color:var(--crust);padding:2px 7px;border-radius:3px;font-size:10px;cursor:pointer;opacity:0;transition:opacity .2s';

      const wb = document.createElement('button');
      wb.textContent = 'Write';
      wb.style.cssText = 'position:absolute;top:4px;right:152px;background:var(--yellow);border:none;color:var(--crust);padding:2px 7px;border-radius:3px;font-size:10px;cursor:pointer;opacity:0;transition:opacity .2s';

      const isPatchBlock = /^\s*\*\*\*\s*Begin Patch\b/m.test(code);
      const pb = document.createElement('button');
      pb.textContent = 'Patch';
      pb.style.cssText = 'position:absolute;top:4px;right:206px;background:var(--peach);border:none;color:var(--crust);padding:2px 7px;border-radius:3px;font-size:10px;cursor:pointer;opacity:0;transition:opacity .2s';

      const isSingleLineCmd = (() => {
        const s = code.trim();
        if (!s || s.includes('\n') || s.length > 220) return false;
        return /^(npm|pnpm|yarn|bun|node|python|py|pip|git|cargo|go|dotnet|java|mvn|gradle|rustc)\b/i.test(s) || /^\.\\/.test(s);
      })();

      const parseFileBlock = (() => {
        const lines = code.split(/\r?\n/);
        const head = (lines[0] || '').trim();
        const m = head.match(/^(?:\/\/|#)?\s*FILE\s*:\s*(.+)\s*$/i);
        if (!m) return null;
        const p = String(m[1] || '').trim().replace(/^"+|"+$/g, '');
        const body = lines.slice(1).join('\n');
        if (!p) return null;
        return { path: p, content: body };
      })();

      pre.appendChild(cb);
      pre.appendChild(ib);
      if (isSingleLineCmd) pre.appendChild(rb);
      if (parseFileBlock) pre.appendChild(wb);
      if (isPatchBlock) pre.appendChild(pb);
      pre.addEventListener('mouseenter', () => { cb.style.opacity = '1'; ib.style.opacity = '1'; });
      pre.addEventListener('mouseleave', () => { cb.style.opacity = '0'; ib.style.opacity = '0'; });
      cb.addEventListener('click', () => { navigator.clipboard.writeText(code); cb.textContent = '✓'; setTimeout(() => cb.textContent = 'Copy', 1400); });

      pre.addEventListener('mouseenter', () => {
        if (isSingleLineCmd) rb.style.opacity = '1';
        if (parseFileBlock) wb.style.opacity = '1';
        if (isPatchBlock) pb.style.opacity = '1';
      });
      pre.addEventListener('mouseleave', () => {
        if (isSingleLineCmd) rb.style.opacity = '0';
        if (parseFileBlock) wb.style.opacity = '0';
        if (isPatchBlock) pb.style.opacity = '0';
      });

      ib.addEventListener('click', () => {
        try {
          const insertBody = parseFileBlock ? (parseFileBlock.content || '') : code;
          if (!window.EditorManager || typeof window.EditorManager.insertText !== 'function') {
            pendingInserts.push(insertBody);
            window.notify?.('Editor not ready yet — insert queued.', 'info');
            logAction('insert', '(queued)', true);
            flushPendingInserts();
            return;
          }
          if (!window.EditorManager.getActiveTab?.()) window.EditorManager.newFile?.();
          setTimeout(() => {
            window.EditorManager.insertText(insertBody);
            window.notify?.('Inserted', 'success');
            logAction('insert', '(editor)', true);
          }, 30);
        } catch (e) {
          window.notify?.(`Insert failed: ${e.message || e}`, 'error');
          logAction('insert', '(editor)', false, e?.message || String(e));
        }
      });

      if (isSingleLineCmd) {
        rb.addEventListener('click', async () => {
          try {
            const ok = await window.TerminalManager?.run?.(code.trim());
            if (ok) window.notify?.('Command sent to terminal', 'success');
            else window.notify?.('Terminal not ready (start terminal first).', 'warning');
          } catch (e) {
            window.notify?.(`Run failed: ${e.message || e}`, 'error');
          }
        });
      }

      if (parseFileBlock) {
        wb.addEventListener('click', async () => {
          try {
            if (!window.silva?.fs?.writeFile) { window.notify?.('Write unavailable (IPC not ready).', 'warning'); return; }
            const root = window.FileTreeManager?.getRootPath?.() || '';
            if (!root) { window.notify?.('Open a project folder first.', 'warning'); return; }
            const rel = parseFileBlock.path;
            const abs = /^[A-Za-z]:[\\/]/.test(rel) ? rel : `${root.replace(/[\\/]+$/,'')}\\${rel.replace(/^[/\\\\]+/,'')}`;
            const r = await window.silva.fs.writeFile(abs, parseFileBlock.content || '');
            if (!r?.success) { window.notify?.(`Write failed: ${r?.error || 'error'}`, 'error'); return; }
            window.notify?.(`Wrote: ${rel}`, 'success');
            logAction('write_file', rel, true);
            window.FileTreeManager?.refreshTree?.();
            window.EditorManager?.openFileByPath?.(abs);
          } catch (e) {
            window.notify?.(`Write failed: ${e.message || e}`, 'error');
            logAction('write_file', parseFileBlock.path, false, e?.message || String(e));
          }
        });
      }

      if (isPatchBlock) {
        pb.addEventListener('click', async () => {
          try {
            const root = window.FileTreeManager?.getRootPath?.() || '';
            if (!root) { window.notify?.('Open a project folder first.', 'warning'); return; }
            const r = await toolProtocol.apply_patch({ patch: code });
            if (!r?.success) { window.notify?.(`Patch failed: ${r?.error || 'error'}`, 'error'); return; }
            const files = (r.applied || []).map(x => x.file).filter(Boolean);
            window.notify?.(files.length ? `Patched: ${files.join(', ')}` : 'Patch applied', 'success');
            logAction('apply_patch', files.join(', ') || 'patch', true);
            window.FileTreeManager?.refreshTree?.();
            const firstAbs = r.applied?.[0]?.abs;
            if (firstAbs) window.EditorManager?.openFileByPath?.(firstAbs);
          } catch (e) {
            window.notify?.(`Patch failed: ${e.message || e}`, 'error');
            logAction('apply_patch', 'patch', false, e?.message || String(e));
          }
        });
      }
    });
  }

  function sysMsg(text) {
    const el = document.createElement('div');
    el.style.cssText = 'text-align:center;font-size:10px;color:var(--overlay1);padding:5px 8px;background:var(--surface0)22;border-radius:4px;';
    el.textContent = text;
    document.getElementById('ai-messages').appendChild(el);
    scrollBottom();
  }

  function getProjectRootSafe() {
    return window.FileTreeManager?.getRootPath?.() || '';
  }

  function historyKey(rootPath) {
    const base = (rootPath || '__global__').toLowerCase();
    const compact = base.replace(/[^a-z0-9._-]+/g, '_').slice(0, 180);
    return `ai.history.${compact}`;
  }

  function compactMessageContent(role, content) {
    let c = String(content || '');
    if (role === 'user') {
      c = c.replace(/\[IDE_PROJECT_CONTEXT\][\s\S]*?\[END_IDE_PROJECT_CONTEXT\]/g, '').trim();
    }
    if (c.length > 12000) c = c.slice(0, 12000) + '\n...(truncated)';
    return c;
  }

  function recordMessage(role, content) {
    messages.push({ role, content });
    scheduleHistorySave();
  }

  function scheduleHistorySave() {
    if (isRestoringHistory || !window.silva?.store) return;
    if (historySaveTimer) clearTimeout(historySaveTimer);
    historySaveTimer = setTimeout(() => { saveHistoryNow().catch(() => {}); }, 450);
  }

  async function saveHistoryNow() {
    if (isRestoringHistory || !window.silva?.store) return;
    const root = getProjectRootSafe();
    const key = historyKey(root);
    const compactMessages = messages.slice(-120).map(m => ({
      role: m.role,
      content: compactMessageContent(m.role, m.content),
    })).filter(m => m.content);
    await window.silva.store.set(key, {
      root,
      updatedAt: Date.now(),
      activeMode: activeProvider,
      messages: compactMessages,
    });
    if (root) await window.silva.store.set('ai.lastProjectRoot', root);
  }

  async function restoreHistoryForRoot(root, announce = false) {
    if (!window.silva?.store) return false;
    const key = historyKey(root);
    const data = await window.silva.store.get(key, null);
    if (!data || !Array.isArray(data.messages) || data.messages.length === 0) return false;

    isRestoringHistory = true;
    try {
      messages.length = 0;
      const box = document.getElementById('ai-messages');
      if (box) box.innerHTML = '';
      clearThinking();

      for (const m of data.messages) {
        if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
        const content = String(m.content || '');
        if (!content) continue;
        messages.push({ role: m.role, content });
        if (m.role === 'user') addUserMsg(content);
        else addAiMsg(content, 'SILVA AI', { skipInsights: true });
      }

      if (announce) {
        const label = root ? root.split(/[/\\]/).pop() : 'last session';
        sysMsg(`↺ Continued: ${label}`);
      }
      if (typeof data.activeMode !== 'undefined') setActive(data.activeMode);
      return true;
    } finally {
      isRestoringHistory = false;
    }
  }

  async function continueFromLast(announce = false) {
    const root = getProjectRootSafe();
    if (await restoreHistoryForRoot(root, announce)) return true;
    const lastRoot = await window.silva?.store?.get?.('ai.lastProjectRoot', '');
    if (lastRoot && await restoreHistoryForRoot(lastRoot, announce)) return true;
    if (announce) sysMsg('No previous chat history found for this project yet.');
    return false;
  }

  function addErrMsg(text) {
    const el = document.createElement('div');
    el.style.cssText = 'background:var(--red)15;border:1px solid var(--red)40;border-radius:4px;padding:8px;font-size:12px;color:var(--red);';
    el.textContent = '⚠ ' + text;
    document.getElementById('ai-messages').appendChild(el);
    scrollBottom();
  }

  function addTyping() {
    const el = document.createElement('div');
    el.className = 'ai-typing';
    el.innerHTML = '<div class="ai-dot"></div><div class="ai-dot"></div><div class="ai-dot"></div>';
    document.getElementById('ai-messages').appendChild(el);
    scrollBottom();
    return el;
  }

  function mkMsgEl(role, label, html) {
    const el = document.createElement('div');
    el.className = `ai-message ${role}`;
    const speakBtn = role === 'assistant'
      ? `<button class="ai-speak-btn" title="Speak" style="margin-left:auto;background:var(--surface1);border:none;color:var(--subtext1);padding:2px 8px;border-radius:999px;font-size:11px;cursor:pointer">Speak</button>`
      : '';
    const thinking = role === 'assistant'
      ? `
        <div class="ai-think" style="margin:4px 0 6px;background:var(--mantle);border:1px solid var(--surface0);border-radius:6px;overflow:hidden">
          <button class="ai-think-toggle" type="button" style="width:100%;display:flex;align-items:center;gap:8px;padding:6px 8px;background:transparent;border:none;color:var(--overlay0);font-size:10px;font-weight:800;letter-spacing:1px;cursor:pointer">
            <span class="ai-think-caret">▶</span>
            <span class="ai-think-title">THINKING</span>
            <span style="flex:1"></span>
            <span class="ai-think-state" style="font-weight:700;color:var(--subtext1)">HIDDEN</span>
          </button>
          <div class="ai-think-body" style="display:none;padding:8px;white-space:pre-wrap;overflow-wrap:anywhere;font-family:var(--font-mono);font-size:10px;color:var(--subtext1);border-top:1px solid var(--surface0)"></div>
        </div>`
      : '';
    el.innerHTML =
      `<div class="ai-message-role" style="display:flex;align-items:center;gap:8px"><span class="ai-msg-label">${label}</span>${speakBtn}</div>` +
      thinking +
      `<div class="ai-message-content" style="position:relative">${html}</div>`;
    if (role === 'assistant') wireThinkingToggle(el);
    return el;
  }

  function wireThinkingToggle(msgEl) {
    const btn = msgEl.querySelector('.ai-think-toggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const body = msgEl.querySelector('.ai-think-body');
      const caret = msgEl.querySelector('.ai-think-caret');
      const state = msgEl.querySelector('.ai-think-state');
      if (!body || !caret || !state) return;
      const open = body.style.display !== 'none';
      if (open) {
        body.style.display = 'none';
        caret.textContent = '▶';
        state.textContent = 'HIDDEN';
      } else {
        body.style.display = '';
        caret.textContent = '▼';
        state.textContent = 'OPEN';
      }
    });
  }

  function setThinkingOpen(msgEl, open) {
    const body = msgEl.querySelector('.ai-think-body');
    const caret = msgEl.querySelector('.ai-think-caret');
    const state = msgEl.querySelector('.ai-think-state');
    if (!body || !caret || !state) return;
    if (open) {
      body.style.display = '';
      caret.textContent = '▼';
      state.textContent = 'OPEN';
    } else {
      body.style.display = 'none';
      caret.textContent = '▶';
      state.textContent = 'HIDDEN';
    }
  }

  function appendThinkLine(msgEl, line, key = null) {
    const body = msgEl.querySelector('.ai-think-body');
    if (!body) return null;
    const ts = new Date().toLocaleTimeString();
    if (key) {
      const existing = body.querySelector(`[data-think-key="${key}"]`);
      if (existing) { existing.textContent = `[${ts}] ${line}`; return existing; }
    }
    const div = document.createElement('div');
    if (key) div.dataset.thinkKey = key;
    div.textContent = `[${ts}] ${line}`;
    body.appendChild(div);
    return div;
  }

  function beginAssistantTurn(label) {
    const msgEl = mkMsgEl('assistant', label || 'SILVA AI', '');
    const contentEl = msgEl.querySelector('.ai-message-content');
    if (contentEl) contentEl.style.display = 'none';
    setThinkingOpen(msgEl, true);
    document.getElementById('ai-messages').appendChild(msgEl);
    scrollBottom();
    return msgEl;
  }

  function finalizeAssistantTurn(msgEl, text, label, { skipInsights = false } = {}) {
    const clean = sanitizeOutput(text);
    const lbl = msgEl?.querySelector('.ai-msg-label');
    if (lbl && label) lbl.textContent = label;
    const contentEl = msgEl.querySelector('.ai-message-content');
    if (contentEl) {
      contentEl.style.display = '';
      contentEl.innerHTML = md(clean);
    }
    msgEl.dataset.raw = clean;
    setThinkingOpen(msgEl, false);

    const copyAllBtn = document.createElement('button');
    copyAllBtn.className = 'copy-all-msg-btn';
    copyAllBtn.innerHTML = '📋 Copy All';
    copyAllBtn.onclick = () => {
      navigator.clipboard.writeText(clean);
      copyAllBtn.textContent = '✓ Copied';
      setTimeout(() => copyAllBtn.innerHTML = '📋 Copy All', 2000);
    };
    msgEl.querySelector('.ai-message-content')?.appendChild(copyAllBtn);

    wireCodeBtns(msgEl);
    wireSpeakBtn(msgEl);
    if (!skipInsights) showJarviceInsights(clean);
    autoExecuteActionBlocks(msgEl, clean).catch((e) => {
      appendThinkLine(msgEl, `Executor: failed (${e?.message || e})`);
    });
    scrollBottom();
  }

  let speaking = { active: false, el: null };
  function stripForSpeech(text) {
    return (text || '')
      .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/^#+\s+/gm, '')
      .replace(/^\s*[-*•]\s+/gm, '')
      .replace(/\|/g, ' ')
      .replace(/[·•]/g, ' ')
      .replace(/[—–]/g, ' ')
      .replace(/-{2,}/g, ' ')
      .replace(/#/g, '')
      .replace(/\s*[:;,.!?]\s*/g, (m) => m.trim() + ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function sanitizeOutput(text) {
    const s = (text || '')
      .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
      .replace(/^\s*<thought>.*$/gmi, '')
      .replace(/^\s*<\/thought>\s*$/gmi, '')
      .trim();

    const lines = s
      .replace(/^.*(cannot\s+directly\s+access\s+your\s+local|can't\s+access\s+your\s+local|please\s+upload\s+your\s+project|please\s+upload\s+your\s+files).*(\r?\n|$)/gmi, '')
      .replace(/^.*\bI am your expert code assistant\b.*(\r?\n|$)/gmi, '')
      .replace(/^.*\bHow can I help you\b.*(\r?\n|$)/gmi, '')
      .split(/\r?\n/);
    const out = [];
    let tagSeen = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) { out.push(line); continue; }
      if (/^silva ai\s+—\s+.+responding together\.\s*$/i.test(trimmed)) {
        if (tagSeen) continue;
        tagSeen = true;
        out.push(trimmed);
        continue;
      }
      out.push(line);
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function speakText(el) {
    const btn = el.querySelector('.ai-speak-btn');
    const content = el.querySelector('.ai-message-content');
    if (!btn || !content) return;

    const text = stripForSpeech(el.dataset.raw || content.innerText || content.textContent || '');
    if (!text) return;

    if (speaking.active) {
      const same = speaking.el === el;
      try { speechSynthesis.cancel(); } catch {}
      if (speaking.el) {
        const prevBtn = speaking.el.querySelector('.ai-speak-btn');
        if (prevBtn) prevBtn.textContent = 'Speak';
      }
      speaking = { active: false, el: null };
      if (same) return;
    }

    const u = new SpeechSynthesisUtterance(text);
    try { u.lang = navigator.language || 'en-US'; } catch {}
    u.rate = 1.0;
    speaking = { active: true, el };
    btn.textContent = 'Stop';
    u.onend = () => {
      speaking = { active: false, el: null };
      btn.textContent = 'Speak';
    };
    u.onerror = () => {
      speaking = { active: false, el: null };
      btn.textContent = 'Speak';
    };
    try { speechSynthesis.speak(u); } catch {}
  }

  function wireSpeakBtn(msgEl) {
    const btn = msgEl.querySelector('.ai-speak-btn');
    if (!btn) return;
    btn.addEventListener('click', () => speakText(msgEl));
  }

  function md(text) {
    const s = sanitizeOutput(text);
    return (s || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/```(\w+)?\n([\s\S]*?)```/g, (_,lang,code) => `<pre><code class="language-${lang||'text'}">${code.trim()}</code></pre>`)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/^### (.+)$/gm,'<h3 style="font-size:12px;color:var(--blue);margin:6px 0 3px">$1</h3>')
      .replace(/^## (.+)$/gm,'<h2 style="font-size:13px;color:var(--blue);margin:8px 0 3px">$1</h2>')
      .replace(/^# (.+)$/gm,'<h1 style="font-size:14px;color:var(--blue);margin:8px 0 4px">$1</h1>')
      .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,'<em>$1</em>')
      .replace(/^[-*] (.+)$/gm,'<li style="margin:2px 0;padding-left:8px;list-style:disc inside">$1</li>')
      .replace(/\n\n/g,'</p><p style="margin:5px 0">')
      .replace(/\n/g,'<br>');
  }
  function esc(t) { return (t||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function scrollBottom() { const m=document.getElementById('ai-messages'); if(m) m.scrollTop=m.scrollHeight; }
  function clearChat() {
    messages.length = 0;
    document.getElementById('ai-messages').innerHTML = '';
    sysMsg('Chat cleared. How can I help?');
    scheduleHistorySave();
  }
  function toggle() { isOpen ? hide() : show(); }
  function show() { isOpen=true; document.getElementById('ai-panel').classList.remove('hidden'); document.getElementById('app').classList.add('ai-open'); document.getElementById('ai-input')?.focus(); }
  function hide() { isOpen=false; document.getElementById('ai-panel').classList.add('hidden'); document.getElementById('app').classList.remove('ai-open'); }
  function setContext(text, label) { document.getElementById('ai-context-text').textContent = label||text.slice(0,60); document.getElementById('ai-context-indicator').classList.remove('hidden'); }

  async function loadProviderSettings() {
    if (!window.silva) { populateProviders(); sysMsg('👋 Silva AI ready. Click ⟳ Scan Local to detect Ollama/Jan/LM Studio, or enter API keys.'); return; }
    try {
      const vals = await Promise.all(['p1Id','p1Model','p1Key','p2Id','p2Model','p2Key','activeMode','ui.aiControlsHidden','ui.aiSuggestionsHidden'].map(k => window.silva.store.get(k, '')));
      if (vals[0]) provider1 = { id: vals[0], model: vals[1]||'', key: vals[2]||'', status: 'unchecked' };
      if (vals[3]) provider2 = { id: vals[3], model: vals[4]||'', key: vals[5]||'', status: 'unchecked' };
      if (!vals[0] && !vals[3]) {
        provider1 = { id: 'lmstudio', model: 'qwen3.6', key: '', status: 'unchecked' };
        provider2 = { id: 'jan', model: 'gemma-4', key: '', status: 'unchecked' };
        await Promise.all([
          window.silva.store.set('p1Id', provider1.id),
          window.silva.store.set('p1Model', provider1.model),
          window.silva.store.set('p2Id', provider2.id),
          window.silva.store.set('p2Model', provider2.model),
          window.silva.store.set('activeMode', 'collab'),
        ]);
      }
    } catch {}
    populateProviders();
    // Restore key fields
    if (provider1.key) document.getElementById('p1-key').value = provider1.key;
    if (provider2.key) document.getElementById('p2-key').value = provider2.key;
    try {
      const mode = await window.silva.store.get('activeMode', 'collab');
      setActive(mode === 1 || mode === 2 || mode === 'both' || mode === 'collab' ? mode : 'collab');
    } catch { setActive('collab'); }
    sysMsg('👋 Silva AI ready. Click ⟳ Scan Local to detect Ollama/Jan/LM Studio, or click Connect to authenticate.');
  }

  async function saveSettings() {
    if (!window.silva) return;
    const pid1 = document.getElementById('p1-provider').value, pid2 = document.getElementById('p2-provider').value;
    await Promise.all([
      window.silva.store.set('p1Id', pid1),
      window.silva.store.set('p1Model', document.getElementById('p1-model').value),
      window.silva.store.set('p1Key', document.getElementById('p1-key')?.value||''),
      window.silva.store.set('p2Id', pid2),
      window.silva.store.set('p2Model', document.getElementById('p2-model').value),
      window.silva.store.set('p2Key', document.getElementById('p2-key')?.value||''),
    ]);
  }

  let recognition = null;
  function toggleVoice() {
    if (recognition) {
      recognition.stop();
      recognition = null;
      document.getElementById('btn-ai-voice').style.color = '';
      window.notify?.('Voice Jarvis stopped', 'info');
      return;
    }
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) { window.notify?.('Speech API not supported', 'error'); return; }
    
    recognition = new Speech();
    recognition.lang = 'en-US';
    recognition.onstart = () => {
      document.getElementById('btn-ai-voice').style.color = 'var(--red)';
      window.notify?.('Listening to Jarvis...', 'success');
    };
    recognition.onresult = (e) => {
      const text = e.results[0][0].transcript;
      document.getElementById('ai-input').value = text;
      doSend(false);
    };
    recognition.onend = () => {
      document.getElementById('btn-ai-voice').style.color = '';
      recognition = null;
    };
    recognition.start();
  }

  // Expose internal function for inline onclick
  const pub = { init, show, hide, toggle, clearChat, setContext, toggleVoice, ask, tools: toolProtocol, _rm: removeFuture };
  setTimeout(() => { window.AIManager = pub; }, 50);
  return pub;
})();
