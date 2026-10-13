# 0010. Infer source candidates without instrumenting the inspected project

- **Status:** Accepted
- **Date:** 2026-10-12

## Context

Pi sees the session and the repository, not a rendered page. Pointing at one
element is faster and more precise than describing it in words, but a browser
knows only the DOM: the file and range that produced an element are not
available to an uninstrumented page.

Three properties of the package constrain the design. An extension may not
write into the target repository or add project configuration. The system
prompt stays byte-identical while a session runs, so per-turn context travels
as a session message or through Pi's `input` transformation. Pi keeps working,
with no browser involved, when the companion is not installed.

The available source of truth is the checked-out source itself. HTML-like
markup parses with original source locations, and static classes, ids and text
are visible in both the DOM and the file. None of that proves which file
produced a rendered element: components, templates and build steps break the
correspondence in the general case.

## Decision

1. Ship a Manifest V3 browser companion inside the package under
   `assets/visual-context/browser/`. It adds no project config, no framework
   runtime import, no build-tool plugin and no source instrumentation.
2. Capture DOM descriptors only: tag, id, up to 32 classes, up to four ancestor
   descriptors and visible text. The page never supplies file paths or ranges.
3. Search the checked-out source for matching static classes, ids and text,
   with ancestor classes as extra evidence, and return up to eight ranked
   candidates with their real ranges and a hash of the inspected version. A tag
   alone scores too low to qualify. Every candidate stays labelled inferred,
   never exact, and the agent reads the current source before editing.
4. Keep the search bounded and read-only: 4,096 entries, 16 directory levels,
   256 KiB per file and 8 MiB in total. Hidden, sensitive-named, symlinked and
   ignored paths are skipped. A search cut short by a limit is labelled
   truncated, and a list shortened by the eight-candidate cap is labelled
   capped.
5. Persist pending selections on the session branch as DOM descriptors, ranges
   and hashes, with no credential and no file body. The empty snapshot is
   authoritative, and every restore re-checks the hash and the project
   boundary, dropping references whose source changed.
6. Create one installation identity per Pi installation under the agent
   directory: a stable localhost port and a 256-bit token, written atomically
   and reused by later trusted interactive sessions. The token travels in the
   first authenticated message, never in a URL query or a session entry. The
   broker binds to `127.0.0.1` only, and another Pi process takes the same port
   over when the host exits.
7. Attach context only through the next idle interactive `input`
   transformation. A click prepares context and never starts a run; images and
   the user's own text survive unchanged, and the system prompt is untouched.
8. Fail closed: an untrusted project opens no listener; unknown origins, wrong
   roles, wrong credentials, unknown payload fields and stale conversation
   revisions are rejected; browser frames are capped at 8 KiB.

## Consequences

- A pending selection describes the page at click time. It never asserts that
  the live DOM still matches, and repeated markup stays ambiguous.
- Selection inside cross-origin iframes, closed shadow roots and canvas is out
  of scope, and dynamic classes, translated text and generated markup can leave
  the origin unresolved.
- A Windows browser reaching Pi in WSL depends on machine-level localhost
  forwarding. Sideroom neither changes Windows networking nor binds to every
  interface.
- The package gains a companion that is versioned and tested with it: two
  runtime dependencies (`parse5`, `ws`), Biome coverage for the companion
  scripts, and Node tests that load it in a VM.
- Pending elements follow the branch, so navigating or compacting never
  duplicates an attachment, and the companion stops the old inspector when the
  destination revision changes.
- Nothing is written into the inspected repository, and no browser click
  authorizes a code change on its own.

## Alternatives considered

- **Instrument the inspected app** with source attributes or a development
  server plugin. Rejected: it configures the target project, couples the
  package to a build tool, and contradicts the no-project-setup requirement.
- **Read framework runtime internals**, such as component instance trees or
  devtools hooks. Rejected: they are private structures that vary by version
  and carry no source range for template content.
- **Claim an exact DOM-to-source mapping** once a candidate scores highest.
  Rejected: without instrumentation the correspondence is inferred, and a
  wrong exact claim misleads more than a labelled candidate.
- **Keep the original session-only pairing address.** Rejected: every session
  needed the address again, and a Pi restart invalidated an authorization the
  user had already granted. The persistent identity removes that ceremony while
  the token stays per installation and outside the project.
- **Route selections through a system-wide daemon.** Rejected: it adds a second
  long-lived process to install, update and supervise. An active Pi process
  hosts the listener, and the port is released when the last one exits.
