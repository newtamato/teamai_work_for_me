import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkSkillReview } from '../scripts/skill-review.js';

const target = '.agents/skills/sample/SKILL.md';
const content = `---
name: sample
description: 合成数据解析及回读
metadata:
  author: Test Maintainer
  version: '1.0.0'
  created_at: '2026-10-07'
  updated_at: '2026-10-07'
---
操作并核对合成输出。
`;
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-template-skill-review-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.dirname(path.join(root, target)), { recursive: true });
  fs.writeFileSync(path.join(root, target), content);
  return root;
}
const item = (decision, extra = {}) => ({
  decision,
  reason: '用户明确要求以后重复使用这个流程。',
  recurrence: '每日导入属于明确会重复发生的任务。',
  evidence: ['合成输入验证成功，且用户已表达重复意图。'],
  ...extra,
});
const context = (changedPaths = [], baselineSkills = []) => ({ changedPaths, baselineSkills });

test('每个任务必须判断；none/defer 允许不生成 Skill', (t) => {
  const root = fixture(t);
  assert.match(checkSkillReview(root, undefined, context()).join(), /skillReview/);
  assert.equal(checkSkillReview(root, [item('none')], context()).length, 0);
  assert.match(checkSkillReview(root, [item('defer')], context()).join(), /nextStep/);
  assert.equal(
    checkSkillReview(
      root,
      [item('defer', { nextStep: '第二次独立任务后重核流程与复用价值。' })],
      context(),
    ).length,
    0,
  );
  assert.ok(checkSkillReview(root, [item('none', { target })], context()).length);
  assert.ok(checkSkillReview(root, [item('unknown')], context()).length);
});

test('create/update/reuse 与基线及整个 Skill 资源变更一致', (t) => {
  const root = fixture(t);
  const created = item('create', { target, validation: ['正常输入及未知格式拒绝场景均已验证。'] });
  assert.equal(checkSkillReview(root, [created], context([target])).length, 0);
  assert.ok(checkSkillReview(root, [created], context([target], [target])).length);
  assert.equal(
    checkSkillReview(
      root,
      [{ ...created, decision: 'update' }],
      context(['.agents/skills/sample/scripts/read.js'], [target]),
    ).length,
    0,
  );
  assert.ok(checkSkillReview(root, [item('none')], context([target])).length);
  assert.ok(
    checkSkillReview(root, [item('reuse', { target })], context([target], [target])).length,
  );
  assert.equal(
    checkSkillReview(root, [item('reuse', { target })], context([], [target])).length,
    0,
  );
  assert.ok(checkSkillReview(root, [{ ...created, validation: [] }], context([target])).length);
  assert.ok(checkSkillReview(root, [created, created], context([target])).length);
});

test('拒绝虚构/逃逸目标、缺 metadata、错误日期及坏引用', (t) => {
  const root = fixture(t);
  const created = item('create', { target, validation: ['代表性合成场景已经运行并核验输出。'] });
  for (const broken of [
    content.replace('name: sample', 'name: wrong'),
    content.replace("version: '1.0.0'", 'version: wrong'),
    content.replace('author: Test Maintainer', 'author:'),
    content.replaceAll('2026-10-07', '2026-02-30'),
    content.replaceAll('2026-10-07', '2026-99-99'),
    content + '\n[reference](references/missing.md)',
    content + '\n[escape](../../../../outside.md)',
  ]) {
    fs.writeFileSync(path.join(root, target), broken);
    assert.ok(checkSkillReview(root, [created], context([target])).length);
  }
  fs.writeFileSync(path.join(root, target), content);
  assert.ok(
    checkSkillReview(root, [{ ...created, target: '../sample/SKILL.md' }], context([target]))
      .length,
  );
  fs.unlinkSync(path.join(root, target));
  assert.ok(checkSkillReview(root, [created], context([target])).length);
});
