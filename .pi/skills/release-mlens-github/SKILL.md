---
name: release-mlens-github
description: Use when cutting a new mlens release from this repository, including changelog audit, local release smoke tests, the GitHub-only release script, and GitHub Release asset verification.
---

# Release mlens via GitHub

This repository releases `mlens` through GitHub Releases only. Do not use `npm publish`, `publish:dry`, or any old `release:patch|minor|major` flow.

## When to use

Use this skill when the user asks to:
- release or publish `mlens`
- cut a new `v0.1.x` tag
- push GitHub release binaries
- verify the `Build Binaries` workflow

Do not use this skill for ordinary feature work, local debugging, or npm package publishing.

## Preconditions

- Work from the repo root.
- Confirm the user already ran the `/cl` changelog audit flow, or run the equivalent audit yourself before release work.
- Keep the worktree clean before invoking the release script.
- Use explicit versions like `0.1.1` or `v0.1.1`.

## Release flow

1. Run the local smoke test:

```bash
npm run release:local -- --out /tmp/pi-local-release --force
```

2. Verify the packaged `mlens` artifacts outside the repo:

```bash
/tmp/pi-local-release/node/mlens --help
/tmp/pi-local-release/node/mlens --version
/tmp/pi-local-release/node/mlens -p "Say exactly: ok"
/tmp/pi-local-release/bun/mlens --help
/tmp/pi-local-release/bun/mlens --version
/tmp/pi-local-release/bun/mlens -p "Say exactly: ok"
```

3. Verify interactive startup for both package and binary builds in `tmux`:

```bash
tmux new-session -d -s mlens-node-smoke -x 80 -y 24 /tmp/pi-local-release/node/mlens
sleep 3 && tmux capture-pane -t mlens-node-smoke -p
tmux send-keys -t mlens-node-smoke "Say exactly: ok" Enter
sleep 15 && tmux capture-pane -t mlens-node-smoke -p
tmux kill-session -t mlens-node-smoke

tmux new-session -d -s mlens-bun-smoke -x 80 -y 24 /tmp/pi-local-release/bun/mlens
sleep 3 && tmux capture-pane -t mlens-bun-smoke -p
tmux send-keys -t mlens-bun-smoke "Say exactly: ok" Enter
sleep 15 && tmux capture-pane -t mlens-bun-smoke -p
tmux kill-session -t mlens-bun-smoke
```

4. Cut the release with the GitHub-only script:

```bash
npm run release:github -- 0.1.1
```

This script:
- keeps all workspace versions in lockstep
- finalizes `packages/*/CHANGELOG.md`
- commits `Release v<version>`
- tags `v<version>`
- adds fresh `## [Unreleased]` sections
- commits `Add [Unreleased] section for next cycle`
- pushes `main` and the tag

## Post-release verification

Watch the workflow:

```bash
gh run list --workflow "Build Binaries" --limit 5
gh run watch <run-id>
```

Verify the GitHub release and assets:

```bash
gh release view v0.1.1 --json assets,name,tagName,url
```

Expected assets:
- `mlens-darwin-arm64.tar.gz`
- `mlens-darwin-x64.tar.gz`
- `mlens-linux-arm64.tar.gz`
- `mlens-linux-x64.tar.gz`
- `mlens-windows-arm64.zip`
- `mlens-windows-x64.zip`

## Failure rules

- If `release:local` fails, stop and fix the release inputs before tagging.
- If `release:github` stops after changelog/version updates but before tagging, inspect `git status`, finish the staged release commit manually, then continue.
- If GitHub Actions binary publication fails, fix the issue on `main` and cut a new version. Do not reuse a broken tag.
- Cache warnings in GitHub Actions are non-blocking; asset upload failures are blocking.

## Important files

- `scripts/release.mjs`
- `scripts/local-release.mjs`
- `.github/workflows/build-binaries.yml`
- `install.sh`
- `packages/coding-agent/CHANGELOG.md`
