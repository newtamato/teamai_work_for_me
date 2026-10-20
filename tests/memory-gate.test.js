import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  getTaskContext,
  validateMemory,
  validateTaskReview,
  writeTaskReview,
  recordValidation,
} from '../scripts/memory-tools.js';

const entry = `# 测试经验

- 类型：工程经验
- 状态：active
- 创建日期：2026-10-03
- 更新日期：2026-10-03
- 适用范围：合成测试
- 关键词：测试
- 来源：临时仓库测试
- 验证方式：test-verified
- 最近核实日期：2026-10-03
- 替代关系：无

## 内容
测试事实。
## 证据与定位
[源码](../source.js)。普通 Token 文档不含实际密钥。
## 下次行动
运行相关测试。
## 失效条件
实现变化。
## 变更记录
- 2026-10-03：新增。
`;
const name = '2026-10-03-example.md';
let baselineRoot;
after(() => {
  if (baselineRoot) fs.rmSync(baselineRoot, { recursive: true, force: true });
});
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-template-memory-gate-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  if (baselineRoot) {
    fs.cpSync(baselineRoot, root, { recursive: true });
    return { root, git };
  }
  git('init', '-b', 'main');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'Memory Test');
  fs.mkdirSync(path.join(root, 'memory'));
  fs.writeFileSync(path.join(root, 'source.js'), 'export const value = 1;\n');
  fs.writeFileSync(path.join(root, '.gitignore'), '.runtime\n');
  fs.writeFileSync(path.join(root, 'memory', name), entry);
  fs.writeFileSync(
    path.join(root, 'memory', 'INDEX.md'),
    `# 索引\n| [示例](${name}) | 工程经验 | active | 2026-10-03 | 测试 | 摘要 |\n`,
  );
  git('add', '.');
  git('commit', '-m', 'baseline');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  git('switch', '-c', 'codex/test-task');
  baselineRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-template-memory-baseline-'));
  fs.cpSync(root, baselineRoot, { recursive: true });
  return { root, git };
}
const none = () => ({
  skillReview: [
    {
      decision: 'none',
      reason: '合成任务没有可复用的操作流程增量。',
      recurrence: '此处仅验证任务审计，不是重复业务流程。',
      evidence: ['临时仓库仅有合成源码和记忆条目。'],
    },
  ],
  decision: 'none',
  summary: '本次仅实现已有设计，没有新增跨任务复用知识。',
  readPaths: ['memory/INDEX.md', `memory/${name}`],
  triggers: [{ kind: 'none', evidence: '已复查现有条目，未发现新增事实或结论。' }],
  entries: [],
});

test('任务必须复盘；main仅要求静态结构；具体none能写入验证凭证', (t) => {
  const { root, git } = fixture(t);
  assert.equal(validateMemory(root).ok, true);
  assert.equal(validateTaskReview(root).ok, false);
  assert.throws(() => writeTaskReview(root, { ...none(), summary: '' }), /summary/);
  assert.throws(() => writeTaskReview(root, { ...none(), skillReview: undefined }), /skillReview/);
  writeTaskReview(root, none());
  assert.equal(validateTaskReview(root).ok, true);
  const receipt = recordValidation(root);
  assert.deepEqual(receipt.checks, { memory: true, skills: true });
  assert.equal(receipt.nodeVersion, process.version);
  assert.equal(validateTaskReview(root).ok, true);
  git('switch', 'main');
  assert.equal(validateTaskReview(root).ok, true);
});

test('updated必须覆盖实际记忆变更，拒绝虚构与漏记', (t) => {
  const { root } = fixture(t);
  const updated = {
    ...none(),
    decision: 'updated',
    entries: [`memory/${name}`],
    triggers: [{ kind: 'verified-fix', evidence: '合成验证确认现有经验需要补充。' }],
  };
  assert.throws(() => writeTaskReview(root, updated), /实际变更/);
  fs.appendFileSync(path.join(root, 'memory', name), '\n补充验证证据。\n');
  assert.throws(() => writeTaskReview(root, none()), /none 必须/);
  writeTaskReview(root, updated);
  assert.equal(validateTaskReview(root).ok, true);
  fs.appendFileSync(path.join(root, 'memory', name), '\n新补充。\n');
  assert.equal(validateTaskReview(root).ok, false);
  fs.unlinkSync(path.join(root, 'memory', name));
  fs.writeFileSync(path.join(root, 'memory', 'INDEX.md'), '# 空索引\n');
  assert.throws(() => writeTaskReview(root, updated), /实际变更/);
});

test('新源码、删除源码、已提交修改和新基线使旧复盘过期', (t) => {
  const { root, git } = fixture(t);
  writeTaskReview(root, none());
  const before = getTaskContext(root).sourceFingerprint;
  fs.writeFileSync(path.join(root, 'new.js'), 'new source');
  assert.notEqual(getTaskContext(root).sourceFingerprint, before);
  assert.equal(validateTaskReview(root).ok, false);
  writeTaskReview(root, none());
  fs.unlinkSync(path.join(root, 'source.js'));
  assert.equal(validateTaskReview(root).ok, false);
  fs.writeFileSync(path.join(root, 'source.js'), 'export const value = 2;\n');
  writeTaskReview(root, none());
  git('add', 'source.js');
  git('commit', '-m', 'source change');
  assert.equal(validateTaskReview(root).ok, true);
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  assert.equal(validateTaskReview(root).ok, false);
});

test('索引缺条目、重复、状态不符、坏证据与缺元数据被拦截', (t) => {
  const { root } = fixture(t);
  const indexPath = path.join(root, 'memory', 'INDEX.md');
  const index = fs.readFileSync(indexPath, 'utf8');
  for (const content of [
    '# 空索引',
    index + index,
    index.replace('active', 'pending'),
    index.replace(name, '2026-10-03-missing.md'),
  ]) {
    fs.writeFileSync(indexPath, content);
    assert.equal(validateMemory(root).ok, false);
  }
  fs.writeFileSync(indexPath, index);
  for (const content of [
    entry.replace('- 来源：临时仓库测试\n', ''),
    entry.replace('../source.js', '../absent.js'),
    entry.replace('../source.js', '../../outside.js'),
    entry.replace('2026-10-03', '2026-02-30'),
    entry.replace('## 下次行动\n运行相关测试。', '## 下次行动\n'),
  ]) {
    fs.writeFileSync(path.join(root, 'memory', name), content);
    assert.equal(validateMemory(root).ok, false);
  }
  fs.writeFileSync(path.join(root, 'memory', name), entry);
  assert.equal(validateMemory(root).ok, true);
});

test('真实密钥模式被拦截，普通Token说明允许', (t) => {
  const { root } = fixture(t);
  assert.equal(validateMemory(root).ok, true);
  fs.appendFileSync(path.join(root, 'memory', name), '\n' + 'ghp_' + 'A'.repeat(36));
  assert.equal(validateMemory(root).ok, false);
});

test('记忆符号链接被拦截，本地证据不能通过链接越出仓库', (t) => {
  const { root } = fixture(t);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-template-memory-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.writeFileSync(path.join(outside, 'evidence.txt'), 'external evidence');
  fs.symlinkSync(outside, path.join(root, 'external'), 'junction');
  fs.writeFileSync(
    path.join(root, 'memory', name),
    entry.replace('../source.js', '../external/evidence.txt'),
  );
  assert.equal(validateMemory(root).ok, false);
  fs.unlinkSync(path.join(root, 'memory', name));
  fs.symlinkSync(outside, path.join(root, 'memory', name), 'junction');
  assert.match(validateMemory(root).errors.join('\n'), /符号链接/);
});

test('不得修改其他任务的审计，写入错误不覆盖既有记录', (t) => {
  const { root, git } = fixture(t);
  fs.mkdirSync(path.join(root, '.delivery', 'memory'), { recursive: true });
  fs.writeFileSync(path.join(root, '.delivery', 'memory', 'old-task.json'), '{}\n');
  git('add', '.delivery');
  git('commit', '-m', 'old review');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  const context = writeTaskReview(root, none());
  const previous = fs.readFileSync(path.join(root, context.receiptPath), 'utf8');
  assert.throws(() => writeTaskReview(root, { ...none(), summary: '' }));
  assert.equal(fs.readFileSync(path.join(root, context.receiptPath), 'utf8'), previous);
  fs.appendFileSync(path.join(root, '.delivery', 'memory', 'old-task.json'), 'changed');
  assert.equal(validateTaskReview(root).ok, false);
});

test('复盘与验收目录链接不能写到其他任务，包括dangling链接', (t) => {
  const { root } = fixture(t);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-template-memory-output-'));
  t.after(() => {
    if (!outside.startsWith(path.join(os.tmpdir(), 'agent-template-memory-output-')))
      throw new Error('清理范围无效');
    fs.rmSync(outside, { recursive: true, force: true });
  });
  writeTaskReview(root, none());
  fs.symlinkSync(outside, path.join(root, '.runtime'), 'junction');
  assert.throws(() => recordValidation(root), /普通目录|链接/);
  assert.equal(fs.existsSync(path.join(outside, 'validation.json')), false);
  fs.unlinkSync(path.join(root, '.runtime'));
  fs.mkdirSync(path.join(root, '.runtime'));
  fs.symlinkSync(
    path.join(outside, 'absent'),
    path.join(root, '.runtime/validation.json'),
    'junction',
  );
  assert.throws(() => recordValidation(root), /普通文件/);
  assert.equal(fs.existsSync(path.join(outside, 'absent')), false);
});
