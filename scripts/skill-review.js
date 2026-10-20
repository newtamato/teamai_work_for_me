import fs from 'node:fs';
import path from 'node:path';

const entryPattern = /^\.agents\/skills\/([a-z0-9]+(?:-[a-z0-9]+)*)\/SKILL\.md$/;
const text = (value) => typeof value === 'string' && value.trim().length >= 10;
const list = (value) => Array.isArray(value) && value.length > 0 && value.every(text);

function ordinaryFile(root, file) {
  if (typeof file !== 'string' || path.isAbsolute(file) || /^[a-z]:/i.test(file)) return false;
  const absolute = path.resolve(root, file);
  return (
    absolute.startsWith(path.resolve(root) + path.sep) &&
    fs.existsSync(absolute) &&
    fs.statSync(absolute).isFile() &&
    fs.realpathSync(absolute).startsWith(fs.realpathSync(root) + path.sep) &&
    !fs.lstatSync(absolute).isSymbolicLink()
  );
}

function validateEntry(root, file) {
  const errors = [];
  const content = fs.readFileSync(path.join(root, file), 'utf8');
  const front = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
  const field = (key, indent = '') =>
    front
      ?.match(new RegExp(`^${indent}${key}:[ \\t]*([^\\r\\n]+)$`, 'm'))?.[1]
      ?.trim()
      .replace(/^['"]|['"]$/g, '');
  const name = entryPattern.exec(file)[1];
  if (name.length >= 64 || field('name') !== name || !field('description'))
    errors.push(`${file} frontmatter name/description 或目录名无效`);
  if (
    !/^metadata:\s*$/m.test(front || '') ||
    !field('author', '  ') ||
    !/^\d+\.\d+\.\d+$/.test(field('version', '  ') || '')
  )
    errors.push(`${file} 缺少有效 author/version metadata`);
  const dates = ['created_at', 'updated_at'].map((key) => field(key, '  '));
  if (
    dates.some(
      (date) =>
        !/^\d{4}-\d{2}-\d{2}$/.test(date || '') ||
        !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) ||
        new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date,
    ) ||
    dates[0] > dates[1]
  )
    errors.push(`${file} 创建/更新日期无效`);
  for (const match of content.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)) {
    const link = match[1];
    if (/^(https?:|mailto:|#)/i.test(link)) continue;
    const target = path.posix.normalize(
      path.posix.join(path.posix.dirname(file), link.split('#')[0]),
    );
    if (!ordinaryFile(root, target)) errors.push(`${file} 本地引用无效：${link}`);
  }
  return errors;
}

// This checks the declared review and actual changed skill families, not the truth of prose evidence.
export function checkSkillReview(root, review, context) {
  const errors = [];
  const changed = new Set(
    context.changedPaths
      .map((file) => file.match(/^(\.agents\/skills\/[^/]+)\//)?.[1])
      .filter(Boolean),
  );
  if (!Array.isArray(review) || !review.length)
    return ['任务复盘 skillReview 必须包含至少一项 Skill 判断'];
  const targets = new Set();
  for (const item of review) {
    if (
      !item ||
      !['create', 'update', 'reuse', 'defer', 'none'].includes(item.decision) ||
      !text(item.reason) ||
      !text(item.recurrence) ||
      !list(item.evidence)
    ) {
      errors.push('skillReview 必须提供合法 decision、具体 reason、recurrence 和 evidence');
      continue;
    }
    if (['none', 'defer'].includes(item.decision)) {
      if (item.target !== undefined) errors.push('none/defer 不声明已存在的 target');
      if (item.decision === 'defer' && !text(item.nextStep))
        errors.push('defer 必须提供可再次判断的 nextStep');
      continue;
    }
    const match = typeof item.target === 'string' && entryPattern.exec(item.target);
    if (!match || !ordinaryFile(root, item.target) || targets.has(item.target)) {
      errors.push('skillReview target 必须是不重复的现有项目 SKILL.md 普通文件');
      continue;
    }
    targets.add(item.target);
    const family = `.agents/skills/${match[1]}`;
    const hasChanges = changed.has(family);
    if ((item.decision === 'reuse') === hasChanges)
      errors.push(`${item.target} 判断与实际 Skill 变更不一致`);
    if (item.decision !== 'reuse') {
      const existed = context.baselineSkills.includes(item.target);
      if ((item.decision === 'create') === existed)
        errors.push(`${item.target} create/update 与基线不一致`);
      if (!list(item.validation))
        errors.push(`${item.target} create/update 必须提供代表性场景验证`);
      errors.push(...validateEntry(root, item.target));
    }
  }
  for (const family of changed) {
    if (!targets.has(`${family}/SKILL.md`)) errors.push(`skillReview 未覆盖实际变更：${family}`);
  }
  return errors;
}
