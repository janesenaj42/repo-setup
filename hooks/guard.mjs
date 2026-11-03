// PreToolUse hook: stop a tool call before it runs when it would
//   1. skip the git hooks: `--no-verify` (or `commit -n`), LEFTHOOK=0, or core.hooksPath on a
//      git commit or push;
//   2. change a file repo-setup owns: a marked file, or a block in .gitignore and the like;
//   3. read a secret: .env files (not .env.example, .env.sample or .env.template), *.pem, *.key.
// Exit 2 blocks the call and hands the reason to Claude. A shell command is checked as text, so
// these are guardrails against mistakes, not a sandbox: the git hooks and CI still enforce.
import { existsSync, readFileSync } from 'node:fs';
import { posix, relative } from 'node:path';

import { isBlockFile, parseBlocks, readMarkedFile } from '../baseline/files/.baseline/checks/baseline.mjs';
import { ROOT, localPath, payload } from './run.mjs';

const SECRET = /^(\.env(\..+)?|.+\.(pem|key))$/;
const NOT_SECRET = /^\.env\.(example|sample|template)$/;
// Shell commands that print or load a file's content.
const READERS = new Set(['cat', 'less', 'more', 'head', 'tail', 'grep', 'rg', 'sed', 'awk', 'source', '.', 'base64', 'xxd', 'strings', 'cut', 'sort']);

const isSecret = (path) => {
  const name = posix.basename(path.replaceAll('\\', '/'));
  return SECRET.test(name) && !NOT_SECRET.test(name);
};

/** A command line's segments (split on ;, &&, ||, |), each as words with quotes removed. */
function segments(command) {
  return command
    .split(/;|&&|\|\||\||\n/)
    .map((segment) => (segment.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((word) => word.replace(/^["']|["']$/g, '')));
}

function skipsGitHooks(words) {
  const git = words.indexOf('git');
  if (git === -1) return false;
  const rest = words.slice(git + 1);
  const action = rest.find((word) => word === 'commit' || word === 'push');
  if (!action) return false;
  const shortN = action === 'commit' && rest.some((word) => /^-[a-zA-Z]*n[a-zA-Z]*$/.test(word));
  return (
    shortN ||
    rest.includes('--no-verify') ||
    words.some((word) => /^LEFTHOOK=(0|false)$/.test(word) || /core\.hooksPath/.test(word))
  );
}

function bashProblem(command) {
  for (const words of segments(command)) {
    if (skipsGitHooks(words)) {
      return 'This command skips the git hooks. Commit and push with them on; if a hook fails, fix what it reports, or tell the user why you can\'t.';
    }
    const reader = words.find((word) => !/^\w+=/.test(word));
    const secret = words.find(isSecret);
    if (READERS.has(reader) && secret) return secretProblem(secret);
  }
  return null;
}

function secretProblem(path) {
  const instead = posix.basename(path.replaceAll('\\', '/')).startsWith('.env')
    ? 'Read or update .env.example instead (variable names with placeholder values), or ask the user for the value you need.'
    : 'Ask the user for what you need from it.';
  return `${path} may hold secrets, so Claude doesn't read it. ${instead}`;
}

/** The file's text after the edit, or null when the edit can't be applied here. */
function afterEdit(tool, input, current) {
  if (tool === 'Write') return input.content ?? null;
  const edits = tool === 'MultiEdit' ? (input.edits ?? []) : [input];
  let text = current;
  for (const edit of edits) {
    if (typeof edit.old_string !== 'string' || !text.includes(edit.old_string)) return null;
    text = edit.replace_all ? text.replaceAll(edit.old_string, edit.new_string) : text.replace(edit.old_string, () => edit.new_string);
  }
  return text;
}

const blocksOf = (text) => JSON.stringify(parseBlocks(text).blocks.map(({ name, content }) => [name, content]));

function editProblem(tool, input) {
  const path = input.file_path ?? input.notebook_path;
  if (!path) return null;
  const absfile = localPath(path, input.cwd);
  const file = relative(ROOT, absfile).replaceAll('\\', '/');
  if (file.startsWith('..') || !existsSync(absfile)) return null;
  const current = readFileSync(absfile, 'utf8');
  const owned = readMarkedFile(current) !== null;
  const next = owned || !isBlockFile(file) ? null : afterEdit(tool, input, current);
  if (!owned && (next === null || blocksOf(next) === blocksOf(current))) return null;
  return `${file} ${owned ? 'is a file' : 'has lines'} repo-setup owns (baseline-file or # >>> baseline: markers); the pre-commit hook rejects edits to them. Put your change ${owned ? 'in your own file beside it' : 'after the last block'}, or change it in repo-setup and re-run \`npx @janesenaj42/repo-setup\`.`;
}

function problem({ tool_name: tool, tool_input: input = {}, cwd }) {
  if (tool === 'Bash') return bashProblem(input.command ?? '');
  if (tool === 'Read' && input.file_path && isSecret(input.file_path)) return secretProblem(input.file_path);
  if (tool === 'Grep' && input.path && isSecret(input.path)) return secretProblem(input.path);
  if (['Edit', 'MultiEdit', 'Write', 'NotebookEdit'].includes(tool)) return editProblem(tool, { ...input, cwd });
  return null;
}

const reason = problem(payload());
if (reason) {
  console.error(reason);
  process.exit(2);
}
