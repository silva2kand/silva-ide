'use strict';

module.exports = function createApprovalGate({ store, send }) {
  const ACTIONS = {
    CODE_WRITE: { label: 'Code Write', danger: 'high' },
    SHELL_EXEC: { label: 'Shell Exec', danger: 'high' },
    NETWORK: { label: 'Network', danger: 'medium' },
    WHATSAPP: { label: 'WhatsApp', danger: 'medium' },
    SYSTEM_CHANGE: { label: 'System Change', danger: 'high' },
    FILE_CREATE: { label: 'File Create', danger: 'low' },
    FILE_DELETE: { label: 'File Delete', danger: 'high' },
    AI_DEPLOY: { label: 'AI Deploy', danger: 'medium' },
    CONFIG_CHANGE: { label: 'Config Change', danger: 'high' },
  };

  const AGENT_CAPABILITIES = {
    planner: { actions: ['network', 'ai_deploy'], denyWrite: true },
    executor: { actions: ['code_write', 'file_create', 'file_delete'], denyConfig: true },
    jarvice: { actions: ['code_write', 'shell_exec', 'network', 'whatsapp', 'system_change'], denyBypass: true },
    fixledger: { actions: ['code_write', 'file_create', 'file_delete', 'git_commit', 'git_push'], denyConfig: true },
    watcher: { actions: ['network'], denyWrite: true },
    user: { actions: ['*'] },
  };

  const state = {
    history: [],
    pending: [],
    alwaysAllow: new Set(),
    alwaysDeny: new Set(),
  };

  const persist = () => {
    try {
      store?.set('kernel.gate', {
        history: state.history.slice(0, 200),
        alwaysAllow: [...state.alwaysAllow],
        alwaysDeny: [...state.alwaysDeny],
      });
    } catch {}
  };

  const load = () => {
    try {
      const saved = store?.get('kernel.gate', null);
      if (saved) {
        state.history = saved.history || [];
        state.alwaysAllow = new Set(saved.alwaysAllow || []);
        state.alwaysDeny = new Set(saved.alwaysDeny || []);
      }
    } catch {}
  };

  const notifyStatus = (entry) => {
    try { send?.('gate:status', entry); } catch {}
  };

  const notifyPending = () => {
    try { send?.('gate:pending', state.pending); } catch {}
  };

  const log = (actionLabel, agent, allowed, reason, context = {}) => {
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      action: actionLabel,
      agent,
      allowed,
      reason,
      timestamp: Date.now(),
      context,
    };
    state.history.unshift(entry);
    if (state.history.length > 200) state.history.pop();
    persist();
    notifyStatus(entry);
  };

  const requestApproval = (action, agent, danger, context) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const item = { id, action, agent, danger, context, timestamp: Date.now() };
    state.pending.unshift(item);
    if (state.pending.length > 50) state.pending.pop();
    persist();
    notifyPending();
    return id;
  };

  const enforce = (action, agent, context = {}) => {
    const act = String(action || '').toUpperCase();
    const def = ACTIONS[act];
    if (!def) return { allowed: false, reason: `Unknown action: ${act}` };

    if (state.alwaysAllow.has(act)) return { allowed: true, autoAllowed: true };
    if (state.alwaysDeny.has(act)) return { allowed: false, reason: 'Blocked by policy' };

    const agentCfg = AGENT_CAPABILITIES[String(agent || '').toLowerCase()];
    if (!agentCfg) return { allowed: false, reason: `Unknown agent: ${agent}` };
    if (agentCfg.denyBypass && act === 'SYSTEM_CHANGE') return { allowed: false, reason: 'Agent cannot bypass gates' };
    if (agentCfg.denyConfig && act === 'CONFIG_CHANGE') return { allowed: false, reason: 'Agent cannot change kernel config' };
    if (agentCfg.denyWrite && act === 'CODE_WRITE') return { allowed: false, reason: 'Agent cannot write code' };

    const hasCap = agentCfg.actions.includes('*') || agentCfg.actions.includes(act.toLowerCase());
    if (!hasCap) return { allowed: false, reason: 'Capability denied' };

    if (def.danger === 'high') {
      const gateId = requestApproval(def.label, String(agent || 'unknown'), def.danger, context);
      return { allowed: false, needsApproval: true, gateId, action: def.label, agent, danger: def.danger };
    }

    log(def.label, String(agent || 'unknown'), true, 'auto-allowed', context);
    return { allowed: true, autoAllowed: true };
  };

  const approve = (gateId) => {
    const idx = state.pending.findIndex(p => p.id === gateId);
    if (idx === -1) return { success: false, error: 'Not found' };
    const item = state.pending.splice(idx, 1)[0];
    persist();
    notifyPending();
    log(item.action, item.agent, true, 'user-approved', item.context || {});
    return { success: true };
  };

  const deny = (gateId) => {
    const idx = state.pending.findIndex(p => p.id === gateId);
    if (idx === -1) return { success: false, error: 'Not found' };
    const item = state.pending.splice(idx, 1)[0];
    persist();
    notifyPending();
    log(item.action, item.agent, false, 'user-denied', item.context || {});
    return { success: true };
  };

  const init = () => {
    load();
    persist();
  };

  return {
    init,
    enforce,
    approve,
    deny,
    getHistory: (limit = 50) => state.history.slice(0, limit),
    getPending: () => [...state.pending],
    getAlwaysAllow: () => [...state.alwaysAllow],
    getAlwaysDeny: () => [...state.alwaysDeny],
    clearAlwaysAllow: () => { state.alwaysAllow.clear(); persist(); },
    clearAlwaysDeny: () => { state.alwaysDeny.clear(); persist(); },
    ACTIONS,
    AGENT_CAPABILITIES,
  };
};
