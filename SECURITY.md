# Security Policy

## Scope

This policy covers the HttpForge VS Code extension, including:

* Extension host code (TypeScript)
* Webview UI and Content Security Policy (CSP)
* Local SQLite storage for collections, environments, and history
* Git sync and documentation publishing features
* Import/export of third-party collection formats

Out of scope: APIs you call with HttpForge, third-party services you configure, and content hosted on [httpforge.com](https://httpforge.com) outside this repository.

## Supported Versions

The latest stable release of HttpForge receives security updates.

| Version        | Supported |
| -------------- | --------- |
| Latest         | ✅         |
| Older Versions | ❌         |

## Reporting a Vulnerability

If you discover a security vulnerability, please **do not** open a public issue.

Instead, report it privately:

Email: [httpforge@outlook.com](mailto:httpforge@outlook.com)

Please include:

* Description of the vulnerability
* Steps to reproduce
* Potential impact
* Affected version(s)
* Suggested remediation (if available)

We will acknowledge receipt within **72 hours** and provide updates throughout the investigation. We aim to release a fix or mitigation within **90 days** for confirmed issues, depending on severity and complexity.

## Responsible Disclosure

Please allow reasonable time for remediation before publicly disclosing any vulnerability. We will coordinate on disclosure timing once a fix is available.

## Security Practices

### Local data

* Collections, environment variables, request history, and secrets are stored **locally** on your machine (SQLite under the extension's global storage path).
* Secret variables are flagged in the UI and masked in generated documentation where supported.
* You are responsible for protecting your workspace, backups, and any Git repositories you sync collections to.

### Credentials and secrets

* Do **not** commit real API keys, tokens, or passwords into Git. Use environment variables and mark sensitive values as secrets.
* Review exports (Postman, OpenAPI, JSON) before sharing — they may contain credentials if secrets were not marked or masked.
* Do not paste production credentials into bug reports, issues, or pull requests.

### Network requests

* HttpForge sends HTTP/HTTPS requests **only when you explicitly run a request** or use features that require it (e.g. WSDL import from a URL).
* The extension does not collect telemetry or send usage analytics by default.

### Webview and third-party resources

* The webview uses a strict Content Security Policy with nonce-based scripts.
* Tailwind CSS is loaded from `cdn.tailwindcss.com` at runtime. If you operate in an air-gapped or high-assurance environment, review this dependency before use.

### Dependencies

* We monitor dependency advisories and update packages as part of regular maintenance.
* Report supply-chain or dependency concerns through the same private email above.

## Contributor Security Checklist

Before opening a pull request, verify:

- [ ] No hardcoded secrets, tokens, API keys, or real credentials
- [ ] No `.env`, key files, or local database files committed
- [ ] User-controlled input is validated or escaped (URLs, headers, import files, webview HTML)
- [ ] Secrets and auth values are not logged to the console or written to non-secret storage
- [ ] Generated docs and exports do not leak bearer tokens or passwords
- [ ] New network calls are user-initiated and documented
- [ ] CSP changes are reviewed for XSS impact

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full contribution policy.

## Security-Related Policy Documents

* [Privacy Policy](./PRIVACY.md)
* [Terms of Use](./TERMS.md)
* [Code of Conduct](./CODE_OF_CONDUCT.md)

Thank you for helping keep HttpForge secure.
