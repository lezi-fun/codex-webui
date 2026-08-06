# Contributing to Codex WebUI

Thanks for helping improve Codex WebUI. Contributions should preserve the project's core behavior: the interface reflects real Codex app-server state and events instead of simulating activity in the browser.

By participating, you agree to follow the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Before you start

- Search existing issues and pull requests before opening a duplicate.
- Open an issue before a large protocol, security, architecture, or dependency change.
- Keep changes focused. Avoid unrelated formatting or generated-file churn.
- Never include API keys, authentication files, account data, private prompts, absolute personal paths, or unredacted logs.
- Do not commit unpacked application bundles. New third-party assets require clear redistribution rights and an update to `THIRD_PARTY_NOTICES.md`.

Security vulnerabilities must be reported privately as described in [SECURITY.md](./SECURITY.md), not in a public issue.

## Development setup

Requirements:

- Bun 1.3 or newer
- Node.js 20 or newer for the PTY worker
- Git
- An installed and authenticated Codex CLI for integration tests
- Chrome, Edge, or Playwright Chromium for browser tests

```bash
git clone https://github.com/lezi-fun/codex-webui.git
cd codex-webui
bun install
bun run dev
```

Open `http://127.0.0.1:8899`. Use `bun run start` when file watching is not needed.

## Project conventions

### Protocol behavior

When adding an app-server feature:

1. Confirm the request, response, or notification shape from the installed app-server schema.
2. Add a focused test for the protocol or state transformation.
3. Implement the smallest server and browser-state change needed.
4. Drive loading, running, completed, and failed states from real lifecycle events.
5. Verify the flow against a real app-server when practical.

Do not use fixed timers or static labels to make a command, tool, or file edit appear to be running.

### Desktop parity

Visual changes should be based on observable behavior or locally unpacked reference code from the installed desktop app. Keep unpacked bundles in the ignored `.codex-desktop-reference/` directory and never commit them.

- Preserve message and tool-event ordering.
- Keep controls usable at desktop and phone widths.
- Use accessible names for icon-only buttons.
- Respect `prefers-reduced-motion`.
- Prevent text overlap and horizontal page overflow.
- Include before/after screenshots for material layout changes.

### Generated files

Edit source files such as `public/app.js`; do not edit `public/app.bundle.js` or files under `dist/` by hand. Generate them with:

```bash
bun run build
```

### Filesystem and network safety

- Keep folder browsing constrained to approved roots.
- Validate the exact Git root before review patch operations.
- Map approval decisions to actual app-server response shapes.
- Do not add endpoints that accept arbitrary commands from an unauthenticated browser.
- Preserve localhost-only defaults and authenticated LAN access.

## Testing

Run checks proportional to the change. The baseline for a pull request is:

```bash
bun run test:unit
bun run check
git diff --check
```

For browser-facing changes, start the server and run the relevant browser test or the full suite:

```bash
bun run start
bun run test:browser
```

Tests requiring an authenticated Codex installation are separate:

```bash
bun run test:integration
bun run test:e2e
```

If a suite cannot be run locally, state that clearly in the pull request.

## Pull requests

A pull request should:

- explain the user-visible behavior and motivation;
- identify app-server methods or notifications involved;
- describe security implications, including when there are none;
- list the exact validation commands and results;
- include screenshots for visual changes;
- update both READMEs when usage or configuration changes.

Use short, descriptive commit subjects. Conventional Commit prefixes are welcome:

```text
feat: add per-file review controls
fix: preserve mobile settings navigation
test: cover command approval decisions
docs: document review root configuration
```

## Reporting bugs

Include the operating system, Bun version, Codex CLI version, browser, exact reproduction steps, non-sensitive logs, and screenshots when relevant. Note whether the behavior also occurs in Codex CLI or the desktop app.

## License

By contributing, you agree that your contribution is licensed under the repository's [MIT License](./LICENSE). Submit only code and assets you have permission to redistribute.
