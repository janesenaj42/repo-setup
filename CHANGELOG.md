# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [1.4.2](https://github.com/janesenaj42/repo-setup/compare/v1.4.1...v1.4.2) (2026-10-13)

### Bug Fixes

* fit the Java baseline to the org's Java repos ([310494c](https://github.com/janesenaj42/repo-setup/commit/310494c3cfca0b02f61d06df223d9d3ecdc21f4b)), closes [#29](https://github.com/janesenaj42/repo-setup/issues/29)
* **plugin:** pass plugin validate and say what checks.json is ([c87b21f](https://github.com/janesenaj42/repo-setup/commit/c87b21f152d7edb9f6ddd06df5e63b2913fc6dea)), closes [#32](https://github.com/janesenaj42/repo-setup/issues/32)
* **plugin:** move Claude's checks from `.claude/hooks/checks.json` to `.baseline/claude-checks.json`; re-run repo-setup to move them ([221e2c9](https://github.com/janesenaj42/repo-setup/commit/221e2c9))

## [1.4.1](https://github.com/janesenaj42/repo-setup/compare/v1.4.0...v1.4.1) (2026-10-11)

### Bug Fixes

* skip inline code and listed files in the Markdown link check ([27334d8](https://github.com/janesenaj42/repo-setup/commit/27334d8769ed24b44d7122a16e9855d3be2fbf14))

## [1.4.0](https://github.com/janesenaj42/repo-setup/compare/v1.3.0...v1.4.0) (2026-10-11)

### Features

* add the checks a pipeline runs on each PR ([6886472](https://github.com/janesenaj42/repo-setup/commit/6886472126699edf2ab193e040c8b58b559d758d))
* check PR descriptions against the org's default template, write none ([4c90a0c](https://github.com/janesenaj42/repo-setup/commit/4c90a0c6d38684487e328ffd20c8fb5f4b004589))

## [1.3.0](https://github.com/janesenaj42/repo-setup/compare/v1.2.1...v1.3.0) (2026-10-09)

### Features

* scope Claude's Stop checks to what changed, add pre-push tests and guards ([#21](https://github.com/janesenaj42/repo-setup/issues/21)) ([864d5c4](https://github.com/janesenaj42/repo-setup/commit/864d5c4c655cc3c6cec966cce4bf22497097b5d2))
* show what --force overwrites and ask before writing it ([#19](https://github.com/janesenaj42/repo-setup/issues/19)) ([dc3048b](https://github.com/janesenaj42/repo-setup/commit/dc3048b4e7d43a4b6751ea473bdfbe2b2a476ced))
* turn on the Claude Code plugin without an install command ([#18](https://github.com/janesenaj42/repo-setup/issues/18)) ([d37336c](https://github.com/janesenaj42/repo-setup/commit/d37336c3aba73b55b6fb3b74048466771abc969d))

### Bug Fixes

* adopt-baseline skill updates docs that name files the adoption removed ([#20](https://github.com/janesenaj42/repo-setup/issues/20)) ([8b728cd](https://github.com/janesenaj42/repo-setup/commit/8b728cd83e3aee52437de5fc686e834080de0225))

## [1.2.1](https://github.com/janesenaj42/repo-setup/compare/v1.2.0...v1.2.1) (2026-10-08)

### Bug Fixes

* keep a repository's own hooks and commitlint config ([#16](https://github.com/janesenaj42/repo-setup/issues/16)) ([0528508](https://github.com/janesenaj42/repo-setup/commit/0528508b7288240f4ae922f876853937c3c39990))

## 1.2.0 (2026-10-08)

### Features

* install with pnpm in repositories with a Node folder when pnpm is installed ([#14](https://github.com/janesenaj42/repo-setup/issues/14)) ([66177e2](https://github.com/janesenaj42/repo-setup/commit/66177e2d7037742b225aa0e431514fc51683cb9f))

## [1.1.3](https://github.com/janesenaj42/repo-setup/compare/v1.1.2...v1.1.3) (2026-10-08)

### Bug Fixes

* name a new package.json after the origin remote, not the folder ([#11](https://github.com/janesenaj42/repo-setup/issues/11)) ([50d4ab7](https://github.com/janesenaj42/repo-setup/commit/50d4ab7d1b88c1b43a95e55b4e5da84f818b5366))

## [1.1.2](https://github.com/janesenaj42/repo-setup/compare/v1.1.1...v1.1.2) (2026-10-08)

### Bug Fixes

* nested folders' Prettier reads the root's ignore files ([#7](https://github.com/janesenaj42/repo-setup/issues/7)) ([d9ef02f](https://github.com/janesenaj42/repo-setup/commit/d9ef02f8e9370391976eb96da2ebc905d2c764ca))

## [1.1.1](https://github.com/janesenaj42/repo-setup/compare/v1.1.0...v1.1.1) (2026-10-08)

### Bug Fixes

* drop the claude/ exemption from the branch-name check ([#4](https://github.com/janesenaj42/repo-setup/issues/4)) ([08e250e](https://github.com/janesenaj42/repo-setup/commit/08e250e7fc7a2d2c27d289e400a9dd94686bd82f))

## [1.1.0](https://github.com/janesenaj42/repo-setup/compare/v1.0.1...v1.1.0) (2026-10-08)

### Features

* keep the git hook checks in .baseline/checks/ ([1bc40e7](https://github.com/janesenaj42/repo-setup/commit/1bc40e72372f0299f3b4cdaef4b4f0caaef48ddf))

### Bug Fixes

* release:<type> leaves tagging to the Release workflow ([c15878d](https://github.com/janesenaj42/repo-setup/commit/c15878d558e5822147735d329e882e9574b57682))

## [1.0.1](https://github.com/janesenaj42/repo-setup/compare/v1.0.0...v1.0.1) (2026-10-07)

### Bug Fixes

* install @commitlint/load, which the branch-name check imports ([d6ff314](https://github.com/janesenaj42/repo-setup/commit/d6ff314db75797c5c01af6d57de02e8fccbe1af3))
* keep Prettier off the files repo-setup owns ([2bc27d0](https://github.com/janesenaj42/repo-setup/commit/2bc27d0c68088fa11130520c3422c6251996725b))
* skip test fixtures when finding Areas ([43fb226](https://github.com/janesenaj42/repo-setup/commit/43fb226645cd7a1ed84e2c5d03e9f00c91801c1e))
