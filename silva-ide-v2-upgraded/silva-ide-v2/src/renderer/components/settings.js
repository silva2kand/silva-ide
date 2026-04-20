'use strict';
window.SettingsManager = (() => {
  const themes = {
    'catppuccin-mocha': '', 'catppuccin-latte': 'theme-light',
    'dracula': 'theme-dracula', 'github-dark': 'theme-github-dark',
    'nord': 'theme-nord', 'one-dark': 'theme-one-dark'
  };

  async function init() {
    if (!window.silva) return;
    renderPanel();
    await loadSettings();
    const bind = (id, handler) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', handler);
    };
    bind('btn-save-settings', saveSettings);
    bind('btn-settings-kv-snapshot', async () => {
      if (!window.silva?.kernelVersioning) return;
      await window.silva.kernelVersioning.snapshot('user', 'From settings');
      window.notify?.('Kernel snapshot created!', 'success');
    });
    bind('btn-settings-kv-bump', async () => {
      if (!window.silva?.kernelVersioning) return;
      await window.silva.kernelVersioning.bumpVersion();
      window.notify?.('Kernel version bumped!', 'success');
    });
    document.getElementById('setting-theme')?.addEventListener('change', applyTheme);
    document.getElementById('setting-font-size')?.addEventListener('input', e => {
      const label = document.getElementById('font-size-label');
      if (label) label.textContent = `${e.target.value}px`;
      window.EditorManager?.updateOptions({ fontSize: parseInt(e.target.value) });
    });
    document.getElementById('setting-font-family')?.addEventListener('change', e => {
      window.EditorManager?.updateOptions({ fontFamily: e.target.value });
    });
    document.getElementById('setting-tab-size')?.addEventListener('change', e => {
      const size = parseInt(e.target.value);
      window.EditorManager?.updateOptions({ tabSize: size, insertSpaces: true });
    });
    document.getElementById('setting-word-wrap')?.addEventListener('change', e => {
      window.EditorManager?.updateOptions({ wordWrap: e.target.value });
    });
    document.getElementById('setting-minimap')?.addEventListener('change', e => {
      window.EditorManager?.updateOptions({ minimap: { enabled: e.target.checked } });
    });
    document.getElementById('setting-line-numbers')?.addEventListener('change', e => {
      window.EditorManager?.updateOptions({ lineNumbers: e.target.value });
    });
    document.getElementById('setting-ai-provider')?.addEventListener('change', e => {
      updateModelOptions(e.target.value);
    });
    document.getElementById('btn-settings')?.addEventListener('click', () => {
      document.querySelector('.ab-btn[data-panel="settings"]')?.click();
    });
  }

  function renderPanel() {
    const container = document.getElementById('panel-settings');
    if (!container) return;
    if (container.dataset.ready === '1') return;
    container.dataset.ready = '1';
    container.innerHTML = `
      <div class="panel-header">
        <span>SETTINGS</span>
        <button class="btn-primary" id="btn-save-settings" style="padding:6px 10px;font-size:11px">Save</button>
      </div>
      <div style="padding:12px;display:flex;flex-direction:column;gap:14px;overflow:auto;height:100%">
        <div style="display:flex;flex-direction:column;gap:6px">
          <div style="font-size:11px;color:var(--subtext1);font-weight:600">Theme</div>
          <select id="setting-theme" style="background:var(--surface0);border:1px solid var(--surface1);border-radius:6px;padding:8px;color:var(--text);font-size:12px">
            <option value="catppuccin-mocha">Catppuccin Mocha</option>
            <option value="catppuccin-latte">Catppuccin Latte</option>
            <option value="dracula">Dracula</option>
            <option value="github-dark">GitHub Dark</option>
            <option value="nord">Nord</option>
            <option value="one-dark">One Dark</option>
          </select>
        </div>

        <div style="display:flex;flex-direction:column;gap:6px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div style="font-size:11px;color:var(--subtext1);font-weight:600">Font Size</div>
            <div id="font-size-label" style="font-size:11px;color:var(--subtext1)">14px</div>
          </div>
          <input id="setting-font-size" type="range" min="10" max="24" step="1" value="14">
        </div>

        <div style="display:flex;gap:10px">
          <div style="flex:1;display:flex;flex-direction:column;gap:6px">
            <div style="font-size:11px;color:var(--subtext1);font-weight:600">Font Family</div>
            <select id="setting-font-family" style="background:var(--surface0);border:1px solid var(--surface1);border-radius:6px;padding:8px;color:var(--text);font-size:12px">
              <option value="'JetBrains Mono', 'Fira Code', monospace">JetBrains Mono</option>
              <option value="'Fira Code', monospace">Fira Code</option>
              <option value="Consolas, monospace">Consolas</option>
            </select>
          </div>
          <div style="width:110px;display:flex;flex-direction:column;gap:6px">
            <div style="font-size:11px;color:var(--subtext1);font-weight:600">Tab Size</div>
            <select id="setting-tab-size" style="background:var(--surface0);border:1px solid var(--surface1);border-radius:6px;padding:8px;color:var(--text);font-size:12px">
              <option value="2">2</option>
              <option value="4" selected>4</option>
              <option value="8">8</option>
            </select>
          </div>
        </div>

        <div style="display:flex;gap:10px;align-items:center">
          <div style="flex:1;display:flex;flex-direction:column;gap:6px">
            <div style="font-size:11px;color:var(--subtext1);font-weight:600">Word Wrap</div>
            <select id="setting-word-wrap" style="background:var(--surface0);border:1px solid var(--surface1);border-radius:6px;padding:8px;color:var(--text);font-size:12px">
              <option value="off" selected>Off</option>
              <option value="on">On</option>
              <option value="bounded">Bounded</option>
            </select>
          </div>
          <label style="display:flex;gap:6px;align-items:center;font-size:12px;color:var(--subtext1)"><input id="setting-minimap" type="checkbox" checked>Minimap</label>
          <label style="display:flex;gap:6px;align-items:center;font-size:12px;color:var(--subtext1)"><input id="setting-autosave" type="checkbox">Autosave</label>
        </div>

        <div style="display:flex;flex-direction:column;gap:6px">
          <div style="font-size:11px;color:var(--subtext1);font-weight:600">Line Numbers</div>
          <select id="setting-line-numbers" style="background:var(--surface0);border:1px solid var(--surface1);border-radius:6px;padding:8px;color:var(--text);font-size:12px">
            <option value="on" selected>On</option>
            <option value="off">Off</option>
            <option value="relative">Relative</option>
          </select>
        </div>

        <div style="border-top:1px solid var(--surface0);padding-top:12px;display:flex;flex-direction:column;gap:10px">
          <div style="font-size:11px;color:var(--subtext1);font-weight:700;letter-spacing:1px">AI</div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <div style="font-size:11px;color:var(--subtext1);font-weight:600">Provider</div>
            <select id="setting-ai-provider" style="background:var(--surface0);border:1px solid var(--surface1);border-radius:6px;padding:8px;color:var(--text);font-size:12px">
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
              <option value="google">Google</option>
              <option value="groq">Groq</option>
              <option value="ollama">Ollama</option>
              <option value="lmstudio">LM Studio</option>
              <option value="jan">Jan</option>
            </select>
            <select id="ai-provider-select" style="display:none"></select>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <div style="font-size:11px;color:var(--subtext1);font-weight:600">Model</div>
            <select id="setting-ai-model" style="background:var(--surface0);border:1px solid var(--surface1);border-radius:6px;padding:8px;color:var(--text);font-size:12px"></select>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <div style="font-size:11px;color:var(--subtext1);font-weight:600">Ollama URL</div>
            <input id="setting-ollama-url" placeholder="http://127.0.0.1:11434" style="background:var(--surface0);border:1px solid var(--surface1);border-radius:6px;padding:8px;color:var(--text);font-size:12px">
          </div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <div style="font-size:11px;color:var(--subtext1);font-weight:600">API Keys</div>
            <input id="setting-anthropic-key" placeholder="Anthropic key" style="background:var(--surface0);border:1px solid var(--surface1);border-radius:6px;padding:8px;color:var(--text);font-size:12px">
            <input id="setting-openai-key" placeholder="OpenAI key" style="background:var(--surface0);border:1px solid var(--surface1);border-radius:6px;padding:8px;color:var(--text);font-size:12px">
            <input id="setting-google-key" placeholder="Google key" style="background:var(--surface0);border:1px solid var(--surface1);border-radius:6px;padding:8px;color:var(--text);font-size:12px">
            <input id="setting-groq-key" placeholder="Groq key" style="background:var(--surface0);border:1px solid var(--surface1);border-radius:6px;padding:8px;color:var(--text);font-size:12px">
          </div>
        </div>

        <div style="border-top:1px solid var(--surface0);padding-top:12px;display:flex;flex-direction:column;gap:10px">
          <div style="font-size:11px;color:var(--subtext1);font-weight:700;letter-spacing:1px">KERNEL</div>

          <div style="display:flex;flex-direction:column;gap:6px">
            <div style="font-size:11px;color:var(--subtext1);font-weight:600">Kernel Version</div>
            <div style="display:flex;gap:6px">
              <button class="btn-secondary" id="btn-settings-kv-snapshot" style="flex:1;font-size:11px">Create Snapshot</button>
              <button class="btn-secondary" id="btn-settings-kv-bump" style="flex:1;font-size:11px">Bump Version</button>
            </div>
          </div>

          <div style="display:flex;flex-direction:column;gap:6px">
            <div style="font-size:11px;color:var(--subtext1);font-weight:600">Auto-snapshots</div>
            <label style="display:flex;gap:6px;align-items:center;font-size:12px;color:var(--text)">
              <input id="setting-auto-snapshot" type="checkbox"> On every AI operation
            </label>
          </div>

          <div style="display:flex;flex-direction:column;gap:6px">
            <div style="font-size:11px;color:var(--subtext1);font-weight:600">Default Agent</div>
            <select id="setting-default-agent" style="background:var(--surface0);border:1px solid var(--surface1);border-radius:6px;padding:8px;color:var(--text);font-size:12px">
              <option value="jarvice">Jarvice</option>
              <option value="fixledger">FixLedger</option>
              <option value="planner">Planner</option>
              <option value="executor">Executor</option>
            </select>
          </div>

          <div style="display:flex;flex-direction:column;gap:6px">
            <div style="font-size:11px;color:var(--subtext1);font-weight:600">Approval Sensitivity</div>
            <select id="setting-approval-sensitivity" style="background:var(--surface0);border:1px solid var(--surface1);border-radius:6px;padding:8px;color:var(--text);font-size:12px">
              <option value="strict">Strict — approve all</option>
              <option value="balanced" selected>Balanced — approve high-risk</option>
              <option value="relaxed">Relaxed — auto-allow low</option>
            </select>
          </div>
        </div>
      </div>
    `;
    updateModelOptions('anthropic');
    const sync = () => {
      const provider = document.getElementById('setting-ai-provider')?.value || 'anthropic';
      const hidden = document.getElementById('ai-provider-select');
      if (hidden) hidden.value = provider;
    };
    sync();
  }

  async function loadSettings() {
    if (!window.silva) return;
    const s = key => window.silva.store.get(key, undefined);
    const [theme, fontSize, fontFamily, tabSize, wordWrap, minimap, lineNums, autoSave,
           anthropicKey, openaiKey, googleKey, groqKey, ollamaUrl, aiProvider, aiModel,
           autoSnapshot, defaultAgent, approvalSensitivity] = await Promise.all([
      s('theme'), s('fontSize'), s('fontFamily'), s('tabSize'),
      s('wordWrap'), s('minimap'), s('lineNumbers'), s('autoSave'),
      s('anthropicKey'), s('openaiKey'), s('googleKey'), s('groqKey'),
      s('ollamaUrl'), s('aiProvider'), s('aiModel'),
      s('autoSnapshot'), s('defaultAgent'), s('approvalSensitivity')
    ]);
    if (theme) { const el = document.getElementById('setting-theme'); if (el) el.value = theme; applyTheme(); }
    if (fontSize) { const el = document.getElementById('setting-font-size'); if (el) el.value = fontSize; const lbl = document.getElementById('font-size-label'); if (lbl) lbl.textContent = `${fontSize}px`; }
    if (fontFamily) { const el = document.getElementById('setting-font-family'); if (el) el.value = fontFamily; }
    if (tabSize) { const el = document.getElementById('setting-tab-size'); if (el) el.value = tabSize; }
    if (wordWrap) { const el = document.getElementById('setting-word-wrap'); if (el) el.value = wordWrap; }
    if (minimap !== undefined) { const el = document.getElementById('setting-minimap'); if (el) el.checked = minimap; }
    if (lineNums) { const el = document.getElementById('setting-line-numbers'); if (el) el.value = lineNums; }
    if (autoSave !== undefined) { const el = document.getElementById('setting-autosave'); if (el) el.checked = autoSave; }
    if (anthropicKey) { const el = document.getElementById('setting-anthropic-key'); if (el) el.value = anthropicKey; }
    if (openaiKey) { const el = document.getElementById('setting-openai-key'); if (el) el.value = openaiKey; }
    if (googleKey) { const el = document.getElementById('setting-google-key'); if (el) el.value = googleKey; }
    if (groqKey) { const el = document.getElementById('setting-groq-key'); if (el) el.value = groqKey; }
    if (ollamaUrl) { const el = document.getElementById('setting-ollama-url'); if (el) el.value = ollamaUrl; }
    if (aiProvider) {
      const el = document.getElementById('setting-ai-provider');
      if (el) el.value = aiProvider;
      const hidden = document.getElementById('ai-provider-select');
      if (hidden) hidden.value = aiProvider;
      updateModelOptions(aiProvider);
    }
    if (aiModel) { const el = document.getElementById('setting-ai-model'); if (el) el.value = aiModel; }
    if (autoSnapshot !== undefined) { const el = document.getElementById('setting-auto-snapshot'); if (el) el.checked = autoSnapshot; }
    if (defaultAgent) { const el = document.getElementById('setting-default-agent'); if (el) el.value = defaultAgent; }
    if (approvalSensitivity) { const el = document.getElementById('setting-approval-sensitivity'); if (el) el.value = approvalSensitivity; }
  }

  async function saveSettings() {
    if (!window.silva) return;
    const pairs = [
      ['theme', document.getElementById('setting-theme')?.value],
      ['fontSize', parseInt(document.getElementById('setting-font-size')?.value || '14')],
      ['fontFamily', document.getElementById('setting-font-family')?.value],
      ['tabSize', parseInt(document.getElementById('setting-tab-size')?.value || '4')],
      ['wordWrap', document.getElementById('setting-word-wrap')?.value],
      ['minimap', document.getElementById('setting-minimap')?.checked],
      ['lineNumbers', document.getElementById('setting-line-numbers')?.value],
      ['autoSave', document.getElementById('setting-autosave')?.checked],
      ['anthropicKey', document.getElementById('setting-anthropic-key')?.value],
      ['openaiKey', document.getElementById('setting-openai-key')?.value],
      ['googleKey', document.getElementById('setting-google-key')?.value],
      ['groqKey', document.getElementById('setting-groq-key')?.value],
      ['ollamaUrl', document.getElementById('setting-ollama-url')?.value],
      ['aiProvider', document.getElementById('setting-ai-provider')?.value],
      ['aiModel', document.getElementById('setting-ai-model')?.value],
      ['autoSnapshot', document.getElementById('setting-auto-snapshot')?.checked],
      ['defaultAgent', document.getElementById('setting-default-agent')?.value],
      ['approvalSensitivity', document.getElementById('setting-approval-sensitivity')?.value],
    ];
    await Promise.all(pairs.map(([k, v]) => window.silva.store.set(k, v)));
    applyTheme();
    window.EditorManager?.updateOptions({
      fontSize: parseInt(document.getElementById('setting-font-size')?.value || '14'),
      fontFamily: document.getElementById('setting-font-family')?.value,
      tabSize: parseInt(document.getElementById('setting-tab-size')?.value || '4'),
      wordWrap: document.getElementById('setting-word-wrap')?.value || 'off',
      minimap: { enabled: document.getElementById('setting-minimap')?.checked !== false },
      lineNumbers: document.getElementById('setting-line-numbers')?.value || 'on',
    });
    const hidden = document.getElementById('ai-provider-select');
    const p = document.getElementById('setting-ai-provider');
    if (hidden && p) hidden.value = p.value;
    window.notify?.('Settings saved!', 'success');
  }

  function applyTheme() {
    const theme = document.getElementById('setting-theme').value;
    const themeClass = themes[theme] || '';
    document.body.className = themeClass ? themeClass : '';
    // Update Monaco theme too
    if (typeof monaco !== 'undefined') {
      const monacoThemeMap = { 'catppuccin-mocha': 'silva-dark', 'catppuccin-latte': 'vs', 'dracula': 'silva-dark', 'github-dark': 'silva-dark', 'nord': 'silva-dark', 'one-dark': 'silva-dark' };
      monaco.editor.setTheme(monacoThemeMap[theme] || 'silva-dark');
    }
  }

  function updateModelOptions(provider) {
    const modelSelect = document.getElementById('setting-ai-model');
    const models = {
      anthropic: [['claude-opus-4-5', 'Claude Opus 4.5'], ['claude-sonnet-4-5', 'Claude Sonnet 4.5'], ['claude-haiku-4-5', 'Claude Haiku 4.5']],
      openai: [['gpt-4o', 'GPT-4o'], ['gpt-4o-mini', 'GPT-4o Mini'], ['gpt-4-turbo', 'GPT-4 Turbo']],
      google: [['gemini-2.0-flash-exp', 'Gemini 2.0 Flash'], ['gemini-1.5-pro', 'Gemini 1.5 Pro']],
      groq: [['llama-3.3-70b-versatile', 'Llama 3.3 70B'], ['llama-3.1-8b-instant', 'Llama 3.1 8B'], ['mixtral-8x7b-32768', 'Mixtral 8x7B']],
      ollama: [['llama3.2', 'Llama 3.2'], ['codellama', 'Code Llama'], ['deepseek-coder', 'DeepSeek Coder'], ['mistral', 'Mistral']],
      lmstudio: [['auto', 'Auto-detect']],
      jan: [['auto', 'Auto-detect']],
    };
    const opts = models[provider] || models.anthropic;
    modelSelect.innerHTML = opts.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  }

  return { init, loadSettings, saveSettings };
})();
