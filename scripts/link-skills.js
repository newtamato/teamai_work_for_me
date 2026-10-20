import { mkdirSync, lstatSync, realpathSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { root } from './config.js';

// 技能只维护一份；本地链接不入Git，确保Windows联接不会固化绝对路径。
export function linkProjectSkills(projectRoot = root) {
  const target = resolve(projectRoot, '.agents/skills'),
    link = resolve(projectRoot, '.claude/skills');
  mkdirSync(target, { recursive: true });
  mkdirSync(join(projectRoot, '.claude'), { recursive: true });
  let existing;
  try {
    existing = lstatSync(link);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (existing) {
    if (!existing.isSymbolicLink())
      throw new Error('.claude/skills已有普通文件或目录，请先迁移技能；现有内容未修改。');
    let actual;
    try {
      actual = realpathSync(link);
    } catch {
      throw new Error('.claude/skills已有失效链接，请检查后处理；现有链接未修改。');
    }
    if (actual !== realpathSync(target))
      throw new Error('.claude/skills指向其他目录，现有链接未修改。');
    return { target, link, reused: true };
  }
  let type = 'symbolic-link';
  try {
    symlinkSync('../.agents/skills', link, 'dir');
  } catch (error) {
    if (process.platform !== 'win32' || !['EPERM', 'EACCES'].includes(error.code)) throw error;
    symlinkSync(target, link, 'junction');
    type = 'junction';
  }
  if (realpathSync(link) !== realpathSync(target)) throw new Error('技能链接目标校验失败');
  return { target, link, type, reused: false };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = linkProjectSkills();
  console.log(
    `项目技能：${result.target}\nClaude入口：${result.link}\n${result.reused ? '已复用正确的链接' : result.type === 'junction' ? '已创建Windows目录联接（Junction）' : '已创建相对符号链接'}`,
  );
}
