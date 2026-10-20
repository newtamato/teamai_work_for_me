import { readFileSync, realpathSync } from 'node:fs';
import { join, resolve, relative, isAbsolute, dirname, basename } from 'node:path';
import { homedir } from 'node:os';
import { parseEnv } from 'node:util';
import { execFileSync } from 'node:child_process';
import { root } from './config.js';

function inside(base, path) {
  const rel = relative(base, path);
  return (
    rel === '' ||
    (!rel.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) &&
      rel !== '..' &&
      !isAbsolute(rel))
  );
}
function repositoryRoot(projectRoot) {
  try {
    const common = execFileSync(
      'git',
      ['-C', projectRoot, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    return basename(common) === '.git' ? dirname(common) : projectRoot;
  } catch {
    return projectRoot;
  }
}
export function loadSkillCredentials(names, { env = process.env, projectRoot = root } = {}) {
  if (
    !Array.isArray(names) ||
    names.some((name) => typeof name !== 'string' || !/^[A-Z][A-Z0-9_]*$/.test(name))
  )
    throw new Error('认证变量必须使用大写环境变量名');
  const values = Object.fromEntries(
    names.filter((name) => Object.hasOwn(env, name)).map((name) => [name, env[name]]),
  );
  const absent = names.filter((name) => !Object.hasOwn(env, name));
  if (absent.length) {
    const configured = env.AGENT_SKILL_CREDENTIALS_FILE;
    const file =
      configured ||
      join(
        process.platform === 'win32'
          ? env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
          : env.XDG_CONFIG_HOME || join(homedir(), '.config'),
        process.platform === 'win32' ? 'AgentProjectTemplate' : 'agent-project-template',
        'credentials',
        'skills.env',
      );
    if (!isAbsolute(file) || !file.endsWith('.env'))
      throw new Error('认证文件必须是项目外.env的绝对路径');
    const projectLexical = resolve(projectRoot);
    const mainLexical = repositoryRoot(projectLexical);
    const filePath = resolve(file);
    if (inside(projectLexical, filePath) || inside(mainLexical, filePath))
      throw new Error('禁止从项目目录读取认证文件');
    const project = realpathSync(projectLexical);
    const main = realpathSync(mainLexical);
    try {
      const actual = realpathSync(filePath);
      if (inside(project, actual) || inside(main, actual))
        throw new Error('认证文件链接不能指向项目目录');
      const parsed = parseEnv(readFileSync(actual, 'utf8'));
      for (const name of absent) if (Object.hasOwn(parsed, name)) values[name] = parsed[name];
    } catch (error) {
      if (error.message === '认证文件链接不能指向项目目录') throw error;
      if (error.code !== 'ENOENT' || configured) throw new Error('外部认证文件无法安全读取或解析');
    }
  }
  const missing = names.filter((name) => typeof values[name] !== 'string' || !values[name].trim());
  if (missing.length)
    throw new Error(
      `缺少认证环境变量：${missing.join(', ')}；可配置项目外AGENT_SKILL_CREDENTIALS_FILE`,
    );
  return Object.fromEntries(names.map((name) => [name, values[name]]));
}
