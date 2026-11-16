# dsh-export-pdf

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

English | [简体中文](README.zh-CN.md)

A DeepSeek Harness (DSH) web plugin that adds a **PDF view page** to a session. Open the page and the conversation transcript is rendered as a PDF you can browse in place; one click downloads the same document. There is no format picker, no parameter form, and no detour through an external converter.

> **Status: design stage.** This repository currently holds the project's requirements, solution, and decision records. No runnable plugin has been implemented yet, and the first implementation task has not been opened. Install instructions will be published together with the first release.

## Planned behavior

- **PDF view page**: a page in the session view area that provides both the preview and the download.
- **In-page preview**: the generated PDF is shown in place, with navigation across all of its pages.
- **Download**: delivers the same bytes as a file named `dsh-session-<first 8 characters of the session id>.pdf`.
- **Faithful transcript**: user messages and assistant replies in log order, each tool call summarized on a single line, thinking blocks omitted.
- **Readable Chinese output**: CJK glyphs embedded, content paginated on A4, no text crossing the page boundary.
- **Visible failures**: a missing session, a log read error, a render error, a missing browser, or a missing CJK font each produce an explicit message on the page and never a partial file.
- **Authenticated and same-origin only**: preview and download requests are rejected without valid credentials or from a foreign origin.

## Design documents

- [PRD.md](PRD.md) — goals, non-goals, milestones, requirements, and acceptance criteria.
- [SOLUTION.md](SOLUTION.md) — architecture, product contract, invariants, and failure semantics.
- [DOMAIN.md](DOMAIN.md) — the shared vocabulary used across the documents.
- [RATIONALE/](RATIONALE/) — why the key choices were made.
- [tasks/](tasks/) — per-change plans and execution evidence.

## Roadmap

| Milestone | Scope | Status |
|---|---|---|
| M-001 PDF view page | view page, in-page preview, download | not started |
| M-002 Transcript fidelity | event ordering, Chinese text, pagination | not started |
| M-003 Failure and boundaries | visible failures, read-only export, authenticated requests | not started |

## Development

The only check available today is the AgentMap document lint:

```sh
python3 tools/agentmap_lint.py --report
```

Git hooks live in `.githooks/` and are enabled per clone:

```sh
git config core.hooksPath .githooks
```

## License

MIT — see [LICENSE](LICENSE).
