import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { capabilities, validateCapabilityReview, validateAutomation, localFile } from '../scripts/template-check.js';
import { runAgent } from '../scripts/agent.js';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-kit-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.writeFileSync(path.join(root, 'scripts/example.js'), 'export const value = 1;');
  const config = { schemaVersion: 1, name: 'synthetic', defaultBranch: 'main', taskPrefix: 'codex/', repository: {}, checks: [], release: { commands: [] }, capabilities: { enabled: true, sources: ['scripts/example.js'], commands: [{ id: 'sample read', description: 'synthetic read', sources: ['scripts/example.js'], examples: ['sample read'] }], exclusions: [] } };
  const save = () => fs.writeFileSync(path.join(root, 'agent.config.json'), JSON.stringify(config));
  save();
  return { root, config, save };
}
test('capability sync cannot bless unmapped sources; source changes invalidate fingerprint', (t) => {
  const { root, config, save } = fixture(t);
  assert.equal(capabilities(root).ok, false);
  assert.equal(capabilities(root, true).ok, true);
  assert.equal(capabilities(root).ok, true);
  fs.appendFileSync(path.join(root, 'scripts/example.js'), '\nchanged');
  assert.equal(capabilities(root).ok, false);
  config.capabilities.sourceDirectories = ['scripts']; save();
  fs.writeFileSync(path.join(root, 'scripts/new-feature.js'), 'new capability');
  assert.equal(capabilities(root, true).ok, false);
  config.capabilities.sources.push('scripts/missing.js'); save();
  assert.equal(capabilities(root, true).ok, false);
  assert.equal(localFile(root, '../outside'), false);
});
test('CLI influence review cannot be omitted or call a fictional command', (t) => {
  const { root } = fixture(t);
  const context = { changedPaths: ['scripts/example.js'] };
  assert.equal(validateCapabilityReview(root, {}, context).ok, false);
  const cliReview = { decision: 'unchanged', reason: 'Internal implementation preserves the existing input contract.', commands: ['sample read'], evidence: ['Synthetic validation passed.'] };
  assert.equal(validateCapabilityReview(root, { cliReview }, context).ok, true);
  assert.equal(validateCapabilityReview(root, { cliReview: { ...cliReview, commands: ['missing'] } }, context).ok, false);
});
test('automation must contain only a matching explicit Skill invocation', (t) => {
  const { root } = fixture(t);
  fs.mkdirSync(path.join(root, '.agents/skills/example'), { recursive: true });
  fs.writeFileSync(path.join(root, '.agents/skills/example/SKILL.md'), 'synthetic');
  const item = { schemaVersion: 1, name: 'sample', skill: '.agents/skills/example/SKILL.md', prompt: '调用[$example](.agents/skills/example/SKILL.md)执行审计。', timezone: 'Asia/Shanghai', schedule: '0 18 * * 1-5', status: 'PAUSED' };
  const file = path.join(root, 'task.json');
  fs.writeFileSync(file, JSON.stringify(item));
  assert.equal(validateAutomation(root, file).ok, true);
  fs.writeFileSync(file, JSON.stringify({ ...item, prompt: item.prompt + '\nThen do something else' }));
  assert.equal(validateAutomation(root, file).ok, false);
});
test('offline help and release plan never execute configured commands', (t) => {
  const { root, config, save } = fixture(t);
  assert.match(runAgent(['help'], root), /merge-check/);
  config.release = { enabled: true, commands: [{ command: 'nonexistent-synthetic', args: [] }] }; save();
  assert.equal(runAgent(['release-plan'], root).executed, false);
  assert.throws(() => runAgent(['bad'], root), /未知/);
});
