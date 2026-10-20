import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { checkSkillReview } from './skill-review.js';

const statuses = new Set(['active', 'pending', 'superseded', 'revoked']);
const kinds = new Set([
  'user-preference',
  'project-fact',
  'design-decision',
  'verified-fix',
  'repeated-issue',
  'correction',
  'none',
]);
const receiptPrefix = '.delivery/memory/';
const baselineCache = new Map();
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const git = (root, args) =>
  execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
const files = (root, args) => git(root, args).split('\0').filter(Boolean);
const isEntry = (file) =>
  /^memory\/.+\.md$/.test(file) && !['memory/INDEX.md', 'memory/TEMPLATE.md'].includes(file);
const result = (errors, context) => ({
  ok: errors.length === 0,
  errors,
  ...(context ? { context } : {}),
});

function taskPrefixOf(root) {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'agent.config.json'), 'utf8'));
    return typeof config.taskPrefix === 'string' ? config.taskPrefix : 'codex/';
  } catch {
    return 'codex/';
  }
}

function containedFile(root, relative) {
  if (
    typeof relative !== 'string' ||
    !relative ||
    path.isAbsolute(relative) ||
    /^[a-z]:/i.test(relative)
  )
    return false;
  const resolved = path.resolve(root, relative);
  if (!resolved.startsWith(path.resolve(root) + path.sep) || !fs.existsSync(resolved)) return false;
  return (
    fs.realpathSync(resolved).startsWith(fs.realpathSync(root) + path.sep) &&
    fs.statSync(resolved).isFile()
  );
}

function ensureOrdinaryDirectory(root, relative) {
  let current = path.resolve(root);
  for (const segment of relative.split('/')) {
    current = path.join(current, segment);
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      fs.mkdirSync(current);
      stat = fs.lstatSync(current);
    }
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      !fs.realpathSync(current).startsWith(fs.realpathSync(root) + path.sep)
    )
      throw new Error('复盘及验收目录必须是仓库内普通目录，不能使用链接');
  }
  return current;
}

function requireOrdinaryOutput(file) {
  try {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('复盘及验收输出必须为普通文件');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

export function getTaskContext(root) {
  const dotGit = path.join(root, '.git');
  const gitDir = fs.statSync(dotGit).isDirectory()
    ? dotGit
    : path.resolve(
        root,
        fs
          .readFileSync(dotGit, 'utf8')
          .trim()
          .replace(/^gitdir: /, ''),
      );
  const commonFile = path.join(gitDir, 'commondir');
  const commonDir = fs.existsSync(commonFile)
    ? path.resolve(gitDir, fs.readFileSync(commonFile, 'utf8').trim())
    : gitDir;
  const taskPrefix = taskPrefixOf(root);
  const branch = fs
    .readFileSync(path.join(gitDir, 'HEAD'), 'utf8')
    .trim()
    .replace(/^ref: refs\/heads\//, '');
  const task = branch.startsWith(taskPrefix) ? branch.slice(taskPrefix.length) : branch;
  if (branch.startsWith(taskPrefix) && !/^[a-z0-9][a-z0-9-]*$/.test(task))
    throw new Error('任务名称必须为小写字母、数字及连字符');
  const baseRef = path.join(commonDir, 'refs', 'remotes', 'origin', 'main');
  const packed = path.join(commonDir, 'packed-refs');
  const base = fs.existsSync(baseRef)
    ? fs.readFileSync(baseRef, 'utf8').trim()
    : fs.existsSync(packed)
      ? fs.readFileSync(packed, 'utf8').match(/^([a-f0-9]+) refs\/remotes\/origin\/main$/m)?.[1]
      : undefined;
  if (!base) throw new Error('缺少 origin/main，请先 fetch');
  if (!baselineCache.has(base))
    baselineCache.set(base, files(root, ['ls-tree', '-r', '-z', '--name-only', base]));
  const baseline = baselineCache.get(base);
  const current = files(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']);
  const baselineSet = new Set(baseline);
  const changedPaths = [
    ...new Set([
      ...files(root, ['diff', '--name-only', '-z', base]),
      ...current.filter((file) => !baselineSet.has(file)),
    ]),
  ];
  const paths = [...new Set([...baseline, ...current])]
    .filter((file) => !file.startsWith(receiptPrefix))
    .sort();
  const fingerprint = crypto.createHash('sha256');
  const changedMemory = changedPaths.filter(isEntry);
  for (const file of paths) {
    const absolute = path.join(root, file);
    const exists = fs.existsSync(absolute);
    const contentHash = exists
      ? hash(
          fs.lstatSync(absolute).isSymbolicLink()
            ? fs.readlinkSync(absolute)
            : fs.readFileSync(absolute),
        )
      : 'deleted';
    fingerprint.update(JSON.stringify([file, contentHash]) + '\n');
  }
  return {
    task,
    branch,
    taskPrefix,
    base,
    sourceFingerprint: fingerprint.digest('hex'),
    receiptPath: `${receiptPrefix}${task.replace(/[^a-z0-9-]/gi, '-')}.json`,
    changedMemory,
    changedPaths,
    baselineSkills: baseline.filter((file) => /^\.agents\/skills\/[^/]+\/SKILL\.md$/.test(file)),
  };
}

function validDate(value) {
  const date = value?.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  return (
    !!date && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date
  );
}

export function validateMemory(root) {
  const errors = [];
  const directory = path.join(root, 'memory');
  if (!fs.existsSync(directory) || fs.lstatSync(directory).isSymbolicLink())
    return result(['memory 必须是仓库内普通目录']);
  const names = fs.readdirSync(directory).filter((name) => name.endsWith('.md'));
  const indexPath = path.join(directory, 'INDEX.md');
  if (!fs.existsSync(indexPath) || fs.lstatSync(indexPath).isSymbolicLink())
    return result(['memory/INDEX.md 缺失或为符号链接']);
  const index = fs.readFileSync(indexPath, 'utf8');
  const indexed = new Map();
  for (const row of index.split(/\r?\n/).filter((line) => line.startsWith('|'))) {
    const columns = row.split('|').map((value) => value.trim());
    const link = columns[1]?.match(/\]\(([^)]+)\)/)?.[1];
    if (!link) continue;
    const file = `memory/${link}`;
    if (!isEntry(file) || link.includes('/') || !names.includes(link))
      errors.push(`索引条目不存在或路径无效：${link}`);
    if (indexed.has(link)) errors.push(`索引重复条目：${link}`);
    indexed.set(link, { status: columns[3], date: columns[4] });
  }
  for (const name of names) {
    const absolute = path.join(directory, name);
    if (fs.lstatSync(absolute).isSymbolicLink()) {
      errors.push(`记忆文件不得为符号链接：${name}`);
      continue;
    }
    const text = fs.readFileSync(absolute, 'utf8');
    if (
      /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[A-Z0-9]{16}|sk-(?:proj-)?[A-Za-z0-9_-]{32,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(
        text,
      )
    )
      errors.push(`${name} 包含疑似真实凭据`);
    for (const link of text.matchAll(/\]\(([^)]+)\)/g)) {
      const target = link[1].replace(/^<|>$/g, '').split('#')[0];
      if (!target || /^[a-z][a-z\d+.-]*:\/\//i.test(target) || /^mailto:/i.test(target)) continue;
      let decoded;
      try {
        decoded = decodeURIComponent(target);
      } catch {
        errors.push(`${name} 链接编码无效`);
        continue;
      }
      if (
        path.isAbsolute(decoded) ||
        /^[a-z]:/i.test(decoded) ||
        !containedFile(root, path.posix.join('memory', decoded))
      )
        errors.push(`${name} 本地证据链接不存在或越出仓库：${target}`);
    }
    if (['INDEX.md', 'TEMPLATE.md'].includes(name)) continue;
    if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/.test(name) || !validDate(name))
      errors.push(`记忆文件名无效：${name}`);
    if (!indexed.has(name)) errors.push(`记忆未加入索引：${name}`);
    const metadata = {};
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^- ([^：]+)：(.+)$/);
      if (match) metadata[match[1]] = match[2].trim();
    }
    for (const key of [
      '类型',
      '状态',
      '创建日期',
      '更新日期',
      '适用范围',
      '关键词',
      '来源',
      '验证方式',
      '最近核实日期',
      '替代关系',
    ]) {
      if (!metadata[key]) errors.push(`${name} 缺少元数据：${key}`);
    }
    if (!statuses.has(metadata['状态'])) errors.push(`${name} 状态无效`);
    if (!['用户偏好', '项目事实', '设计决策', '工程经验'].includes(metadata['类型']))
      errors.push(`${name} 类型无效`);
    if (
      !/(user-reported|code-verified|test-verified|document-derived)/.test(
        metadata['验证方式'] ?? '',
      )
    )
      errors.push(`${name} 验证方式无效`);
    for (const key of ['创建日期', '更新日期'])
      if (!validDate(metadata[key])) errors.push(`${name} ${key}无效`);
    if (!metadata['最近核实日期']?.startsWith('未核实') && !validDate(metadata['最近核实日期']))
      errors.push(`${name} 最近核实日期无效`);
    if (metadata['创建日期']?.slice(0, 10) > metadata['更新日期']?.slice(0, 10))
      errors.push(`${name} 更新日期早于创建日期`);
    for (const heading of ['内容', '证据与定位', '下次行动', '失效条件', '变更记录']) {
      const section = text.match(
        new RegExp(`^## ${heading}\\s*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm'),
      );
      if (!section?.[1]?.trim()) errors.push(`${name} 缺少非空章节：${heading}`);
    }
    const row = indexed.get(name);
    if (row && (row.status !== metadata['状态'] || row.date !== metadata['更新日期']?.slice(0, 10)))
      errors.push(`${name} 索引状态或日期不一致`);
  }
  return result(errors);
}

function checkReview(root, review, context) {
  const errors = [
    ...checkSkillReview(root, review.skillReview, context),
  ];
  for (const key of ['schemaVersion', 'task', 'branch', 'base', 'sourceFingerprint']) {
    const expected = key === 'schemaVersion' ? 1 : context[key];
    if (review[key] !== expected) errors.push(`任务复盘 ${key} 不匹配或已过期`);
  }
  if (!['updated', 'none'].includes(review.decision)) errors.push('任务复盘 decision 无效');
  if (typeof review.summary !== 'string' || review.summary.trim().length < 10)
    errors.push('任务复盘 summary 必须提供具体理由（至少10个字符）');
  if (
    !Array.isArray(review.readPaths) ||
    !review.readPaths.includes('memory/INDEX.md') ||
    review.readPaths.some((file) => !containedFile(root, file))
  )
    errors.push('任务复盘 readPaths 必须包含已读取的索引及存在的仓库文件');
  if (
    !Array.isArray(review.triggers) ||
    !review.triggers.length ||
    review.triggers.some(
      (trigger) =>
        !kinds.has(trigger.kind) ||
        typeof trigger.evidence !== 'string' ||
        trigger.evidence.trim().length < 5,
    )
  )
    errors.push('任务复盘 triggers 必须包含合法类型和具体证据');
  if (!Array.isArray(review.entries) || new Set(review.entries).size !== review.entries?.length)
    errors.push('任务复盘 entries 必须是不重复的路径数组');
  else if (review.decision === 'updated') {
    if (
      !review.entries.length ||
      review.entries.some(
        (file) =>
          !isEntry(file) || !containedFile(root, file) || !context.changedMemory.includes(file),
      ) ||
      context.changedMemory.some((file) => !review.entries.includes(file))
    )
      errors.push('updated 必须覆盖全部实际变更的记忆条目，不得声明未变更条目');
    if (review.triggers?.some((trigger) => trigger.kind === 'none'))
      errors.push('updated 不能使用 none 触发');
  } else if (
    review.entries.length ||
    context.changedMemory.length ||
    review.triggers?.some((trigger) => trigger.kind !== 'none')
  )
    errors.push('none 必须无记忆条目变更、entries 为空、触发仅为 none');
  return errors;
}

export function validateTaskReview(root) {
  let context;
  try {
    context = getTaskContext(root);
  } catch (error) {
    return result([`无法读取任务基线：${error.message}`]);
  }
  if (context.branch === 'main') return result([], context);
  if (!context.branch.startsWith(context.taskPrefix))
    return result([`开发任务必须使用 ${context.taskPrefix || '(无前缀)'} 分支`], context);
  const errors = [];
  for (const file of context.changedPaths) {
    if (file.startsWith(receiptPrefix) && file !== context.receiptPath)
      errors.push(`禁止修改其他任务复盘：${file}`);
  }
  if (
    !containedFile(root, context.receiptPath) ||
    fs.lstatSync(path.join(root, context.receiptPath)).isSymbolicLink()
  )
    return result([...errors, `缺少普通文件任务复盘：${context.receiptPath}`], context);
  try {
    errors.push(
      ...checkReview(
        root,
        JSON.parse(fs.readFileSync(path.join(root, context.receiptPath), 'utf8')),
        context,
      ),
    );
  } catch (error) {
    errors.push(`任务复盘无效：${error.message}`);
  }
  return result(errors, context);
}

export function writeTaskReview(root, input) {
  const context = getTaskContext(root);
  if (context.branch === 'main' || !context.branch.startsWith(context.taskPrefix))
    throw new Error(`只能为 ${context.taskPrefix || '(无前缀)'} 任务分支写复盘`);
  const review = {
    ...input,
    schemaVersion: 1,
    task: context.task,
    branch: context.branch,
    base: context.base,
    sourceFingerprint: context.sourceFingerprint,
  };
  const errors = [...validateMemory(root).errors, ...checkReview(root, review, context)];
  if (errors.length) throw new Error(errors.join('\n'));
  const destination = path.join(root, context.receiptPath);
  ensureOrdinaryDirectory(root, '.delivery/memory');
  requireOrdinaryOutput(destination);
  fs.writeFileSync(destination, JSON.stringify(review, null, 2) + '\n');
  return context;
}

export function recordValidation(root) {
  const checked = validateTaskReview(root);
  const errors = [...validateMemory(root).errors, ...checked.errors];
  if (errors.length) throw new Error(errors.join('\n'));
  ensureOrdinaryDirectory(root, '.runtime');
  requireOrdinaryOutput(path.join(root, '.runtime/validation.json'));
  const receipt = {
    schemaVersion: 1,
    task: checked.context.task,
    base: checked.context.base,
    sourceFingerprint: checked.context.sourceFingerprint,
    nodeVersion: process.version,
    checks: { memory: true, skills: true },
    validatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(root, '.runtime/validation.json'),
    JSON.stringify(receipt, null, 2) + '\n',
  );
  return receipt;
}
