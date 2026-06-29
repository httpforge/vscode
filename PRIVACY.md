# Privacy Policy

**Last updated:** June 2026

HttpForge is a local-first VS Code extension. This policy describes what data the extension handles and your responsibilities as a user.

## Summary

HttpForge does **not** operate a mandatory cloud account, does **not** send telemetry or usage analytics by default, and stores your API workspace data **locally** on your machine.

## Data We Do Not Collect

By default, HttpForge does **not**:

* Collect personal information
* Track usage or analytics
* Upload your collections, environments, or request history to HttpForge servers
* Access your API endpoints except when **you** send a request

## Data Stored Locally

The extension may store the following on your device:

* API collections, folders, and requests
* Environment and global variables (including values marked as secrets)
* Request history and response snapshots
* Extension settings and UI preferences
* SQLite database files under VS Code extension global storage

You control this data. Uninstalling the extension or clearing VS Code extension storage removes local HttpForge data.

## Data You Choose to Share

You may intentionally send or sync data outside your machine when using:

* **HTTP/HTTPS/WebSocket/GraphQL requests** — sent to URLs you configure
* **Git sync** — collections committed to repositories you choose
* **Documentation publishing** — content written to paths or remotes you specify
* **Import/export** — files you open or save locally
* **WSDL or remote URL fetch** — only when you provide a URL

HttpForge is not responsible for third-party services, APIs, or Git hosts you connect to.

## Secrets and Credentials

* Mark sensitive environment variables as **secret** so they are masked in the UI and documentation where supported.
* Avoid committing secrets to version control. Review exports before sharing.
* Protect your machine, VS Code profile, and backup files — anyone with access to your storage can read unencrypted local data.

## Third-Party Resources

The webview loads Tailwind CSS from `https://cdn.tailwindcss.com` for styling. No personal data is sent to that CDN as part of normal UI rendering.

Links in the extension may open external sites (documentation, GitHub, support email). Those sites have their own privacy policies.

## Children's Privacy

HttpForge is a developer tool not directed at children under 13. We do not knowingly collect information from children.

## Changes to This Policy

We may update this policy as the product evolves. Material changes will be reflected in this file and noted in release notes.

## Contact

Privacy questions: [httpforge@outlook.com](mailto:httpforge@outlook.com)

Related documents:

* [Security Policy](./SECURITY.md)
* [Terms of Use](./TERMS.md)
* [Code of Conduct](./CODE_OF_CONDUCT.md)
