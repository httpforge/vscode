# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Planned

* Native gRPC transport (HTTP/2 + protobuf)
* AI request and test generation
* Team workspaces

---

## [0.1.2] - 2026-07-02

### Added

* Dedicated **gRPC** request builder (HTTP POST for gRPC-Gateway / gRPC-Web endpoints)
* Real **WebSocket** connections in the webview (connect, send, receive messages)
* Environment variable auto-save on blur for environment editor fields
* Default `BASE_URL` variable when creating a new environment

### Fixed

* **GraphQL** playground crash when opening a request (`query` was undefined in the editor)
* **Send request** wiping the response panel (extension posted `init` instead of `response` after execution)
* **GraphQL execute** and **SOAP send** not returning responses in the UI
* Unresolved `{{BASE_URL}}` and other env vars now show a clear error before send
* **Settings gear** menu not opening (dropdown hidden behind workspace; click target on icon)
* Protocol tab switching and **New Request** for GraphQL, WebSocket, gRPC, and SOAP losing the active tab
* Legacy storage stripping new empty projects and default environments on save
* `BASE_URL` values like `jsonplaceholder.typicode.com` no longer cleared on save

### Changed

* Removed **Projects** page from the main panel sidebar (project management stays in the launcher)
* Removed the 2-project limit on the free plan (unlimited projects)
* Launcher sidebar: **+ New Project** at top, inline rename/delete for projects, active project loads workspace
* Active launcher project icons render white when selected
* gRPC new requests default to **POST** instead of GET

### Improved

* `getActiveEnv()` falls back to the first environment when none is selected
* Webview CSP updated to allow `ws:` / `wss:` connections for WebSocket
* Settings gear menu layout and z-index so dropdown appears above content

---

## [1.0.0] - 2026-01-01

### Added

* HTTP client
* GraphQL support
* WebSocket support (UI)
* Collections
* Environments
* Request history
* Postman import
* OpenAPI import
* VS Code integration

### Initial public release
