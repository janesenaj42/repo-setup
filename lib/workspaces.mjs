// The workspaces of a Node folder. Used by repo-setup (stacks.mjs: a workspace isn't its own
// Area) and by the Claude hooks (hooks/on-stop.mjs: checks run per changed workspace).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";

/**
 * The workspace folders of `dir` (absolute), as paths from it: package.json "workspaces" (npm,
 * yarn) or pnpm-workspace.yaml "packages". Supports exact paths and `folder/*`.
 */
export function workspaces(dir) {
  return globsIn(dir).flatMap((glob) => {
    const path = posix.normalize(glob.replaceAll("\\", "/")).replace(/^\.\/?$|\/$/g, "");
    if (!path.endsWith("/*")) return existsSync(join(dir, path, "package.json")) ? [path] : [];
    const parent = path.slice(0, -2);
    if (!existsSync(join(dir, parent))) return [];
    return readdirSync(join(dir, parent), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(dir, parent, entry.name, "package.json")))
      .map((entry) => `${parent}/${entry.name}`);
  });
}

function globsIn(dir) {
  const pkgPath = join(dir, "package.json");
  if (existsSync(pkgPath)) {
    const listed = JSON.parse(readFileSync(pkgPath, "utf8")).workspaces;
    const globs = Array.isArray(listed) ? listed : (listed?.packages ?? []);
    if (globs.length > 0) return globs;
  }
  const pnpmPath = join(dir, "pnpm-workspace.yaml");
  if (!existsSync(pnpmPath)) return [];
  const yaml = readFileSync(pnpmPath, "utf8").split(/^packages:\s*$/m)[1] ?? "";
  return [...yaml.split(/^\S/m)[0].matchAll(/^\s+-\s*['"]?([^'"\s#]+)/gm)].map((match) => match[1]);
}
