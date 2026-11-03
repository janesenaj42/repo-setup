// Stop hook: before Claude ends a turn, run the onStop commands (e.g. format, lint, typecheck,
// and the tests for what changed) of every area with uncommitted changes (checks.json), and keep
// Claude working if one fails. They get the changed files, so edits Claude made through the shell
// are formatted and linted too. In an area holding workspaces, only the changed workspaces run
// them (run.mjs, onStop).
// Markdown changes are ignored: they can't affect a typecheck or a test.
//
// If Claude is already continuing because of this hook (stop_hook_active), it may stop: a
// failure it can't fix must reach the user, not loop.
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT, areas, check, git, gradleFilters, owner, payload, relatedTests, workspaces } from './run.mjs';

if (payload().stop_hook_active) process.exit(0);

const changed = git(['status', '--porcelain', '--untracked-files=all'])
  .split('\n')
  .filter(Boolean)
  .map((line) => line.slice(3).replace(/^.* -> /, '').replace(/^"|"$/g, ''))
  .filter((file) => !file.endsWith('.md'));
if (changed.length === 0) process.exit(0);

const list = areas();

/** Where an area's onStop commands run for a changed file: its workspace, else the area's folder. */
function target(area, file) {
  const inArea = area.root ? file.slice(area.root.length + 1) : file;
  const workspace = workspaces(join(ROOT, area.root)).find((dir) => inArea.startsWith(`${dir}/`));
  return workspace ? `${area.root ? `${area.root}/` : ''}${workspace}` : area.root;
}

/** Where each changed file's onStop commands run: { dir: { area, files: paths from the repo root } }. */
const targets = new Map();
for (const file of changed) {
  const area = owner(list, file);
  if (!area?.onStop?.length) continue;
  const dir = target(area, file);
  if (!targets.has(dir)) targets.set(dir, { area, files: [] });
  targets.get(dir).files.push(file);
}
// A change in the area's own folder runs the commands there, which covers its workspaces too.
for (const [dir, { area, files }] of targets) {
  if (dir !== area.root && targets.has(area.root)) {
    targets.get(area.root).files.push(...files);
    targets.delete(dir);
  }
}

/**
 * In a workspace, an npm or pnpm script it doesn't have is skipped (--if-present): workspaces
 * leave out scripts on purpose. The area's own folder must have them.
 */
const inWorkspace = (command) =>
  ['npm', 'pnpm'].includes(command.run[0]) && command.run[1] === 'run'
    ? { ...command, run: [...command.run, '--if-present'] }
    : command;

const LIST_PLACEHOLDERS = ['{files}', '{testFiles}', '{testClasses}'];

/** Runs one onStop command in `dir` for the changed `files` there; null when it doesn't apply. */
function stopCheck(command, dir, files) {
  const matching = command.match ? files.filter((file) => new RegExp(command.match).test(file)) : files;
  if (command.match && matching.length === 0) return null;
  const present = matching.filter((file) => existsSync(join(ROOT, dir, file)));
  const testFiles = relatedTests(join(ROOT, dir), present);
  const lists = { files: present, testFiles, testClasses: gradleFilters(testFiles) };
  const empty = command.run.some((arg) => LIST_PLACEHOLDERS.includes(arg) && lists[arg.slice(1, -1)].length === 0);
  return empty ? null : check(command, join(ROOT, dir), lists);
}

const failures = [...targets].flatMap(([dir, { area, files }]) => {
  const fromDir = files.map((file) => (dir ? file.slice(dir.length + 1) : file)).sort();
  return area.onStop
    .map((command) => stopCheck(dir === area.root ? command : inWorkspace(command), dir, fromDir))
    .filter((result) => result && !result.ok)
    .map((result) => `${result.label} (in ${dir || '.'}/):\n${result.output.slice(-4000)}`);
});

if (failures.length) {
  console.log(
    JSON.stringify({
      decision: 'block',
      reason: `Checks failed for what you changed; fix them, or tell the user why you can't.\n\n${failures.join('\n\n')}`,
    }),
  );
}
