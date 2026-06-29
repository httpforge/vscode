# Contributing to HttpForge

Thank you for contributing to HttpForge.

We welcome:

* Bug fixes
* New features
* Documentation improvements
* Performance optimizations
* UI/UX enhancements
* Protocol integrations

All contributors must follow our [Code of Conduct](./CODE_OF_CONDUCT.md).

## Development Setup

1. Fork the repository
2. Clone your fork

```bash
git clone https://github.com/your-username/httpforge.git
```

3. Install dependencies

```bash
npm install
```

4. Start development

```bash
npm run watch
```

## Branch Naming

```
feature/add-grpc-support
fix/request-body-editor
docs/update-readme
```

## Commit Message Convention

```
feat: add GraphQL variables support
fix: resolve websocket reconnect issue
docs: update installation guide
```

## Pull Requests

Before submitting:

* Run tests
* Verify linting (`npm run lint`)
* Update documentation if needed
* Keep pull requests focused
* Complete the security and policy checklist in the PR template

## Security & Policy Requirements

Review [SECURITY.md](./SECURITY.md) before contributing. Every PR must satisfy:

### Security violations — do not submit if any apply

* Hardcoded API keys, tokens, passwords, or private keys
* Committed `.env` files, certificates, or local database dumps
* Logging or exporting secret values in plain text
* Bypassing CSP, sanitization, or auth masking without justification
* User-controlled URLs or file paths used without validation

### Policy violations — do not submit if any apply

* Behavior that violates the [Code of Conduct](./CODE_OF_CONDUCT.md)
* Copying code or assets without compatible license attribution
* Documenting or claiming features that are not implemented
* Breaking changes without migration notes or maintainer discussion

### Recommended checks

- [ ] No secrets in diff (`git diff` review)
- [ ] Import/export paths handle untrusted input safely
- [ ] Webview HTML output escapes user content
- [ ] New dependencies are justified and license-compatible (MIT-friendly)
- [ ] Privacy impact considered ([PRIVACY.md](./PRIVACY.md))

## Reporting Bugs

Include:

* Operating System
* VS Code Version
* HttpForge Version
* Steps to reproduce
* Expected behavior
* Actual behavior

**Do not** include real credentials, production URLs with sensitive data, or full environment files. Redact tokens and secrets.

## Reporting Security Issues

Do **not** open public issues for vulnerabilities. Email [httpforge@outlook.com](mailto:httpforge@outlook.com) per [SECURITY.md](./SECURITY.md).

## Feature Requests

Please create a GitHub Discussion before opening large feature requests.

Thank you for helping improve HttpForge.
