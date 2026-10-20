import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export function loadConfig(directory = root) {
  const config = JSON.parse(fs.readFileSync(path.join(directory, 'agent.config.json'), 'utf8'));
  if (config.schemaVersion !== 1 || !config.name || config.defaultBranch !== 'main')
    throw new Error('配置无效：项目名、schemaVersion、默认分支main必须有效');
  if (typeof config.taskPrefix !== 'string')
    throw new Error('配置无效：taskPrefix必须是字符串，默认codex/，可为空以适配无前缀agent');
  for (const check of [...(config.checks || []), ...(config.release?.commands || [])]) {
    if (!check.command || !Array.isArray(check.args) || check.args.some((arg) => typeof arg !== 'string'))
      throw new Error('检查/发布命令须使用command及args数组，不接受拼接shell');
  }
  return config;
}
