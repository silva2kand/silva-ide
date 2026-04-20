'use strict';

module.exports = function createSecurityManager({ store }) {
  const SECRET_PATTERNS = [
    { pattern: /(?:sk-|sk_live_|sk_test_)[A-Za-z0-9]{20,}/g, label: 'API key' },
    { pattern: /AKIA[0-9A-Z]{16}/g, label: 'AWS key' },
    { pattern: /ghp_[A-Za-z0-9]{36}/g, label: 'GitHub token' },
    { pattern: /Bearer\s+[A-Za-z0-_\-.]{10,}/g, label: 'Bearer token' },
  ];

  const rateLimits = new Map();
  const state = {
    whitelist: [],
    blocked: [],
    defaultRatePerMinute: 30,
  };

  const load = () => {
    try {
      const saved = store?.get('kernel.security', null);
      if (saved) {
        state.whitelist = saved.whitelist || [];
        state.blocked = saved.blocked || [];
        if (typeof saved.defaultRatePerMinute === 'number') state.defaultRatePerMinute = saved.defaultRatePerMinute;
      }
    } catch {}
  };

  const persist = () => {
    try {
      store?.set('kernel.security', {
        whitelist: state.whitelist,
        blocked: state.blocked,
        defaultRatePerMinute: state.defaultRatePerMinute,
      });
    } catch {}
  };

  const init = () => {
    load();
    persist();
  };

  const enforceIdentity = (_source, identity) => {
    if (!identity) return { allow: false, reason: 'No identity provided' };
    if (state.blocked.includes(identity)) return { allow: false, reason: 'Identity blocked' };
    if (state.whitelist.length > 0 && !state.whitelist.includes(identity)) return { allow: false, reason: 'Identity not whitelisted' };
    return { allow: true };
  };

  const enforceRateLimit = (identity, action) => {
    if (!identity) return { allow: true };
    const key = `${identity}:${action}`;
    const now = Date.now();
    const windowMs = 60000;

    const entry = rateLimits.get(key);
    if (!entry || (now - entry.windowStart) > windowMs) {
      rateLimits.set(key, { count: 1, windowStart: now });
      return { allow: true, remaining: state.defaultRatePerMinute - 1 };
    }

    if (entry.count >= state.defaultRatePerMinute) return { allow: false, reason: `Rate limit exceeded for ${action}` };
    entry.count += 1;
    return { allow: true, remaining: Math.max(0, state.defaultRatePerMinute - entry.count) };
  };

  const scanForSecrets = (data) => {
    const results = [];
    if (!data) return results;
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    for (const { pattern, label } of SECRET_PATTERNS) {
      const matches = text.match(pattern);
      if (matches?.length) results.push({ type: label, count: matches.length });
    }
    return results;
  };

  const maskSecrets = (data) => {
    if (!data) return data;
    if (typeof data === 'string') return data.replace(/(sk-[A-Za-z0-9]{4})[A-Za-z0-9]{8,}/g, '$1****');
    const text = JSON.stringify(data);
    const masked = text.replace(/(sk-[A-Za-z0-9]{4})[A-Za-z0-9]{8,}/g, '$1****');
    try { return JSON.parse(masked); } catch { return data; }
  };

  const getBoundaries = (context) => {
    const boundaryRules = {
      ai_outbound: { blocked: ['api_keys', 'env_files', 'secrets', 'identity_data'] },
      terminal: { blocked: ['environment', 'secrets'] },
      network: { blocked: ['local_network_scan', 'port_probing'] },
      sandbox: { blocked: ['real_file_write', 'real_terminal_exec'] },
    };
    return boundaryRules[context] || boundaryRules.ai_outbound;
  };

  const validateDataBoundaries = (context, data) => {
    const rules = getBoundaries(context);
    const violations = [];
    for (const field of rules.blocked || []) {
      if (data && Object.prototype.hasOwnProperty.call(data, field)) violations.push({ field, reason: `Blocked in ${context}` });
    }
    return { valid: violations.length === 0, violations };
  };

  const addWhitelist = (identity) => {
    const id = String(identity || '').trim();
    if (!id) return;
    if (!state.whitelist.includes(id)) state.whitelist.push(id);
    persist();
  };

  const blockIdentity = (identity) => {
    const id = String(identity || '').trim();
    if (!id) return;
    if (!state.blocked.includes(id)) state.blocked.push(id);
    persist();
  };

  const removeWhitelist = (identity) => {
    const id = String(identity || '').trim();
    state.whitelist = state.whitelist.filter(i => i !== id);
    persist();
  };

  const removeBlock = (identity) => {
    const id = String(identity || '').trim();
    state.blocked = state.blocked.filter(i => i !== id);
    persist();
  };

  const getWhitelist = () => [...state.whitelist];
  const getBlocked = () => [...state.blocked];
  const getRateLimits = () => {
    const result = {};
    for (const [key, val] of rateLimits) {
      const elapsed = Date.now() - val.windowStart;
      result[key] = { remaining: Math.max(0, state.defaultRatePerMinute - val.count), elapsed };
    }
    return result;
  };
  const resetRateLimits = () => rateLimits.clear();

  return {
    init,
    enforceIdentity,
    enforceRateLimit,
    scanForSecrets,
    maskSecrets,
    validateDataBoundaries,
    getBoundaries,
    addWhitelist,
    blockIdentity,
    removeWhitelist,
    removeBlock,
    getWhitelist,
    getBlocked,
    getRateLimits,
    resetRateLimits,
    setDefaultRatePerMinute: (n) => { if (typeof n === 'number' && n > 0) { state.defaultRatePerMinute = n; persist(); } },
  };
};
