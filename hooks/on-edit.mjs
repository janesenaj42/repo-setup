// PostToolUse hook: after Claude edits or writes a file, run the onEdit commands of the area
// owning it (checks.json), e.g. format and lint that one file, so Claude fixes problems now
// rather than after the PR. Exit 2 hands the output to Claude; the edit itself has already
// happened. Placeholders: {file} is the path from the area's root, {absfile} the absolute path.
import { join, relative } from 'node:path';

import { ROOT, areas, check, localPath, owner, payload } from './run.mjs';

const input = payload();
if (!input.tool_input?.file_path) process.exit(0);

const absfile = localPath(input.tool_input.file_path, input.cwd);
const path = relative(ROOT, absfile).replaceAll('\\', '/');
if (path.startsWith('..') || /(^|\/)(node_modules|dist|build|target|\.venv)\//.test(path)) process.exit(0);

const area = owner(areas(), path);
if (!area) process.exit(0);

const file = area.root ? path.slice(area.root.length + 1) : path;
const problems = (area.onEdit ?? [])
  .filter((command) => !command.match || new RegExp(command.match).test(file))
  .map((command) => check(command, join(ROOT, area.root), { file, absfile }))
  .filter((result) => !result.ok)
  .map((result) => `${result.label} (in ${area.root || '.'}/):\n${result.output}`);

if (problems.length) {
  console.error(`${problems.join('\n\n')}\n\nFix these before moving on.`);
  process.exit(2);
}
