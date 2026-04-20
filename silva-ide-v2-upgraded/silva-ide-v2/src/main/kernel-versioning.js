'use strict';
module.exports = function createKernelVersioning({ store, send }) {
  let current = '0.19';
  let versions = [];
  let history = [];

  const persist = () => {
    try { store?.set('kernel.versioning', { current, versions, history }); } catch {}
  };

  const load = () => {
    try {
      const saved = store?.get('kernel.versioning', null);
      if (saved) {
        current = saved.current || current;
        versions = saved.versions || [];
        history = saved.history || [];
      }
    } catch {}
  };

  const notify = (type, payload) => {
    try { send?.('kernel:versioning:notify', { type, payload }); } catch {}
  };

  const captureCurrent = () => {
    const snap = {};
    try { snap.gate = store?.get('kernel.gate', null); } catch {}
    try { snap.security = store?.get('kernel.security', null); } catch {}
    try { snap.ai = { p1Id: store?.get('p1Id'), p1Model: store?.get('p1Model'), p2Id: store?.get('p2Id'), p2Model: store?.get('p2Model'), activeMode: store?.get('activeMode') }; } catch {}
    return snap;
  };

  const snapshot = (author = 'user', label = '', configSnap = null) => {
    const version = `v${current}`;
    const snap = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      version,
      label: label || `Snapshot ${version}`,
      author,
      timestamp: Date.now(),
      config: configSnap || captureCurrent(),
    };
    versions.unshift(snap);
    history.unshift({ id: snap.id, version, action: 'snapshot', author, label: snap.label, timestamp: snap.timestamp });
    if (versions.length > 50) versions.pop();
    if (history.length > 200) history.pop();
    persist();
    notify('snapshot', snap);
    return snap;
  };

  const rollback = (versionId) => {
    const target = versions.find(v => v.id === versionId);
    if (!target) return { success: false, error: 'Version not found' };
    snapshot('auto', `Rollback to ${target.version}`, target.config);
    try {
      if (target.config?.gate) store?.set('kernel.gate', target.config.gate);
      if (target.config?.security) store?.set('kernel.security', target.config.security);
      if (target.config?.ai) {
        for (const [k, v] of Object.entries(target.config.ai)) store?.set(k, v);
      }
    } catch {}
    persist();
    notify('rollback', target);
    return { success: true, version: target.version };
  };

  const bumpVersion = () => {
    const parts = String(current).split('.').map(n => parseInt(n, 10)).filter(n => !Number.isNaN(n));
    if (!parts.length) { current = '0.1'; persist(); return snapshot('auto', 'Version bump'); }
    parts[parts.length - 1] += 1;
    current = parts.join('.');
    persist();
    return snapshot('auto', 'Version bump');
  };

  const init = () => {
    load();
    persist();
  };

  return {
    init,
    snapshot,
    rollback,
    bumpVersion,
    captureCurrent,
    listVersions: () => JSON.parse(JSON.stringify(versions)),
    listHistory: (limit = 50) => history.slice(0, limit),
    getVersionInfo: (versionId) => versions.find(v => v.id === versionId) || null,
    getDiff: (versionId) => {
      const target = versions.find(v => v.id === versionId);
      return target ? JSON.stringify(target.config, null, 2) : null;
    },
  };
};
