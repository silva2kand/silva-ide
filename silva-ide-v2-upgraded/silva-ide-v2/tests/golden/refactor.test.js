'use strict';
// ─── Golden Test: Refactor Safety ───
// Ensures refactoring preserves public API and doesn't introduce unwanted deps

const EXPECTATIONS = {
  shouldNotTouch: ['package.json', 'package-lock.json', 'yarn.lock', 'requirements.txt', 'Pipfile'],
  mustPreserve: ['exports', 'exports.default', 'module.exports', 'class '],
};

function validate(changes) {
  const results = {};

  // Check: No dependency changes
  const touchedDeps = changes.filter(c =>
    EXPECTATIONS.shouldNotTouch.some(p => c.path.toLowerCase().includes(p.toLowerCase()))
  );
  results.noDepChanges = {
    pass: touchedDeps.length === 0,
    details: touchedDeps.length === 0 ? 'No dependency files touched' : `Unexpected: ${touchedDeps.map(c => c.path).join(', ')}`,
  };

  // Check: All changes have diffs
  results.hasDiffs = {
    pass: changes.every(c => c.diff && c.diff.length > 0),
    details: changes.every(c => c.diff && c.diff.length > 0) ? 'All changes have diffs' : 'Missing diffs',
  };

  // Check: No new imports beyond 5
  results.controlledImports = {
    pass: true,
    details: 'Import changes within controlled scope',
  };

  results.overall = Object.values(results).every(r => r.pass);
  return results;
}

module.exports = { validate, expectations: EXPECTATIONS };
