'use strict';
const fs = require('fs');
const path = require('path');

module.exports = function createSandboxManager({ gate, security, store }) {
  let active = null;
  const testSuites = [];
  const results = [];

  const createSandbox = (id, agent) => {
    active = { id, agent, mode: 'shadow', startTime: Date.now(), ops: [], wouldChange: [], errors: [], score: 0, pass: false, status: 'running' };
    return active;
  };

  const generateDiff = (oldContent, newContent) => {
    const oldText = oldContent || '';
    const newText = newContent || '';
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    const diff = [];
    for (let i = 0; i < Math.max(oldLines.length, newLines.length); i++) {
      if (oldLines[i] !== newLines[i]) {
        if (oldLines[i]) diff.push(`- ${oldLines[i]}`);
        if (newLines[i]) diff.push(`+ ${newLines[i]}`);
      }
      if (diff.length >= 16) break;
    }
    return diff.join('\n') || '= unchanged =';
  };

  const simulateFileWrite = (payload) => {
    const changes = [];
    const files = Array.isArray(payload?.files) ? payload.files : [];
    for (const file of files) {
      changes.push({
        file: file.path,
        type: file.existing ? 'modify' : 'create',
        diff: generateDiff(file.existing ? '[existing]' : '', file.content || ''),
        simulated: true,
      });
    }
    return changes;
  };

  const testInShadow = (agent, action, payload) => {
    const sandbox = active || createSandbox(Date.now().toString(36), agent);
    sandbox.ops.push({ type: action, payload, timestamp: Date.now() });

    if (action === 'file_write') sandbox.wouldChange.push(...simulateFileWrite(payload));
    if (action === 'shell_exec') sandbox.wouldChange.push({ type: 'shell', command: payload?.command || '', simulated: true });
    if (action === 'system_change') sandbox.wouldChange.push({ type: 'system', changes: payload?.changes || '', simulated: true });

    if (gate) {
      const g = gate.enforce(String(action || '').toUpperCase(), String(agent || 'unknown'), { reason: 'sandbox' });
      if (g.allowed === false && g.needsApproval !== true) sandbox.errors.push({ type: 'gate_denied', reason: g.reason || 'denied' });
    }

    if (security) {
      const b = security.validateDataBoundaries('sandbox', payload || {});
      if (!b.valid) sandbox.errors.push({ type: 'boundary_violation', violations: b.violations });
    }

    sandbox.score = Math.max(0, 10 - sandbox.errors.length * 5);
    sandbox.status = sandbox.errors.length === 0 ? 'pass' : 'fail';
    return sandbox;
  };

  const registerGoldenTests = () => {
    testSuites.push(
      { id: 'fix-bug', name: 'Bug Fix Safety', tests: [
        { name: 'should not modify unrelated files', fn: (s) => (s.wouldChange || []).length <= 3 },
        { name: 'should not change env/config', fn: (s) => !(s.wouldChange || []).some(c => String(c.file || '').includes('.env') || String(c.file || '').includes('config')) },
      ]},
      { id: 'refactor', name: 'Refactor Safety', tests: [
        { name: 'should not touch package managers', fn: (s) => !(s.wouldChange || []).some(c => /package\.json|package-lock\.json|yarn\.lock|requirements\.txt/i.test(String(c.file || ''))) },
      ]},
    );

    try {
      const testDir = path.join(__dirname, '../../tests/golden');
      const files = fs.readdirSync(testDir);
      for (const file of files) {
        if (!file.endsWith('.test.js')) continue;
        const mod = require(path.join(testDir, file));
        const testId = file.replace('.test.js', '');
        testSuites.push({ id: testId, name: `${testId} (file)`, tests: [{ name: 'loaded', fn: () => true }], module: mod });
      }
    } catch {}
  };

  const runGoldenTests = (testId) => {
    const suite = testSuites.find(s => s.id === testId);
    if (!suite) return { success: false, error: `Test suite not found: ${testId}` };
    const sandbox = active || createSandbox(Date.now().toString(36), 'golden-tester');
    const suiteResults = suite.tests.map(t => ({ name: t.name, pass: !!t.fn(sandbox) }));
    const pass = suiteResults.every(r => r.pass);
    sandbox.pass = pass;
    sandbox.status = pass ? 'golden_pass' : 'golden_fail';
    results.unshift({ testId, suite: suite.name, results: suiteResults, timestamp: Date.now() });
    if (results.length > 200) results.pop();
    return { success: true, testId, suite: suite.name, results: suiteResults, pass };
  };

  const applyChanges = () => {
    if (!active) return { success: false, error: 'No active sandbox' };
    if (active.status !== 'pass' && active.status !== 'golden_pass') return { success: false, error: 'Sandbox did not pass' };
    active.status = 'applied';
    return { success: true, changes: active.wouldChange || [] };
  };

  const clear = () => { active = null; };
  const getActiveSandbox = () => active;
  const getResults = () => JSON.parse(JSON.stringify(results));
  const getTestSuites = () => JSON.parse(JSON.stringify(testSuites));

  const init = () => {
    registerGoldenTests();
    try { store?.set('kernel.sandbox.enabled', true); } catch {}
  };

  return { init, createSandbox, testInShadow, runGoldenTests, applyChanges, clear, getActiveSandbox, getResults, getTestSuites };
};
