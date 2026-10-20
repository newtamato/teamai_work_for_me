import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { loadConfig } from './config.js';

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
export function localFile(root, file) {
  if (typeof file !== 'string' || !file || path.isAbsolute(file) || /^[a-z]:/i.test(file) || file.includes('\\') || file.split('/').includes('..')) return false;
  const absolute = path.resolve(root, file);
  return absolute.startsWith(path.resolve(root) + path.sep) && fs.existsSync(absolute) && fs.lstatSync(absolute).isFile() && fs.realpathSync(absolute).startsWith(fs.realpathSync(root) + path.sep);
}
export function walk(root, folder = '') {
  return fs.readdirSync(path.join(root, folder), { withFileTypes: true }).flatMap((entry) => {
    if (['.git', 'node_modules', '.runtime', '.worktree', 'coverage', '.claude'].includes(entry.name)) return [];
    const file = folder ? `${folder}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) return [];
    return entry.isDirectory() ? walk(root, file) : entry.isFile() ? [file] : [];
  });
}
function trackedFiles(root) {
  try {
    return execFileSync(
      'git',
      ['-c', 'core.quotePath=false', '-C', root, 'ls-files', '-z'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
      .split('\0')
      .filter(Boolean);
  } catch {
    return walk(root);
  }
}

export function validateStructure(root) {
  const errors = [];
  for (const file of ['AGENTS.md', 'README.md', 'agent.config.json', 'rules/development.md', 'rules/memory.md', 'rules/skills.md', 'rules/automations.md', 'rules/collaboration.md']) if (!localFile(root, file)) errors.push(`缺少入口文件：${file}`);
  for (const file of trackedFiles(root).filter((name) => name.endsWith('.md'))) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    // Fenced examples may contain intentionally unresolved consumer placeholders.
    const prose = text.replace(/```[\s\S]*?```/g, '');
    for (const match of prose.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)) {
      const link = match[1];
      if (/^(https?:|mailto:|#)/.test(link) || link.includes('<') || link.includes('{{')) continue;
      const relative = path.posix.normalize(path.posix.join(path.posix.dirname(file), link.split('#')[0]));
      if (!localFile(root, relative)) errors.push(`${file} 引用无效：${link}`);
    }
  }
  return { ok: !errors.length, errors };
}
function buildCapabilities(root) {
  const config = loadConfig(root);
  const capability = config.capabilities;
  if (!capability?.enabled) return { disabled: true, errors: [] };
  const errors = [];
  const declared = capability.sources || [];
  const discovered = [];
  for (const directory of capability.sourceDirectories || []) {
    if (typeof directory !== 'string' || path.isAbsolute(directory) || directory.split('/').includes('..') || !directory || !fs.existsSync(path.join(root, directory)) || fs.lstatSync(path.join(root, directory)).isSymbolicLink()) errors.push('能力源码目录必须为存在的项目内普通目录');
    else discovered.push(...walk(root, directory));
  }
  const listed = [...new Set([...declared, ...discovered])];
  const commands = capability.commands || [];
  const ignored = capability.exclusions || [];
  const ids = new Set();
  const mapped = new Set();
  for (const command of commands) {
    if (!command.id || ids.has(command.id) || !command.description || !Array.isArray(command.sources) || !command.sources.length || !Array.isArray(command.examples) || !command.examples.length) errors.push('能力命令须有唯一id、描述、来源和示例');
    ids.add(command.id);
    for (const file of command.sources || []) {
      mapped.add(file);
      if (!listed.includes(file)) errors.push(`能力来源未纳入sources：${file}`);
    }
  }
  for (const entry of ignored) {
    if (!entry.path || !listed.includes(entry.path) || typeof entry.reason !== 'string' || entry.reason.length < 10) errors.push('能力排除须有已登记来源及具体原因');
    mapped.add(entry.path);
  }
  for (const file of listed) {
    if (!localFile(root, file)) errors.push(`能力来源不存在或不安全：${file}`);
    if (!mapped.has(file)) errors.push(`能力来源未映射到命令或排除说明：${file}`);
  }
  return { errors, snapshot: { schemaVersion: 1, contractHash: hash(JSON.stringify(capability)), sources: Object.fromEntries(listed.filter((file) => localFile(root, file)).sort().map((file) => [file, hash(fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n'))])) } };
}
export function capabilities(root, sync = false) {
  const current = buildCapabilities(root);
  if (current.disabled) return { ok: true, errors: [], disabled: true };
  const errors = current.errors;
  const file = path.join(root, 'doc/capabilities.json');
  if (sync && !errors.length) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.lstatSync(path.dirname(file)).isSymbolicLink() || (fs.existsSync(file) && !localFile(root, 'doc/capabilities.json'))) throw new Error('能力快照必须是仓库内普通文件');
    fs.writeFileSync(file, JSON.stringify(current.snapshot, null, 2) + '\n');
  } else if (!localFile(root, 'doc/capabilities.json')) errors.push('缺少能力快照，审查后执行capabilities sync');
  else if (JSON.stringify(JSON.parse(fs.readFileSync(file, 'utf8'))) !== JSON.stringify(current.snapshot)) errors.push('能力快照已过期，审查CLI/help/schema/Skill并执行capabilities sync');
  return { ok: !errors.length, errors };
}
export function validateCapabilityReview(root, receipt, context) {
  const config = loadConfig(root);
  if (!config.capabilities?.enabled || !context.changedPaths.some((file) => (config.capabilities.sources || []).includes(file) || (config.capabilities.sourceDirectories || []).some((dir) => file.startsWith(dir + '/')))) return { ok: true, errors: [] };
  const review = receipt.cliReview;
  const errors = [];
  if (!review || !['updated', 'unchanged'].includes(review.decision) || typeof review.reason !== 'string' || review.reason.length < 15 || !Array.isArray(review.commands) || !review.commands.length || !Array.isArray(review.evidence) || !review.evidence.length) errors.push('能力来源变化必须记录cliReview及具体理由/命令/证据');
  else {
    const ids = new Set(config.capabilities.commands.map((command) => command.id));
    if (review.commands.some((id) => !ids.has(id))) errors.push('cliReview引用未登记命令');
    if (review.decision === 'updated' && !context.changedPaths.some((file) => file === 'agent.config.json' || file.startsWith('.agents/skills/') || file.startsWith('tests/') || (file.startsWith('doc/') && file !== 'doc/capabilities.json'))) errors.push('updated不能只刷新源指纹，需同步合同/示例/Skill或测试');
  }
  return { ok: !errors.length, errors };
}
export function validateAutomation(root, file) {
  const item = JSON.parse(fs.readFileSync(file, 'utf8'));
  const errors = [];
  if (item.schemaVersion !== 1 || !item.name || !item.schedule || !item.timezone || !['PAUSED', 'ACTIVE'].includes(item.status)) errors.push('定时配置缺少名称、时间、时区、状态或版本');
  if (!localFile(root, item.skill) || !/^\.agents\/skills\/.+\/SKILL\.md$/.test(item.skill || '')) errors.push('定时Skill路径必须存在于项目发现目录');
  const name = item.skill?.split('/').at(-2);
  const match = typeof item.prompt === 'string' && item.prompt.match(/^调用\[\$([a-z0-9-]+)\]\(([^)]+)\)[^\n。!?！？]{1,50}[。.!！]?$/);
  if (!match || match[1] !== name || match[2] !== item.skill) errors.push('定时提示须为一句匹配实际Skill的显式调用，不嵌入长流程');
  return { ok: !errors.length, errors };
}
