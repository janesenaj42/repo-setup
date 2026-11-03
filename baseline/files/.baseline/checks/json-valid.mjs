// Fails if a JSON file doesn't parse. Checks the files given as arguments (the pre-commit
// hook passes the staged ones), none when there are none, and every tracked .json file with
// --all. Kept in a file, not inline in a hook: on Windows, lefthook splits an inline
// `node -e "..."` script at its spaces. Needs only Node and git.
//
// Files whose tools accept comments and trailing commas (JSONC: tsconfig, .eslintrc.json,
// VS Code settings, *.jsonc) are checked as JSONC.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const JSONC = [/^tsconfig.*\.json$/, /^jsconfig.*\.json$/, /^\.eslintrc\.json$/, /\.jsonc$/, /^devcontainer\.json$/];
const JSONC_FOLDERS = /(^|\/)\.(vscode|devcontainer)\//;

const isJsonc = (file) => JSONC_FOLDERS.test(file) || JSONC.some((pattern) => pattern.test(basename(file)));

/** JSONC as plain JSON: comments and trailing commas removed, strings left alone. */
function stripJsonc(text) {
  const withoutComments = text.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (match, string) => string ?? '');
  return withoutComments.replace(/("(?:\\.|[^"\\])*")|,(\s*[}\]])/g, (match, string, closing) => string ?? closing);
}

function problem(file) {
  try {
    const text = readFileSync(file, 'utf8');
    JSON.parse(isJsonc(file) ? stripJsonc(text) : text);
    return null;
  } catch (error) {
    return `${file}: ${error.message}`;
  }
}

const args = process.argv.slice(2);
const files = args[0] === '--all'
  ? execFileSync('git', ['ls-files', '*.json', '*.jsonc'], { encoding: 'utf8' }).split('\n').filter(Boolean)
  : args;
const broken = files.map(problem).filter(Boolean);

if (broken.length) {
  console.error(`JSON that doesn't parse:\n${broken.map((b) => `  - ${b}`).join('\n')}`);
  process.exit(1);
}
