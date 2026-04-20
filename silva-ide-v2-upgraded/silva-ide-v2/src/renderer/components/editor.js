'use strict';
// ─── Editor Component ───────────────────────────────────────────────
window.EditorManager = (() => {
  let monacoReady = false;
  let editor = null;
  let editorRight = null;
  let activeSide = 'left';
  const tabs = [];
  let activeTabId = null;
  let splitMode = false;
  let unsavedFiles = new Set();
  const listeners = {};

  function emit(event, ...args) { (listeners[event] || []).forEach(fn => fn(...args)); }
  function on(event, fn) { listeners[event] = listeners[event] || []; listeners[event].push(fn); }

  function waitForMonaco() {
    return new Promise(res => {
      if (monacoReady) { res(); return; }
      document.addEventListener('monaco-ready', () => { monacoReady = true; res(); }, { once: true });
    });
  }

  async function init() {
    await waitForMonaco();
    const container = document.getElementById('monaco-editor');
    editor = monaco.editor.create(container, getEditorOptions());
    setupEditorListeners(editor, 'left');
    setupResizeObserver();
    applyStoredSettings();
  }

  function getEditorOptions() {
    return {
      theme: 'silva-dark',
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontLigatures: true,
      lineNumbers: 'on',
      minimap: { enabled: true },
      wordWrap: 'off',
      tabSize: 4,
      insertSpaces: true,
      formatOnType: true,
      formatOnPaste: true,
      autoIndent: 'full',
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: true, indentation: true },
      cursorBlinking: 'phase',
      cursorSmoothCaretAnimation: 'on',
      smoothScrolling: true,
      scrollBeyondLastLine: false,
      renderLineHighlight: 'line',
      occurrencesHighlight: true,
      codeLens: true,
      folding: true,
      foldingStrategy: 'indentation',
      showFoldingControls: 'mouseover',
      matchBrackets: 'always',
      autoClosingBrackets: 'always',
      autoClosingQuotes: 'always',
      suggest: { showMethods: true, showFunctions: true, showConstructors: true, showVariables: true, showClasses: true, showModules: true },
      quickSuggestions: { other: true, comments: false, strings: true },
      snippetSuggestions: 'top',
      parameterHints: { enabled: true },
      scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
      padding: { top: 8 },
      colorDecorators: true,
      'semanticHighlighting.enabled': true,
      contextmenu: true,
    };
  }

  function defineCustomThemes() {
    monaco.editor.defineTheme('silva-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6c7086', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'cba6f7', fontStyle: 'bold' },
        { token: 'string', foreground: 'a6e3a1' },
        { token: 'number', foreground: 'fab387' },
        { token: 'type', foreground: '89dceb' },
        { token: 'class', foreground: 'f9e2af' },
        { token: 'function', foreground: '89b4fa' },
        { token: 'variable', foreground: 'cdd6f4' },
        { token: 'operator', foreground: '89dceb' },
        { token: 'constant', foreground: 'fab387' },
        { token: 'tag', foreground: 'f38ba8' },
        { token: 'attribute.name', foreground: 'fab387' },
        { token: 'attribute.value', foreground: 'a6e3a1' },
        { token: 'regexp', foreground: 'f38ba8' },
      ],
      colors: {
        'editor.background': '#1e1e2e',
        'editor.foreground': '#cdd6f4',
        'editor.lineHighlightBackground': '#313244',
        'editor.selectionBackground': '#45475a',
        'editor.inactiveSelectionBackground': '#313244',
        'editorCursor.foreground': '#f5c2e7',
        'editorLineNumber.foreground': '#45475a',
        'editorLineNumber.activeForeground': '#cdd6f4',
        'editorWidget.background': '#181825',
        'editorWidget.border': '#45475a',
        'editorSuggestWidget.background': '#181825',
        'editorSuggestWidget.border': '#45475a',
        'editorSuggestWidget.selectedBackground': '#313244',
        'editorHoverWidget.background': '#181825',
        'editorIndentGuide.background': '#31324499',
        'editorIndentGuide.activeBackground': '#585b70',
        'editorBracketMatch.background': '#cba6f720',
        'editorBracketMatch.border': '#cba6f7',
        'scrollbarSlider.background': '#45475a80',
        'scrollbarSlider.hoverBackground': '#585b70',
        'minimap.background': '#181825',
        'peekViewEditor.background': '#181825',
        'peekViewResult.background': '#181825',
        'input.background': '#313244',
        'input.border': '#45475a',
        'inputOption.activeBorder': '#89b4fa',
        'list.hoverBackground': '#313244',
        'list.activeSelectionBackground': '#45475a',
        'dropdown.background': '#181825',
        'dropdown.border': '#45475a',
      }
    });
    monaco.editor.setTheme('silva-dark');
  }

  function setupEditorListeners(ed, side) {
    ed.onDidChangeCursorPosition(e => {
      if (activeSide !== side && side === 'right') return;
      const pos = e.position;
      document.getElementById('status-cursor').textContent = `Ln ${pos.lineNumber}, Col ${pos.column}`;
    });

    ed.onDidChangeModelContent(() => {
      const tab = getActiveTab();
      if (tab && !unsavedFiles.has(tab.id)) {
        unsavedFiles.add(tab.id);
        markTabDirty(tab.id, true);
        emit('file-changed', tab);
      }
      if (document.getElementById('setting-autosave').checked) {
        debouncedSave();
      }
    });

    ed.onDidChangeModel(e => {
      if (e.newModelUrl) {
        const lang = ed.getModel().getLanguageId();
        document.getElementById('status-lang').textContent = lang.charAt(0).toUpperCase() + lang.slice(1);
      }
    });
  }

  let saveTimeout = null;
  function debouncedSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => saveActiveFile(), 1000);
  }

  function setupResizeObserver() {
    const observer = new ResizeObserver(() => {
      if (editor) editor.layout();
      if (editorRight) editorRight.layout();
    });
    observer.observe(document.getElementById('editor-area'));
  }

  async function applyStoredSettings() {
    if (!window.silva) return;
    const fontSize = await window.silva.store.get('fontSize', 14);
    const fontFamily = await window.silva.store.get('fontFamily', "'JetBrains Mono', 'Fira Code', monospace");
    const tabSize = await window.silva.store.get('tabSize', 4);
    const wordWrap = await window.silva.store.get('wordWrap', 'off');
    const minimap = await window.silva.store.get('minimap', true);
    const lineNumbers = await window.silva.store.get('lineNumbers', 'on');
    updateOptions({ fontSize, fontFamily, tabSize, wordWrap: wordWrap, minimap: { enabled: minimap }, lineNumbers });
  }

  function updateOptions(opts) {
    if (editor) editor.updateOptions(opts);
    if (editorRight) editorRight.updateOptions(opts);
    if (opts.tabSize) document.getElementById('status-spaces').textContent = `Spaces: ${opts.tabSize}`;
  }

  function openFile({ path: filePath, content, language }) {
    if (!editor) return;
    const existingTab = tabs.find(t => t.path === filePath);
    if (existingTab) { activateTab(existingTab.id); return; }
    const lang = language || detectLanguage(filePath);
    const model = monaco.editor.createModel(content, lang, monaco.Uri.file(filePath));
    const tabId = `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const tab = { id: tabId, path: filePath, name: filePath.split(/[/\\]/).pop(), model, language: lang };
    tabs.push(tab);
    addTabElement(tab);
    activateTab(tabId);
    document.getElementById('welcome-screen').classList.add('hidden');
    emit('file-opened', tab);
  }

  async function openFileByPath(filePath) {
    const existing = tabs.find(t => t.path === filePath);
    if (existing) { activateTab(existing.id); return; }
    if (!window.silva) return;
    const result = await window.silva.fs.readFile(filePath);
    if (result.success) {
      openFile({ path: filePath, content: result.content });
    } else {
      window.notify?.(`Failed to open file: ${result.error}`, 'error');
    }
  }

  function detectLanguage(filePath) {
    return window.LanguageDetect ? window.LanguageDetect.fromPath(filePath) : 'plaintext';
  }

  function addTabElement(tab) {
    const container = document.getElementById('tabs-container');
    const el = document.createElement('div');
    el.className = 'editor-tab';
    el.dataset.tabId = tab.id;
    el.innerHTML = `<span class="tab-lang-icon">${getFileIcon(tab.name)}</span><span class="tab-name" style="overflow:hidden;text-overflow:ellipsis">${tab.name}</span><span class="tab-close" data-tab-id="${tab.id}">×</span>`;
    el.addEventListener('click', e => { if (!e.target.classList.contains('tab-close')) activateTab(tab.id); });
    el.querySelector('.tab-close').addEventListener('click', e => { e.stopPropagation(); closeTab(tab.id); });
    el.addEventListener('auxclick', e => { if (e.button === 1) closeTab(tab.id); });
    container.appendChild(el);
    el.scrollIntoView();
  }

  function activateTab(tabId) {
    activeTabId = tabId;
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;
    document.querySelectorAll('.editor-tab').forEach(el => el.classList.toggle('active', el.dataset.tabId === tabId));
    const target = splitMode && activeSide === 'right' ? editorRight : editor;
    target.setModel(tab.model);
    target.focus();
    document.getElementById('status-lang').textContent = tab.language.charAt(0).toUpperCase() + tab.language.slice(1);
    emit('tab-activated', tab);
  }

  function closeTab(tabId) {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;
    if (unsavedFiles.has(tabId)) {
      const ok = confirm(`Save changes to ${tab.name}?`);
      if (ok) { saveFile(tab); return; }
    }
    const idx = tabs.indexOf(tab);
    tabs.splice(idx, 1);
    tab.model.dispose();
    document.querySelector(`.editor-tab[data-tab-id="${tabId}"]`)?.remove();
    unsavedFiles.delete(tabId);
    if (activeTabId === tabId) {
      const next = tabs[idx] || tabs[idx - 1];
      if (next) activateTab(next.id);
      else {
        activeTabId = null;
        editor.setModel(null);
        document.getElementById('welcome-screen').classList.remove('hidden');
      }
    }
    emit('tab-closed', tab);
  }

  function markTabDirty(tabId, dirty) {
    const el = document.querySelector(`.editor-tab[data-tab-id="${tabId}"]`);
    if (el) el.classList.toggle('dirty', dirty);
  }

  function getActiveTab() { return tabs.find(t => t.id === activeTabId) || null; }

  async function saveActiveFile() {
    const tab = getActiveTab();
    if (!tab || !tab.path) return;
    await saveFile(tab);
  }

  async function saveFile(tab) {
    if (!window.silva || !tab) return;
    const content = tab.model.getValue();
    const result = await window.silva.fs.writeFile(tab.path, content);
    if (result.success) {
      unsavedFiles.delete(tab.id);
      markTabDirty(tab.id, false);
      window.notify(`Saved ${tab.name}`, 'success');
      emit('file-saved', tab);
    } else {
      window.notify(`Failed to save: ${result.error}`, 'error');
    }
  }

  async function saveAs() {
    const tab = getActiveTab();
    if (!tab || !window.silva) return;
    const result = await window.silva.fs.saveDialog({ defaultPath: tab.name });
    if (!result.canceled && result.filePath) {
      tab.path = result.filePath;
      tab.name = result.filePath.split(/[/\\]/).pop();
      tab.language = detectLanguage(result.filePath);
      const el = document.querySelector(`.editor-tab[data-tab-id="${tab.id}"] .tab-name`);
      if (el) el.textContent = tab.name;
      await saveFile(tab);
    }
  }

  function newFile() {
    const content = '';
    const name = `untitled-${tabs.length + 1}.txt`;
    const model = monaco.editor.createModel(content, 'plaintext');
    const tabId = `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const tab = { id: tabId, path: null, name, model, language: 'plaintext' };
    tabs.push(tab);
    addTabElement(tab);
    activateTab(tabId);
    document.getElementById('welcome-screen').classList.add('hidden');
    editor.focus();
  }

  function toggleSplit() {
    splitMode = !splitMode;
    const right = document.getElementById('editor-container-right');
    right.classList.toggle('hidden', !splitMode);
    if (splitMode && !editorRight) {
      editorRight = monaco.editor.create(document.getElementById('monaco-editor-right'), {
        ...getEditorOptions(), model: getActiveTab()?.model || null
      });
      setupEditorListeners(editorRight, 'right');
    }
    if (editor) editor.layout();
    if (editorRight) editorRight.layout();
  }

  function getSelectedText() {
    if (!editor) return '';
    const selection = editor.getSelection();
    if (selection && !selection.isEmpty()) {
      return editor.getModel()?.getValueInRange(selection) || '';
    }
    return editor.getModel()?.getValue() || '';
  }

  function insertText(text) {
    if (!editor) return;
    const selection = editor.getSelection();
    editor.executeEdits('ai-insert', [{ range: selection, text, forceMoveMarkers: true }]);
    editor.focus();
  }

  function getFileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    const icons = { js: '🟨', ts: '🔷', py: '🐍', rs: '🦀', go: '🐹', java: '☕', rb: '💎', php: '🐘', c: '©', cpp: '🔧', cs: '🟣', html: '🌐', css: '🎨', json: '📋', md: '📝', yaml: '📄', yml: '📄', sh: '💻', bash: '💻', sql: '🗄', xml: '📰', vue: '💚', svelte: '🔴', kt: '🟠', swift: '🍎', dart: '🎯', r: '📊', lua: '🌙', zig: '⚡' };
    return icons[ext] || '📄';
  }

  function getEditorContent() {
    return editor?.getModel()?.getValue() || '';
  }

  function formatDocument() {
    editor?.getAction('editor.action.formatDocument')?.run();
  }

  function findInEditor(query, opts = {}) {
    if (!editor) return;
    editor.getAction('actions.find')?.run();
    editor.focus();
  }

  // Export
  return { init, openFile, openFileByPath, newFile, saveActiveFile, saveAs, closeTab, activateTab, getActiveTab, getAllTabs: () => tabs, getSelectedText, insertText, toggleSplit, updateOptions, defineCustomThemes, getEditorContent, formatDocument, findInEditor, on };
})();

document.addEventListener('monaco-ready', () => {
  EditorManager.defineCustomThemes();
  EditorManager.init();
});
