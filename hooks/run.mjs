// Shared by the Claude hooks in this folder (wired in hooks.json, run by the `baseline` plugin in
// every project that enables it). The commands come from the project's .baseline/claude-checks.json,
// one entry per Area; a project without one runs nothing:
//
//   { "areas": [{
//       "name": "web",
//       "root": "web",
//       "onEdit": [{ "match": "\\.tsx?$", "run": ["npx", "--no", "--", "eslint", "{file}"] }],
//       "onStop": [{ "run": ["npm", "test"], "okExitCodes": [0] }]
//   }] }
//
//   root         The Area's folder from the repo root; its commands run there. A file belongs to
//                the Area with the longest root containing it.
//   onEdit       Run after Claude edits a file in the Area (on-edit.mjs). match: a regex on
//                {file}; without it, every file. {file}: path from root; {absfile}: absolute.
//   onStop       Run when Claude ends a turn and the Area has uncommitted non-Markdown changes
//                (on-stop.mjs). In an Area holding workspaces (package.json "workspaces", or
//                pnpm-workspace.yaml "packages"), they run in each changed workspace instead; a
//                change outside every workspace runs them in the Area's folder. A command with
//                a match runs only when a changed file matches it. An argument that is exactly
//                a list placeholder becomes one argument per item, and the command is skipped
//                when the list is empty:
//                  {files}        the changed files (that match), from the folder it runs in
//                  {testFiles}    the test files for them (relatedTests)
//                  {testClasses}  those test files as Gradle filters: --tests FooTest ...
//   okExitCodes  Exit codes that count as passing; default [0].
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, posix, resolve, win32 } from 'node:path';
export { workspaces } from '../lib/workspaces.mjs';

/** The project Claude Code runs in: hooks get it as CLAUDE_PROJECT_DIR. */
export const ROOT = resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd());
const CHECKS = join(ROOT, '.baseline', 'claude-checks.json');
/** Where repo-setup 1.4.1 and earlier wrote it: read until the project re-runs repo-setup. */
const OLD_CHECKS = join(ROOT, '.claude', 'hooks', 'checks.json');

/** The JSON Claude Code sends on stdin. */
export function payload() {
  return JSON.parse(readFileSync(0, 'utf8') || '{}');
}

/** The areas in checks.json, each with its root as a path from the repo root ("" for the root). */
export function areas() {
  const file = [CHECKS, OLD_CHECKS].find((path) => existsSync(path));
  if (!file) return [];
  const config = JSON.parse(readFileSync(file, 'utf8'));
  return (config.areas ?? []).map((area) => ({ ...area, root: normalize(area.root ?? '.') }));
}

/** The area owning a path from the repo root: the one with the longest root containing it. */
export function owner(list, path) {
  return list
    .filter((area) => area.root === '' || path === area.root || path.startsWith(`${area.root}/`))
    .sort((a, b) => b.root.length - a.root.length)[0];
}

/**
 * A path from the payload, as this process sees it. Claude Code sends paths in its own form
 * (D:\... on Windows); resolving them against the payload's cwd, then against this process's
 * cwd, also works when Node runs elsewhere (e.g. in a container with the repo mounted).
 */
export function localPath(path, cwd) {
  const style = /^[A-Za-z]:[\\/]/.test(path) || /^[A-Za-z]:[\\/]/.test(cwd ?? '') ? win32 : posix;
  return resolve(process.cwd(), style.relative(cwd ?? process.cwd(), path).replaceAll('\\', '/'));
}

/**
 * Runs one checks.json command ({ run: [tool, ...args], okExitCodes? }) in `cwd`, with
 * placeholders in its arguments replaced. Returns whether it passed, and its output.
 */
export function check(command, cwd, placeholders = {}) {
  const [tool, ...args] = command.run.flatMap((arg) =>
    Array.isArray(placeholders[arg.slice(1, -1)])
      ? placeholders[arg.slice(1, -1)]
      : [arg.replace(/\{(\w+)\}/g, (match, name) => placeholders[name] ?? match)],
  );
  const result = spawnSync(tool, args, {
    cwd,
    encoding: 'utf8',
    // npm, npx and uv shims are .cmd files on Windows, which only a shell can start.
    shell: process.platform === 'win32',
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  });
  const ok = (command.okExitCodes ?? [0]).includes(result.status);
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}${result.error?.message ?? ''}`.trim();
  return { ok, label: [tool, ...args].join(' '), output };
}

// A test file, and the names of the test files for a source file: FooTest.java and FooTests.java
// for Foo.java; test_foo.py and foo_test.py for foo.py.
const TEST_FILE = /(^|\/)(\w+Tests?\.java|test_\w+\.py|\w+_test\.py)$/;
const TEST_NAMES = [
  [/^(\w+)\.java$/, (name) => [`${name}Test.java`, `${name}Tests.java`]],
  [/^(\w+)\.py$/, (name) => [`test_${name}.py`, `${name}_test.py`]],
];

/**
 * The test files for `files` (paths from `dir`): those that are tests, and the tracked test files
 * named after the others, wherever they are in `dir`.
 */
export function relatedTests(dir, files) {
  const tests = new Set(files.filter((file) => TEST_FILE.test(file)));
  const wanted = new Set(
    files.flatMap((file) => {
      const base = posix.basename(file);
      return TEST_NAMES.flatMap(([pattern, names]) => (pattern.test(base) ? names(pattern.exec(base)[1]) : []));
    }),
  );
  if (wanted.size) {
    const tracked = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: dir, encoding: 'utf8' });
    for (const file of (tracked.stdout ?? '').split('\n')) if (wanted.has(posix.basename(file))) tests.add(file);
  }
  return [...tests].sort();
}

/** Gradle's filters for test files: --tests FooTest, one pair per Java test class. */
export const gradleFilters = (testFiles) =>
  testFiles.filter((file) => file.endsWith('.java')).flatMap((file) => ['--tests', posix.basename(file, '.java')]);

/** Runs git in the repo root; returns stdout. */
export function git(args) {
  return spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' }).stdout ?? '';
}

function normalize(path) {
  return posix.normalize(path.replaceAll('\\', '/')).replace(/^\.\/?$|\/$/g, '');
}
