'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const _listeners = {
  gateStatus: new Map(),
  gatePending: new Map(),
  metricsNotify: new Map(),
  kernelNotify: new Map(),
};

contextBridge.exposeInMainWorld('silva', {
  fs: {
    readFile: (p) => ipcRenderer.invoke('fs:read-file', p),
    writeFile: (p, content) => ipcRenderer.invoke('fs:write-file', { filePath: p, content }),
    saveDialog: (opts) => ipcRenderer.invoke('fs:save-dialog', opts),
    openFolder: () => ipcRenderer.invoke('fs:open-folder'),
    openFolderPath: (p) => ipcRenderer.invoke('fs:open-folder-path', p),
    openFile: () => ipcRenderer.invoke('fs:open-file'),
    delete: (p) => ipcRenderer.invoke('fs:delete', p),
    rename: (oldPath, newPath) => ipcRenderer.invoke('fs:rename', { oldPath, newPath }),
    createFile: (dirPath, name) => ipcRenderer.invoke('fs:create-file', { dirPath, name }),
    createDirectory: (dirPath, name) => ipcRenderer.invoke('fs:create-directory', { dirPath, name }),
    createProject: (rootPath, type) => ipcRenderer.invoke('fs:create-project', { rootPath, type }),
    refreshTree: (p) => ipcRenderer.invoke('fs:refresh-tree', p),
    search: (rootPath, query, options) => ipcRenderer.invoke('fs:search', { rootPath, query, options }),
    revealInExplorer: (p) => ipcRenderer.invoke('fs:reveal-in-explorer', p),
  },
  store: {
    get: (key, defaultValue) => ipcRenderer.invoke('store:get', { key, defaultValue }),
    set: (key, value) => ipcRenderer.invoke('store:set', { key, value }),
  },
  git: {
    status: (p) => ipcRenderer.invoke('git:status', p),
    commit: (p, msg) => ipcRenderer.invoke('git:commit', { repoPath: p, message: msg }),
    pull: (p) => ipcRenderer.invoke('git:pull', p),
    push: (p) => ipcRenderer.invoke('git:push', p),
  },
  terminal: {
    create: (cwd) => ipcRenderer.invoke('terminal:create', { cwd }),
    write: (data) => ipcRenderer.invoke('terminal:write', data),
    resize: (cols, rows) => ipcRenderer.invoke('terminal:resize', { cols, rows }),
    onData: (cb) => ipcRenderer.on('terminal:data', (_, d) => cb(d)),
    onExit: (cb) => ipcRenderer.on('terminal:exit', cb),
  },
  app: {
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    getPlatform: () => ipcRenderer.invoke('app:get-platform'),
    getHome: () => ipcRenderer.invoke('app:get-home'),
  },
  dialog: {
    showMessage: (opts) => ipcRenderer.invoke('dialog:show-message', opts),
    showInput: (opts) => ipcRenderer.invoke('dialog:show-input', opts),
  },
  dialogInput: {
    ok: (value) => ipcRenderer.send('input:ok', value),
    cancel: () => ipcRenderer.send('input:cancel'),
  },
  ai: {
    proxyRequest: (opts) => ipcRenderer.invoke('ai:proxy-request', opts),
    proxyStream: (opts, onData, onError, onEnd) => {
      const id = Math.random().toString(36).slice(2);
      ipcRenderer.send('ai:proxy-stream-start', { id, ...opts });
      const dataHandler = (_, chunk) => onData(chunk);
      const errorHandler = (_, err) => { onError(err); cleanup(); };
      const endHandler = () => { onEnd(); cleanup(); };
      const cleanup = () => {
        ipcRenderer.removeListener(`ai:proxy-stream-data:${id}`, dataHandler);
        ipcRenderer.removeListener(`ai:proxy-stream-error:${id}`, errorHandler);
        ipcRenderer.removeListener(`ai:proxy-stream-end:${id}`, endHandler);
      };
      ipcRenderer.on(`ai:proxy-stream-data:${id}`, dataHandler);
      ipcRenderer.on(`ai:proxy-stream-error:${id}`, errorHandler);
      ipcRenderer.on(`ai:proxy-stream-end:${id}`, endHandler);
      return { id, cancel: () => { ipcRenderer.send('ai:proxy-stream-cancel', { id }); cleanup(); } };
    }
  },
  // ─── Kernel IPC Channels ───
  gate: {
    enforce: (action, agent, context) => ipcRenderer.invoke('gate:enforce', { action, agent, context }),
    approve: (gateId) => ipcRenderer.invoke('gate:approve', gateId),
    deny: (gateId) => ipcRenderer.invoke('gate:deny', gateId),
    getHistory: (limit) => ipcRenderer.invoke('gate:history', limit),
    getPending: () => ipcRenderer.invoke('gate:pending'),
    getAlwaysAllow: () => ipcRenderer.invoke('gate:always-allow'),
    getAlwaysDeny: () => ipcRenderer.invoke('gate:always-deny'),
    clearAlwaysAllow: () => ipcRenderer.invoke('gate:clear-always-allow'),
    clearAlwaysDeny: () => ipcRenderer.invoke('gate:clear-always-deny'),
    getCapabilities: () => ipcRenderer.invoke('gate:capabilities'),
    onStatus: (cb) => {
      const h = (_, entry) => cb(entry);
      _listeners.gateStatus.set(cb, h);
      ipcRenderer.on('gate:status', h);
    },
    onPending: (cb) => {
      const h = (_, items) => cb(items);
      _listeners.gatePending.set(cb, h);
      ipcRenderer.on('gate:pending', h);
    },
    offStatus: (cb) => {
      const h = _listeners.gateStatus.get(cb);
      if (!h) return;
      ipcRenderer.removeListener('gate:status', h);
      _listeners.gateStatus.delete(cb);
    },
    offPending: (cb) => {
      const h = _listeners.gatePending.get(cb);
      if (!h) return;
      ipcRenderer.removeListener('gate:pending', h);
      _listeners.gatePending.delete(cb);
    },
  },
  metrics: {
    record: (agent, action, outcome, details) => ipcRenderer.invoke('metrics:record', { agent, action, outcome, details }),
    recordProvider: (provider, outcome, details) => ipcRenderer.invoke('metrics:record-provider', { provider, outcome, details }),
    resetAgent: (agent) => ipcRenderer.invoke('metrics:reset-agent', agent),
    resetAll: () => ipcRenderer.invoke('metrics:reset-all'),
    getAgentMetrics: () => ipcRenderer.invoke('metrics:agent'),
    getProviderMetrics: () => ipcRenderer.invoke('metrics:provider'),
    getKernelState: () => ipcRenderer.invoke('metrics:state'),
    getAlerts: () => ipcRenderer.invoke('metrics:alerts'),
    acknowledgeAlert: (alertId) => ipcRenderer.invoke('metrics:ack-alert', alertId),
    onNotify: (cb) => {
      const h = (_, data) => cb(data);
      _listeners.metricsNotify.set(cb, h);
      ipcRenderer.on('metrics:notify', h);
    },
    offNotify: (cb) => {
      const h = _listeners.metricsNotify.get(cb);
      if (!h) return;
      ipcRenderer.removeListener('metrics:notify', h);
      _listeners.metricsNotify.delete(cb);
    },
  },
  kernelVersioning: {
    snapshot: (author, label) => ipcRenderer.invoke('kernel:versioning:snapshot', { author, label }),
    rollback: (versionId) => ipcRenderer.invoke('kernel:versioning:rollback', versionId),
    listVersions: () => ipcRenderer.invoke('kernel:versioning:versions'),
    listHistory: (limit) => ipcRenderer.invoke('kernel:versioning:history', limit),
    getVersionInfo: (versionId) => ipcRenderer.invoke('kernel:versioning:info', versionId),
    getDiff: (versionId) => ipcRenderer.invoke('kernel:versioning:diff', versionId),
    bumpVersion: () => ipcRenderer.invoke('kernel:versioning:bump'),
    onNotify: (cb) => {
      const h = (_, data) => cb(data);
      _listeners.kernelNotify.set(cb, h);
      ipcRenderer.on('kernel:versioning:notify', h);
    },
    offNotify: (cb) => {
      const h = _listeners.kernelNotify.get(cb);
      if (!h) return;
      ipcRenderer.removeListener('kernel:versioning:notify', h);
      _listeners.kernelNotify.delete(cb);
    },
  },
  sandbox: {
    create: (id, agent) => ipcRenderer.invoke('sandbox:create', { id, agent }),
    testInShadow: (agent, action, payload) => ipcRenderer.invoke('sandbox:test', { agent, action, payload }),
    runGoldenTests: (testId) => ipcRenderer.invoke('sandbox:golden', testId),
    applyChanges: () => ipcRenderer.invoke('sandbox:apply'),
    clear: () => ipcRenderer.invoke('sandbox:clear'),
    getActive: () => ipcRenderer.invoke('sandbox:active'),
    getResults: () => ipcRenderer.invoke('sandbox:results'),
    getTestSuites: () => ipcRenderer.invoke('sandbox:suites'),
  },
  security: {
    enforceIdentity: (source, identity) => ipcRenderer.invoke('security:enforce-identity', { source, identity }),
    enforceRateLimit: (identity, action) => ipcRenderer.invoke('security:rate-limit', { identity, action }),
    scanForSecrets: (data) => ipcRenderer.invoke('security:scan-secrets', data),
    maskSecrets: (data) => ipcRenderer.invoke('security:mask-secrets', data),
    validateDataBoundaries: (context, data) => ipcRenderer.invoke('security:validate-boundaries', { context, data }),
    addWhitelist: (identity) => ipcRenderer.invoke('security:add-whitelist', identity),
    blockIdentity: (identity) => ipcRenderer.invoke('security:block', identity),
    removeWhitelist: (identity) => ipcRenderer.invoke('security:remove-whitelist', identity),
    removeBlock: (identity) => ipcRenderer.invoke('security:remove-block', identity),
    getWhitelist: () => ipcRenderer.invoke('security:whitelist'),
    getBlocked: () => ipcRenderer.invoke('security:blocked'),
    getRateLimits: () => ipcRenderer.invoke('security:rate-limits'),
    resetRateLimits: () => ipcRenderer.invoke('security:reset-rates'),
    getBoundaries: (context) => ipcRenderer.invoke('security:boundaries', context),
  },
  on: (channel, cb) => ipcRenderer.on(channel, (_, ...args) => cb(...args)),
  off: (channel, cb) => ipcRenderer.off(channel, cb),
});
