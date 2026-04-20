'use strict';
module.exports = function createKernelMetrics({ send }) {
  const agentMetrics = {};
  const providerMetrics = {};
  const kernelState = { status: 'healthy', startedAt: Date.now(), actionsTotal: 0, alerts: [] };
  let running = false;

  const notify = () => {
    try { send?.('metrics:notify', { kernel: getKernelState(), agents: getAgentMetrics(), providers: getProviderMetrics() }); } catch {}
  };

  const triggerAlert = (type, target, message) => {
    const alert = { id: `${type}:${target}:${Date.now()}`, type, target, message, timestamp: Date.now(), acknowledged: false };
    kernelState.alerts.unshift(alert);
    if (kernelState.alerts.length > 50) kernelState.alerts.pop();
  };

  const init = () => {
    if (running) return;
    running = true;
    setInterval(() => {
      if (!running) return;
      for (const m of Object.values(agentMetrics)) {
        if (!m.lastAction) continue;
        const idleMs = Date.now() - m.lastAction;
        if (idleMs > 300000 && m.actionsTotal > 0 && m.status !== 'unhealthy') m.status = 'idle';
      }
      notify();
    }, 5000);
  };

  const record = (agent, action, outcome, details = {}) => {
    const a = agent || 'unknown';
    if (!agentMetrics[a]) {
      agentMetrics[a] = { actionsTotal: 0, successes: 0, failures: 0, rollbacks: 0, loops: 0, loopsHit: 0, totalTokens: 0, totalLatency: 0, lastAction: 0, successRate: 0, avgLatency: 0, status: 'healthy' };
    }
    const m = agentMetrics[a];
    m.actionsTotal += 1;
    m.lastAction = Date.now();
    m.totalLatency += details.latency || 0;
    m.totalTokens += details.tokens || 0;
    if (outcome === 'success') m.successes += 1;
    else if (outcome === 'failure') m.failures += 1;
    if (details.rollback) m.rollbacks += 1;
    if (details.loop) m.loops += 1;
    if (details.loopHit) m.loopsHit += 1;
    m.successRate = m.actionsTotal > 0 ? +(m.successes / m.actionsTotal * 100).toFixed(1) : 0;
    m.avgLatency = m.actionsTotal > 0 ? +(m.totalLatency / m.actionsTotal).toFixed(0) : 0;
    if (m.successRate < 40 && m.actionsTotal >= 5) { m.status = 'degraded'; triggerAlert('agent_degraded', a, `Success rate ${m.successRate}%`); }
    if (m.failures > m.successes * 2 && m.actionsTotal >= 10) { m.status = 'unhealthy'; triggerAlert('agent_unhealthy', a, `Failures ${m.failures} vs successes ${m.successes}`); }
    kernelState.actionsTotal += 1;
    notify();
  };

  const recordProvider = (provider, outcome, details = {}) => {
    const p = provider || 'unknown';
    if (!providerMetrics[p]) {
      providerMetrics[p] = { requestsTotal: 0, successes: 0, failures: 0, hallucinationIncidents: 0, totalLatency: 0, avgLatency: 0, totalTokens: 0, taskFit: 0, stability: 0, lastRequest: 0 };
    }
    const m = providerMetrics[p];
    m.requestsTotal += 1;
    m.lastRequest = Date.now();
    m.totalTokens += details.tokens || 0;
    m.totalLatency += details.latency || 0;
    m.avgLatency = m.requestsTotal > 0 ? +(m.totalLatency / m.requestsTotal).toFixed(0) : 0;
    if (outcome === 'success') m.successes += 1;
    else m.failures += 1;
    if (details.hallucination) m.hallucinationIncidents += 1;
    m.taskFit = m.requestsTotal > 0 ? +(m.successes / m.requestsTotal * 100).toFixed(1) : 0;
    m.stability = m.taskFit;
    notify();
  };

  const resetAgent = (agent) => {
    const a = agent || 'unknown';
    if (agentMetrics[a]) delete agentMetrics[a];
    notify();
  };

  const resetAll = () => {
    for (const k of Object.keys(agentMetrics)) delete agentMetrics[k];
    for (const k of Object.keys(providerMetrics)) delete providerMetrics[k];
    kernelState.alerts = [];
    kernelState.actionsTotal = 0;
    notify();
  };

  const getAgentMetrics = () => JSON.parse(JSON.stringify(agentMetrics));
  const getProviderMetrics = () => JSON.parse(JSON.stringify(providerMetrics));
  const getAlerts = () => kernelState.alerts.filter(a => !a.acknowledged);
  const getKernelState = () => ({ ...kernelState, uptimeMs: Date.now() - kernelState.startedAt, alerts: getAlerts() });

  const acknowledgeAlert = (id) => {
    const a = kernelState.alerts.find(x => x.id === id);
    if (a) a.acknowledged = true;
    notify();
  };

  return { init, record, recordProvider, resetAgent, resetAll, getAgentMetrics, getProviderMetrics, getKernelState, getAlerts, acknowledgeAlert };
};
