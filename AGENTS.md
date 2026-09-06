# AGENTS.md

InkNote — a local-first Markdown desktop editor. Tauri 2 (Rust) backend + React 19 / TypeScript / CodeMirror 6 frontend. This is the UniPeacher patched fork of likehao19/InkNote (multi-window opening, scroll fixes, etc.).

## Layout — read this first

- **All app code lives in the `InkNote/` subdirectory.** Every pnpm command must run from `InkNote/`, not the repo root (root has no `package.json`).
  - `InkNote/src/` — frontend. `components/` (React UI, `App.tsx` is the main orchestrator), `editor/` + `editor.ts` (CodeMirror live-preview engine), `lib/` (pure logic, mostly with co-located `*.test.ts`), `render/export.ts` (unified/remark/rehype HTML+PDF export), `store/useTabsStore.ts` (zustand).
  - `InkNote/src-tauri/` — Rust backend. All Tauri commands live in one file, `src-tauri/src/lib.rs`.
- `docs/` is the static GitHub Pages **website** (plain HTML/CSS/JS) — not app documentation; don't confuse it with the app.
- `scripts/generate-star-history.mjs` regenerates the README star-history chart (also run by CI).
- `InkNote/语法全覆盖测试.md` and `InkNote/sample.md` — manual test documents covering the full Markdown syntax surface.

## Commands (run inside `InkNote/`)

```bash
pnpm install
pnpm tauri dev        # full desktop app dev (vite on fixed port 1420)
pnpm test             # vitest, happy-dom environment
pnpm build            # tsc (typecheck, strict) + vite build
cargo check --all-targets --manifest-path src-tauri/Cargo.toml
pnpm tauri build      # desktop bundle
```

CI (`.github/workflows/ci.yml`) runs `pnpm test`, `pnpm build`, and `cargo check --all-targets` on Linux, Windows, and macOS — this is the acceptance gate. There is **no ESLint/Prettier configured**; `tsc` strict mode (with `noUnusedLocals`/`noUnusedParameters`) is the lint.

## Architecture boundaries

- **IPC is funneled through `src/lib/tauri.ts`.** Components never call `invoke()` directly. To add a Tauri command: implement in `src-tauri/src/lib.rs` (append to the `invoke_handler` / `generate_handler!` list), add a typed wrapper in `lib/tauri.ts`. Backend errors are plain snake_case strings mapped to i18n keys via `BACKEND_ERROR_KEYS` in `tauri.ts` — add a mapping there if the command can fail with a user-facing error. Tauri permissions go in `src-tauri/capabilities/*.json`.
- **Live preview = CodeMirror decorations, not a separate rendered pane.** `src/editor.ts` hides Markdown syntax via `Decoration.replace` and reveals it at the cursor. Block widgets (code, table, math/KaTeX, mermaid, image, frontmatter) live in `src/editor/widgets/` and are edited in place via `editableSource.ts`. Gotcha: widget `ignoreEvent()` returns `true`, so CodeMirror drops events inside widgets — listeners must attach directly to widget DOM (see the Chinese design comment at the top of `editableSource.ts`).
- Keep logic testable and out of components: pure modules in `lib/` with co-located vitest tests are the established pattern.

## Conventions

- User-facing strings go through `src/lib/i18n.ts` (single file with `zh` and `en` dictionaries; add both, key format `area.name`). Backend error strings map to i18n keys in `tauri.ts`.
- Code comments are frequently written in **Chinese** — match the surrounding style of the file.
- No path aliases: imports are relative (`./lib/…`, `../editor/…`).
- Version bumps must touch **three files**: `InkNote/package.json`, `InkNote/src-tauri/Cargo.toml`, `InkNote/src-tauri/tauri.conf.json` (keep `Cargo.lock` consistent).

## Platform gotchas

- **PDF export is Windows/macOS only** (WebView2 print-to-pdf / WKWebView). On Linux the backend returns `pdf_export_unsupported`; HTML export works everywhere. Guard platform-specific Rust code with `#[cfg(windows)]` / `#[cfg(target_os = "macos")]` and keep Linux compiling.
- File I/O must handle non-UTF-8 encodings: reads go through `encoding_rs`/`chardetng` detection (`read_text_file` returns content + detected encoding).
- `tauri.conf.json` CSP is strict (`script-src 'self'`); don't add external script sources. The asset protocol is enabled with a wide scope for local images.
- File associations (`.md`/`.markdown`), single-instance plugin, and open-file-at-launch handshake (`OpenFileState` in `lib.rs` buffers paths until the frontend signals ready) — don't break this flow when touching startup or window code.
- macOS builds are ad-hoc signed; README documents Gatekeeper workarounds — don't change bundling/signing settings casually.
