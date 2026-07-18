# Contributing to Codex WebUI

Thanks for helping improve Codex WebUI. Contributions should preserve the project's core property: the UI is driven by real Codex app-server protocol events rather than static demonstrations.

## Before you start

- Search existing Issues and Pull Requests.
- For large protocol, security, or architecture changes, open an Issue first.
- Never include API keys, session files, account data, private prompts, or absolute personal paths.
- Do not commit assets copied from Codex.app or other proprietary applications.

## Development setup

```bash
git clone https://github.com/lezi-fun/codex-webui.git
cd codex-webui
bun install
bun run start
```

Requirements:

- Bun 1.3+
- Git
- OpenAI Codex CLI for integration/E2E tests
- A Chromium browser for browser tests

## Project conventions

### Protocol first

When adding an app-server feature:

1. Confirm the request, response, or notification shape from the installed app-server schema.
2. Add a failing test for the protocol/data transformation.
3. Implement the smallest data-layer change.
4. Connect it to real browser state.
5. Verify with a real app-server flow when practical.

Do not use fixed timers to pretend a tool is running. Activity must follow item and turn lifecycle events.

### Test-driven changes

Add or update tests before production behavior. Useful commands:

```bash
bun run test:unit
bun run check
```

With a running server:

```bash
bun run test:browser
```

With an authenticated Codex installation:

```bash
bun run test:integration
bun run test:e2e
```

### Frontend bundle

Edit `public/app.js`, not `public/app.bundle.js`. The bundle is generated when `server.ts` starts and is ignored by Git.

### Filesystem safety

- Folder browsing must remain constrained to approved roots.
- Review patch operations must validate the exact Git root.
- New command/file approval decisions must map to actual app-server responses.
- Avoid endpoints that accept arbitrary shell commands.

### UI and accessibility

- Preserve the `max-width: 720px` mobile single-column layout.
- Test at 591px and a standard desktop viewport.
- Respect `prefers-reduced-motion`.
- Use accessible names for icon-only controls.
- Do not introduce horizontal page overflow.

## Pull request checklist

Before opening a PR:

```bash
bun run test:unit
bun run check
git diff --check
```

Also run relevant browser or integration tests for the changed feature.

A pull request should:

- explain the user-visible behavior;
- list protocol methods or notifications involved;
- describe security implications;
- include test output;
- include screenshots for layout changes;
- update both READMEs when usage or configuration changes.

## Commit style

Use short conventional commit subjects when possible:

```text
feat: add per-file review controls
fix: preserve mobile composer width
test: cover command approval decisions
docs: document review root configuration
```

## Reporting bugs

Use the Bug Report Issue template and include:

- OS, Bun version, Codex CLI version, and browser;
- exact reproduction steps;
- relevant non-sensitive logs;
- screenshots when the issue is visual;
- whether the behavior also occurs in Codex CLI/Desktop.

## License

By contributing, you agree that your contribution is licensed under the repository's MIT License. Do not submit code or assets you do not have permission to redistribute.
