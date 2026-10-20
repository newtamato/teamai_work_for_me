import path from 'node:path';
import { validateMemory, validateTaskReview } from './memory-tools.js';
const root = path.resolve(process.cwd());
const staticOnly = process.argv.includes('--static');
const errors = [
  ...validateMemory(root).errors,
  ...(staticOnly ? [] : validateTaskReview(root).errors),
];
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`记忆检查通过${staticOnly ? '（仅结构）' : '（结构与任务复盘）'}`);
}
