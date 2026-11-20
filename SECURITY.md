# Security Policy

## Supported Versions

Local-Scope prioritizes the security of self-hosted deployments and match intelligence data. Security updates and patches are applied to the active `main` branch.

| Version | Supported          |
| ------- | ------------------ |
| `main`  | :white_check_mark: |
| < 0.1.0 | :x:                |

---

## Reporting a Vulnerability

If you discover a security vulnerability within Local-Scope (e.g., authentication bypass, arbitrary file read via uploaded `.dem` archives, SQL injection, token leakage, or denial of service), please **do not open a public issue**.

Instead, please report it privately:

1. **GitHub Security Advisory** (Preferred): Open a draft security advisory via [GitHub Security Advisories](https://github.com/wlkcsh/local-scope/security/advisories/new).
2. **Email**: If you are unable to use GitHub Security Advisories, send an encrypted report to **`aa.raxmanovv@gmail.com`** with the subject `[SECURITY VULNERABILITY] Local-Scope`.

### Please Include:
- A detailed description of the vulnerability.
- Steps to reproduce or a Proof-of-Concept (PoC).
- Potential impact on hosted instances or users.
- Suggested mitigations or patches (if available).

We will acknowledge receipt within 48 hours and work with you on a coordinated disclosure timeline.

---

## Security Practices in Local-Scope

- **Demo File Hygiene**: Uploaded demo files (`.dem`, `.dem.gz`, etc.) are processed in an isolated temporary directory and unlinked immediately after extraction. Demos are never executed or parsed with arbitrary shell execution.
- **Process Pool Sandboxing**: Demo parsing is handled via multiprocessing worker isolation to protect the primary API process from parser crashes or memory exhaustion.
- **Credentials & API Tokens**: Secrets such as `FACEIT_API_KEY` and `JWT_SECRET_KEY` must never be logged or committed to the repository. The application enforces token verification via secure HTTP headers and bearer tokens.
- **CORS Protection**: CORS preflight checks strictly block wildcard origins in production environments.
