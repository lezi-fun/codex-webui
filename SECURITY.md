# Security Policy

## Supported version

Security fixes are applied to the latest version on the `main` branch.

## Reporting a vulnerability

Do not publish exploitable details in a public issue. Use GitHub's private vulnerability reporting feature for this repository and include the affected version, reproduction steps, impact, and suggested mitigation if known.

## Security model

Codex WebUI runs commands and edits files through the local Codex app-server. Treat it as a local developer tool, not as a hardened multi-tenant service.

- Do not expose port `8899` directly to the public Internet.
- Use a trusted LAN, VPN, or authenticated reverse proxy.
- Review approval prompts before allowing commands or file changes.
- Folder browsing is constrained to the current user's home directory.
- Undo/Reapply only accepts the exact Git root configured by `CODEX_WEBUI_REVIEW_ROOT`.
- Secrets must never be committed, included in screenshots, or pasted into Issues.
