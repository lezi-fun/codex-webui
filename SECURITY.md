# Security Policy

## Supported version

Security fixes are applied to the latest version on the `main` branch.

## Reporting a vulnerability

Do not publish exploitable details in a public issue. Use GitHub's private vulnerability reporting feature for this repository and include the affected version, reproduction steps, impact, and suggested mitigation if known.

## Security model

Codex WebUI runs commands and edits files through the local Codex app-server. Treat it as a local developer tool, not as a hardened multi-tenant service.

- Do not expose port `8899` directly to the public Internet.
- The default listener is `127.0.0.1`. Non-localhost access requires `CODEX_WEBUI_ACCESS_TOKEN`; once configured, Basic Auth (`codex` as the username) is required for every HTTP and WebSocket request, including localhost.
- Browser WebSocket RPC is allowlisted and cannot invoke app-server filesystem, configuration, or account methods.
- Static files are allowlisted, canonicalized, and symbolic links are never served.
- Folder browsing canonicalizes paths and rejects symbolic links that escape the user's home directory.
- Review Undo/Reapply accepts only server-owned app-server diff notifications. Client-supplied `cwd` and diff data, symbolic-link patches, `.git`, `.env`, and `node_modules` targets are rejected.
- Review approval prompts before allowing commands or file changes.
- Secrets must never be committed, included in screenshots, or pasted into Issues.
