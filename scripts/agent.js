#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { loadConfig } from './config.js';
import { validateMemory, validateTaskReview, writeTaskReview, recordValidation, getTaskContext } from './memory-tools.js';
import { validateStructure, capabilities, validateCapabilityReview, validateAutomation, localFile } from './template-check.js';

const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const requirePass = (result) => { if (!result.ok) throw new Error(result.errors.join('\n')); return result; };
const help = `Agent project template
用法：npm run agent -- <命令>
help                              离线帮助
memory-check                      检查知识结构及当前任务复盘
review --input <JSON>              写入任务memory/Skill/可选CLI影响复盘
check                             结构、记忆、Skill、可选能力、测试及配置检查
merge-check                       已提交且洁净任务、最新远程基线与验收守卫；不执行平台合并
task create <slug>                 从洁净main建立.worktree/<slug>及任务分支
task status                       查询已有工作树
capabilities sync|check            可选项目CLI来源映射与指纹
automation check <JSON>            检查模板定时配置只调用实际Skill
release-plan                      查看可选发布配置；不执行部署
首次生成无远程仓库可按接入文档初始化基线；正常任务需真实origin/main。
所有外部合并/发布仍按维护者明确授权执行，不自动创建/启用平台定时任务。`;

export function runChecks(root, { runTests = true } = {}) {
  const config = loadConfig(root);
  const runtime = path.join(root, '.runtime');
  if (fs.existsSync(runtime) && fs.lstatSync(runtime).isSymbolicLink()) throw new Error('.runtime不能为链接');
  const validation = path.join(runtime, 'validation.json');
  if (fs.existsSync(validation)) fs.unlinkSync(validation);
  requirePass(validateStructure(root));
  requirePass(validateMemory(root));
  const review = requirePass(validateTaskReview(root));
  requirePass(capabilities(root));
  if (review.context.branch !== 'main') {
    const receipt = JSON.parse(fs.readFileSync(path.join(root, review.context.receiptPath), 'utf8'));
    requirePass(validateCapabilityReview(root, receipt, review.context));
  }
  for (const file of fs.readdirSync(path.join(root, 'templates/automation')).filter((file) => file.endsWith('.json'))) requirePass(validateAutomation(root, path.join(root, 'templates/automation', file)));
  if (runTests) {
    const tested = spawnSync(process.execPath, ['--test', 'tests/*.test.js'], { cwd: root, stdio: 'inherit', windowsHide: true });
    if (tested.error || tested.status !== 0) throw new Error('测试失败，不记录通过');
  }
  for (const check of config.checks) {
    const result = spawnSync(check.command, check.args, { cwd: root, shell: false, stdio: 'inherit', windowsHide: true });
    if (result.error || result.status !== 0) throw new Error('配置检查失败，不记录通过');
  }
  const after = getTaskContext(root);
  if (after.sourceFingerprint !== review.context.sourceFingerprint || after.base !== review.context.base || after.branch !== review.context.branch) throw new Error('检查期间来源或基线变化，请重新复盘');
  const receipt = recordValidation(root);
  receipt.checks = { ...receipt.checks, structure: true, capabilities: true, tests: runTests, customChecks: true };
  fs.writeFileSync(validation, JSON.stringify(receipt, null, 2) + '\n');
  return receipt;
}
export function mergeCheck(root) {
  const config = loadConfig(root);
  if (git(root, ['status', '--porcelain'])) throw new Error('合码前工作树必须洁净且复盘已提交');
  const branch = git(root, ['branch', '--show-current']);
  if (branch === 'main' || !branch.startsWith(config.taskPrefix)) throw new Error('合码检查只能在任务分支运行');
  const remote = git(root, ['remote', 'get-url', 'origin']);
  if (config.repository.remote && remote !== config.repository.remote) throw new Error('origin与项目配置不符');
  git(root, ['fetch', 'origin', 'main']);
  if (git(root, ['rev-list', '--count', 'HEAD..origin/main']) !== '0') throw new Error('请先合入最新main并重新复盘验收');
  requirePass(validateMemory(root));
  requirePass(validateStructure(root));
  requirePass(capabilities(root));
  const review = requirePass(validateTaskReview(root));
  const taskReceipt = JSON.parse(fs.readFileSync(path.join(root, review.context.receiptPath), 'utf8'));
  requirePass(validateCapabilityReview(root, taskReceipt, review.context));
  if (!localFile(root, '.runtime/validation.json')) throw new Error('缺少本任务验收摘要');
  const checked = JSON.parse(fs.readFileSync(path.join(root, '.runtime/validation.json'), 'utf8'));
  if (checked.task !== review.context.task || checked.base !== review.context.base || checked.sourceFingerprint !== review.context.sourceFingerprint || checked.nodeVersion !== process.version || !['memory', 'skills', 'structure', 'capabilities', 'tests', 'customChecks'].every((key) => checked.checks[key] === true)) throw new Error('验收记录已过期，请执行check');
  return { ready: true, remote, branch: review.context.branch, platformMergeExecuted: false, releaseExecuted: false };
}
export function createTask(root, slug) {
  const config = loadConfig(root);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug || '')) throw new Error('任务名须为小写字母数字及单连字符');
  const common = git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (fs.realpathSync(path.dirname(common)) !== fs.realpathSync(root) || git(root, ['branch', '--show-current']) !== 'main' || git(root, ['status', '--porcelain'])) throw new Error('从洁净main主目录创建工作树');
  git(root, ['fetch', 'origin', 'main']);
  if (git(root, ['rev-parse', 'HEAD']) !== git(root, ['rev-parse', 'origin/main'])) throw new Error('main须与origin/main同步');
  const container = path.join(root, '.worktree');
  if (fs.existsSync(container) && fs.lstatSync(container).isSymbolicLink()) throw new Error('工作树容器不能为链接');
  fs.mkdirSync(container, { recursive: true });
  const target = path.join(container, slug);
  if (fs.existsSync(target)) throw new Error('任务目录已存在；先核对后复用，不覆盖');
  const branch = `${config.taskPrefix}${slug}`;
  git(root, ['worktree', 'add', '-b', branch, target, 'main']);
  return { target, branch, installRequired: false };
}
export function runAgent(args, root = process.cwd()) {
  if (!args.length || args[0] === 'help' || args[0] === '--help') return help;
  if (args[0] === 'check' && args.length === 1) return runChecks(root);
  if (args[0] === 'merge-check' && args.length === 1) return mergeCheck(root);
  if (args[0] === 'review' && args[1] === '--input' && args.length === 3) {
    const input = JSON.parse(fs.readFileSync(path.resolve(root, args[2]), 'utf8'));
    requirePass(validateCapabilityReview(root, input, getTaskContext(root)));
    const context = writeTaskReview(root, input);
    return { written: context.receiptPath };
  }
  if (args[0] === 'memory-check' && args.length === 1) return requirePass({ ok: validateMemory(root).ok && validateTaskReview(root).ok, errors: [...validateMemory(root).errors, ...validateTaskReview(root).errors] });
  if (args[0] === 'task' && args[1] === 'create' && args.length === 3) return createTask(root, args[2]);
  if (args[0] === 'task' && args[1] === 'status' && args.length === 2) return { worktrees: git(root, ['worktree', 'list', '--porcelain']) };
  if (args[0] === 'capabilities' && ['sync', 'check'].includes(args[1]) && args.length === 2) return requirePass(capabilities(root, args[1] === 'sync'));
  if (args[0] === 'automation' && args[1] === 'check' && args.length === 3) return requirePass(validateAutomation(root, path.resolve(root, args[2])));
  if (args[0] === 'release-plan' && args.length === 1) return { ...loadConfig(root).release, executed: false };
  throw new Error('未知命令或参数；先执行npm run agent -- help');
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = runAgent(process.argv.slice(2));
    process.stdout.write(typeof result === 'string' ? result + '\n' : JSON.stringify({ ok: true, data: result }, null, 2) + '\n');
  } catch (error) {
    process.stderr.write(error.message + '\n');
    process.exitCode = 1;
  }
}
