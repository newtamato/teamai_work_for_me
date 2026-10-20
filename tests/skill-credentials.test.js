import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { loadSkillCredentials } from '../scripts/skill-credentials.js';
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
const TOKEN = 'AGENT_SKILL_TEST_TOKEN',
  USER = 'AGENT_SKILL_TEST_USERNAME';
async function fixture(t) {
  const dir = await temporary(t),
    project = join(dir, 'project');
  mkdirSync(project);
  return { dir, project, file: join(dir, 'credentials.env') };
}
test('环境变量足够时不读取文件，只返回请求的变量', async (t) => {
  const { project } = await fixture(t),
    env = {
      [TOKEN]: 'synthetic-env',
      [USER]: 'synthetic-user',
      UNRELATED_SECRET: 'unused',
      AGENT_SKILL_CREDENTIALS_FILE: join(project, 'forbidden.env'),
    };
  assert.deepEqual(loadSkillCredentials([TOKEN], { env, projectRoot: project }), {
    [TOKEN]: 'synthetic-env',
  });
  assert.equal(env.UNRELATED_SECRET, 'unused');
});
test('项目外.env仅补缺失值，不覆盖环境变量或修改全局环境', async (t) => {
  const { project, file } = await fixture(t);
  writeFileSync(
    file,
    `${TOKEN}="synthetic-file-token"\n${USER}=file-user\nUNRELATED_SECRET=unused\n`,
    { mode: 0o600 },
  );
  const env = { [USER]: 'env-user', AGENT_SKILL_CREDENTIALS_FILE: file };
  assert.deepEqual(loadSkillCredentials([TOKEN, USER], { env, projectRoot: project }), {
    [TOKEN]: 'synthetic-file-token',
    [USER]: 'env-user',
  });
  assert.equal(env[TOKEN], undefined);
  assert.throws(
    () =>
      loadSkillCredentials([TOKEN], {
        env: { [TOKEN]: '', AGENT_SKILL_CREDENTIALS_FILE: file },
        projectRoot: project,
      }),
    /缺少认证环境变量/,
  );
});
test('项目内路径和项目外指回项目的目录链接均拒绝读取', async (t) => {
  const { dir, project } = await fixture(t),
    inside = join(project, 'credentials.env');
  writeFileSync(inside, `${TOKEN}=synthetic-private-value`);
  assert.throws(
    () =>
      loadSkillCredentials([TOKEN], {
        env: { AGENT_SKILL_CREDENTIALS_FILE: inside },
        projectRoot: project,
      }),
    /禁止从项目目录/,
  );
  const alias = join(dir, 'external-alias');
  symlinkSync(project, alias, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(
    () =>
      loadSkillCredentials([TOKEN], {
        env: { AGENT_SKILL_CREDENTIALS_FILE: join(alias, 'credentials.env') },
        projectRoot: project,
      }),
    /链接不能指向项目/,
  );
});
test('缺失、相对路径、无效变量仅返回安全错误，不回显凭据', async (t) => {
  const { project, file } = await fixture(t);
  writeFileSync(file, `UNRELATED_SECRET=synthetic-private-value`);
  assert.throws(
    () =>
      loadSkillCredentials([TOKEN], {
        env: { AGENT_SKILL_CREDENTIALS_FILE: file },
        projectRoot: project,
      }),
    (error) => error.message.includes(TOKEN) && !error.message.includes('synthetic-private-value'),
  );
  assert.throws(
    () =>
      loadSkillCredentials([TOKEN], {
        env: { AGENT_SKILL_CREDENTIALS_FILE: 'relative.env' },
        projectRoot: project,
      }),
    /绝对路径/,
  );
  assert.throws(
    () => loadSkillCredentials(['__proto__'], { env: {}, projectRoot: project }),
    /大写环境变量/,
  );
  assert.throws(
    () =>
      loadSkillCredentials([TOKEN], {
        env: { AGENT_SKILL_CREDENTIALS_FILE: join(project, '..', 'missing.env') },
        projectRoot: project,
      }),
    /无法安全读取/,
  );
});
