import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdirSync, lstatSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { linkProjectSkills } from '../scripts/link-skills.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
async function temporary(t) {
  const prefix = join(tmpdir(), 'agent-template-test-');
  const dir = await mkdtemp(prefix);
  t.after(async () => {
    if (!dir.startsWith(prefix)) throw new Error('Invalid cleanup path');
    await rm(dir, { recursive: true, force: true });
  });
  return dir;
}
test('技能入口共享同一目录，重复初始化安全复用', async (t) => {
  const dir = await temporary(t),
    result = linkProjectSkills(dir);
  assert.equal(lstatSync(result.link).isSymbolicLink(), true);
  assert.equal(realpathSync(result.link), realpathSync(result.target));
  mkdirSync(join(result.target, 'fixture-skill'));
  writeFileSync(join(result.target, 'fixture-skill', 'SKILL.md'), 'synthetic skill');
  assert.equal(
    readFileSync(join(result.link, 'fixture-skill', 'SKILL.md'), 'utf8'),
    'synthetic skill',
  );
  assert.equal(linkProjectSkills(dir).reused, true);
});
test('已有Claude技能目录不能被初始化脚本覆盖', async (t) => {
  const dir = await temporary(t),
    link = join(dir, '.claude', 'skills');
  mkdirSync(link, { recursive: true });
  writeFileSync(join(link, 'keep.txt'), '保留内容');
  assert.throws(() => linkProjectSkills(dir), /现有内容未修改/);
  assert.equal(readFileSync(join(link, 'keep.txt'), 'utf8'), '保留内容');
});
