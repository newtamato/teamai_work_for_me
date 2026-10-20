import fs from 'node:fs';
import { writeTaskReview } from './memory-tools.js';
try {
  const offset = process.argv.indexOf('--input');
  if (offset < 0 || !process.argv[offset + 1])
    throw new Error('用法：node scripts/review-memory.js --input <JSON文件>');
  const input = JSON.parse(fs.readFileSync(process.argv[offset + 1], 'utf8'));
  const context = writeTaskReview(process.cwd(), input);
  console.log(`任务复盘已写入 ${context.receiptPath}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
