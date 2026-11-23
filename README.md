# dsh-export-pdf

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

English | [简体中文](README.zh-CN.md)

A DeepSeek Harness (DSH) web plugin that adds a **PDF view page** to a session. Open the page and the conversation transcript is rendered as a PDF you can browse in place; one click downloads the same document. There is no format picker, no parameter form, and no detour through an external converter.

> **Status: released (v0.1.0).** Install the tagged release from GitHub; the same commit ships the built browser bundle.

## Requirements

- A DSH 0.2.x installation with the `web` profile.
- Google Chrome, Chromium, or Microsoft Edge on the host; the plugin probes standard install locations and `PATH`.
- A CJK font visible to `fc-list :lang=zh` or present in a common system font directory (for example Noto Sans CJK SC).

## Install

```sh
dsh plugin --profile web add github:ccll/dsh-export-pdf#v0.1.0
dsh web
```

To develop from a checkout, add its local path instead: `dsh plugin --profile web add /path/to/dsh-export-pdf`.

The repository ships the built browser bundle (`.dsh-plugin/client.js`), so installing needs no build step. After changing anything under `src/`, rebuild it with `pnpm build:client`; the client entry is a hand-built fragment bundle, not a Vite project.

## Use

Open a session and select the **PDF** page next to Chat and Trajectory. The page generates the PDF once, shows it in the browser's PDF viewer, and enables **Download PDF**. The downloaded file is `dsh-session-<first 8 characters of the session id>.pdf`; the `session-` prefix is removed before slicing so different sessions do not collide.

The page starts with a clean transcript: user messages and assistant replies in log order, with no thinking blocks or internal runtime-context injections. Message images default to `[图片]` placeholders; the **图片** select switches to embedding the original images or omitting them. Two header checkboxes add file attachment placeholders and one-line tool-call summaries; files are never embedded. The same selection drives both the preview and the download. Downloads append `-tools`, `-attachments`, `-images`, or `-no-images` when those variants are selected, so they do not overwrite each other. User messages are right-aligned in light bubbles with a small person icon; assistant replies stay left-aligned with a small robot icon, so the two sides remain easy to scan in long exports. A session with no renderable transcript, or a selection with no renderable content, shows an empty-state notice instead of starting a browser render.

## Configuration

The plugin accepts four values. Override them in the profile patch layer, for example `$DSH_HOME/profiles/web/cordis.patch.yml`:

```yaml
- id: export-pdf
  config:
    browserPath: /usr/bin/chromium
    timeoutMs: 45000
    exportTimeoutMs: 120000
    maxConcurrentRenders: 1
```

| Key | Default | Meaning |
|---|---|---|
| `browserPath` | standard install paths, then `PATH` | Explicit Chrome/Chromium executable; a configured path that is missing or not executable makes every export fail with `503` |
| `timeoutMs` | `30000` | Per-render timeout, 1–600000 ms |
| `exportTimeoutMs` | `120000` or `timeoutMs`, whichever is larger | Whole-export deadline covering log read, image resolution, and print, 1–600000 ms; when set explicitly it must be at least `timeoutMs` |
| `maxConcurrentRenders` | `2` | Concurrent browser renders, 1–16; excess requests queue |

Invalid values, including an `exportTimeoutMs` shorter than `timeoutMs`, fail at plugin load instead of silently falling back.

The plugin does not export a DSH `Config` schema, so these fields are patch-only: Plugin Manager cannot edit or schema-check them. UI labels are Simplified Chinese; the client half registers no locale dictionary.

## Behavior

- **PDF view page**: a view in the session view area providing both preview and download.
- **In-page preview**: on desktop viewports the generated PDF is displayed in place in the browser's PDF viewer, with navigation across all pages.
- **Narrow viewports (mobile)**: at viewports of 720px or narrower the embedded viewer is replaced by an "Open full PDF" link; it opens the same PDF in a new tab so the system viewer can show every page.
- **Download**: delivers the same bytes under the stable filename above.
- **Faithful transcript**: user and assistant messages appear in log order with Markdown headings, lists, quotes, fenced code, tables, and inline emphasis rendered; raw HTML is escaped, links allow only http/https/mailto, and Markdown image syntax becomes a placeholder. Image placeholders follow the image mode, while the header checkboxes add file placeholders and one-line tool summaries; thinking blocks omitted.
- **Readable Chinese output**: CJK glyphs embedded, A4 pages, Chrome's default header/footer disabled so no date, title, or temporary file path is printed.
- **Visible failures**: a missing session, an unreadable log, a missing browser, a missing CJK font, a render failure, or a timeout produces an explicit message on the page and never a partial file. The whole-export deadline also covers a stuck log or image read. A failed render is not cached, so **Retry** starts a fresh attempt; image-read fallbacks are not cached either, so a retry can recover the original image.
- **Read-only**: exporting never writes to the session log and leaves no session-content artifacts behind; the hot-reload pipeline cache lives in a private temporary directory and is removed on unload.
- **Credentialed and same-origin only**: the route is registered through DSH's `/api` channel, so the host's browser authentication and Host/Origin fence apply before the plugin sees the request.
- **Image modes**: the header image select offers placeholder (default), embed original, and no export. Embedding covers both uploaded images from this session's attachment library and local image files referenced with Markdown image syntax; local files are read through the host file service with the host process's read permission (the sandbox only constrains writes), final symlinks are refused, and only common image extensions with validated image bytes are accepted, and fall back to `[图片]` / `[图片: alt]` when unavailable. Remote http(s) image addresses are never fetched; other files are never embedded.
- **Per-selection reuse**: concurrent requests for one session, content selection, and image mode share a single render; a cached result is reused until the log grows or the selection changes.

## Development

```sh
pnpm install
pnpm check          # committed bundle parity, bundle/source syntax, manifest
pnpm build:client   # regenerate the bundle after src changes
pnpm test           # unit tests + real Chrome PDF integration
pnpm test:e2e       # browser acceptance in an isolated DSH home
pnpm lint:agentmap  # AgentMap structure, traceability, contract coverage
```

What takes effect when:

- The modules listed in `PIPELINE_MODULES` (`src/pipeline.mjs`) and `src/page-style.css` hot-reload at export time; edit and reload the PDF view, no `dsh` restart. `src/errors.mjs`, `src/process.mjs`, and the host wiring stay static.
- Client bundle changes go through `pnpm build:client`; the client HMR receiver reloads the page automatically.
- Host wiring and shell (`src/host.mjs`, `src/route.mjs`, `src/config.mjs`, `src/chrome.mjs`, `src/fonts.mjs`, `src/errors.mjs`, `src/process.mjs`, `src/pipeline.mjs`, `src/page-style.mjs`, dependencies, and `cordis.patch.yml`) are fixed at boot and still need a restart.

`pnpm test` skips the real-browser integration when Chrome or a CJK font is absent. `pnpm test:e2e` boots a temporary `$DSH_HOME` with a mock LLM, installs this checkout, starts `dsh web` on a random port, and drives system Chrome through `playwright-core`; it never touches a running GUI or the user's web profile. Set `CHROME_PATH` when Chrome is not at `/usr/bin/google-chrome`.

Git hooks live in `.githooks/` and are enabled per clone:

```sh
git config core.hooksPath .githooks
```

## Releases

A published GitHub Release `vX.Y.Z` triggers `.github/workflows/npm-publish.yml`: it verifies the release is published, the tag matches `package.json`, runs lint/check/tests, and publishes with npm Trusted Publishing (`npm publish --provenance --access public`). No `NPM_TOKEN` is stored.

npm can only bind a trusted publisher to an existing package. The first version is a one-time manual bootstrap: `npm login`, then `npm publish --access public` from this repository. In the package's npm settings, add a trusted publisher for GitHub owner `ccll`, repository `dsh-export-pdf`, workflow `npm-publish.yml`, with `npm publish` allowed. A new trusted-publisher configuration must complete a publish within 48 hours.

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
| M-004 Message layout | right-aligned user messages, left-aligned assistant replies | delivered by T-003 |
| M-005 Role icons | person icon for users, robot icon for assistants | delivered by T-004 |
| M-006 Export content selection | default minimal, opt-in tool summaries and file placeholders | delivered by T-005 |
| M-007 Image export modes | placeholder, embed original, or omit images | delivered by T-007 |
| M-008 Mobile PDF access | narrow viewport opens the full PDF in a new tab | delivered by T-009 |
| M-009 Markdown rendering | headings, lists, quotes, fenced code, tables, inline emphasis | delivered by T-010 |

## License

MIT — see [LICENSE](LICENSE).
