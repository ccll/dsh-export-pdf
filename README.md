# dsh-export-pdf

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

English | [简体中文](README.zh-CN.md)

A DeepSeek Harness (DSH) web plugin that adds a **PDF view page** to a session. Open the page and the conversation transcript is rendered as a PDF you can browse in place; one click downloads the same document. There is no format picker, no parameter form, and no detour through an external converter.

> **Status: implemented (0.1.0).** Task T-001 delivered the plugin, its tests, and the browser acceptance run. It installs from this checkout as a local link; no tagged release exists yet.

## Requirements

- A DSH 0.2.x installation with the `web` profile.
- Google Chrome or Chromium on the host.
- A CJK font visible to `fc-list :lang=zh` (for example Noto Sans CJK SC).

## Install

```sh
dsh plugin --profile web add /path/to/dsh-export-pdf
dsh web
```

The repository ships the built browser bundle (`.dsh-plugin/client.js`), so installing needs no build step. After changing anything under `src/`, rebuild it with `pnpm build:client`; the client entry is a hand-built fragment bundle, not a Vite project.

## Use

Open a session and select the **PDF** page next to Chat and Trajectory. The page generates the PDF once, shows it in the browser's PDF viewer, and enables **Download PDF**. The downloaded file is `dsh-session-<first 8 characters of the session id>.pdf`; the `session-` prefix is removed before slicing so different sessions do not collide.

The page includes user messages and assistant replies in log order, one summary line per tool call, and no thinking blocks or internal runtime-context injections. A blank session shows an empty-state notice instead of starting a render.

## Configuration

The plugin accepts three values. Override them in the profile patch layer, for example `$DSH_HOME/profiles/web/cordis.patch.yml`:

```yaml
- id: export-pdf
  config:
    browserPath: /usr/bin/chromium
    timeoutMs: 45000
    maxConcurrentRenders: 1
```

| Key | Default | Meaning |
|---|---|---|
| `browserPath` | probe `PATH` | Explicit Chrome/Chromium executable; a configured path that is missing or not executable fails plugin load |
| `timeoutMs` | `30000` | Per-render timeout, 1–600000 ms |
| `maxConcurrentRenders` | `2` | Concurrent browser renders, 1–16; excess requests queue |

Invalid values fail at plugin load instead of silently falling back.

## Behavior

- **PDF view page**: a view in the session view area providing both preview and download.
- **In-page preview**: the generated PDF is displayed in place in the browser's PDF viewer, with navigation across all pages.
- **Download**: delivers the same bytes under the stable filename above.
- **Faithful transcript**: user messages and assistant replies in log order; tool calls summarized on one line; thinking blocks omitted.
- **Readable Chinese output**: CJK glyphs embedded, A4 pages, Chrome's default header/footer disabled so no date, title, or temporary file path is printed.
- **Visible failures**: a missing session, an unreadable log, a missing browser, a missing CJK font, a render failure, or a timeout produces an explicit message on the page and never a partial file. A failed render is not cached, so **Retry** starts a fresh attempt.
- **Read-only**: exporting never writes to the session log and leaves no files behind.
- **Credentialed and same-origin only**: the route is registered through DSH's `/api` channel, so the host's browser authentication and Host/Origin fence apply before the plugin sees the request.
- **Per-session reuse**: concurrent requests for one session share a single render; a cached result is reused until the log grows.

## Development

```sh
pnpm install
pnpm build:client
pnpm check          # bundle parity, module wrapper, manifest, syntax
pnpm test           # unit tests + real Chrome PDF integration
pnpm test:e2e       # browser acceptance in an isolated DSH home
pnpm lint:agentmap  # AgentMap structure, traceability, contract coverage
```

`pnpm test` skips the real-browser integration when Chrome or a CJK font is absent. `pnpm test:e2e` boots a temporary `$DSH_HOME` with a mock LLM, installs this checkout, starts `dsh web` on a random port, and drives system Chrome through `playwright-core`; it never touches a running GUI or the user's web profile. Set `CHROME_PATH` when Chrome is not at `/usr/bin/google-chrome`.

Git hooks live in `.githooks/` and are enabled per clone:

```sh
git config core.hooksPath .githooks
```

## Design documents

- [PRD.md](PRD.md) — goals, non-goals, milestones, requirements, and acceptance criteria.
- [SOLUTION.md](SOLUTION.md) — architecture, product contract, invariants, and failure semantics.
- [DOMAIN.md](DOMAIN.md) — the shared vocabulary used across the documents.
- [RATIONALE/](RATIONALE/) — why the key choices were made.
- [tasks/](tasks/) — per-change plans and execution evidence.

## Roadmap

| Milestone | Scope | Status |
|---|---|---|
| M-001 PDF view page | view page, in-page preview, download | delivered by T-001 |
| M-002 Transcript fidelity | event ordering, Chinese text, pagination | delivered by T-001 |
| M-003 Failure and boundaries | visible failures, read-only export, authenticated requests | delivered by T-001 |

## License

MIT — see [LICENSE](LICENSE).
