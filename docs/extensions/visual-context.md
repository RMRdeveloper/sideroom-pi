# Browser context

Select a page element in your browser and carry local source candidates into your next
Pi prompt. Basic inferred matching needs no project configuration. Optional
development compiler metadata provides locations checked against the local source.
The browser companion ships in
`assets/visual-context/browser/` with the Pi package.

## Download without a store

Download [the browser companion ZIP](https://github.com/RMRdeveloper/sideroom-pi/releases/latest/download/sideroom-browser-extension.zip)
from the latest Sideroom GitHub Release. Extract it and keep the
`sideroom-browser-extension` folder in a permanent location. In
`chrome://extensions` (or `edge://extensions`), enable developer mode, choose
**Load unpacked**, and select
that folder, which contains `manifest.json`. The ZIP includes English and
Spanish instructions and the licence. It does not install by double-clicking
or dragging the ZIP into the browser, and it is not a store-signed extension.
Managed browsers can prohibit developer mode.

Updates are manual: replace the files in the same folder with the new release's
ZIP and reload the extension. Keeping the folder avoids an unnecessary reinstall
and preserves the authorization. The accompanying `.zip.sha256` file records
the ZIP checksum; `release.json` inside identifies the Sideroom version it was
built for. The browser manifest retains the companion's own version.

The npm package also includes the same companion source directory, so the
installation path shown by Pi's `F7` remains available.

## First use

1. Start Pi in the target repository, with Sideroom loaded, and press `F7`.
2. Choose **Pair browser**. Pi shows the browser extension directory and a pairing
   address. Keep that address private; it authorizes this Pi installation.
3. In `chrome://extensions` (or `edge://extensions`), enable developer mode,
   choose **Load unpacked**, and
   select the directory Pi showed. This installs the browser companion once;
   it does not configure the target project. When Pi runs in WSL, select the
   Linux directory through `\\wsl.localhost\<distribution>\...` from Windows.
   See Microsoft's [local extension installation guide](https://learn.microsoft.com/en-us/microsoft-edge/extensions/getting-started/extension-sideloading).
4. Open the companion from the browser toolbar, paste the pairing address, and
   choose **Connect to Pi**. The browser remembers the authorization across restarts.
   If you use both Windows Pi and WSL Pi, repeat this once in each installation;
   the same companion remembers both.
5. Choose the destination under **Send selections to** if several Pi sessions
   are available. Names, environments (Windows/WSL) and project paths identify
   them. Open the application normally and press **Alt+Shift+S**, or choose
   **Select an element** in the companion. Move the pointer to highlight a node
   and click to attach it. You can select several elements; press the shortcut
   again or Escape to leave selection mode. Selection suppresses the ordinary
   click action until you exit.
6. Review the pending element with `F7`. Choose a source candidate or remove
   the element. Then send your instruction in Pi.

The click prepares context and never starts an agent run. The compact widget
shows up to five pending elements. Each can have up to eight ranked source
candidates. Pending selections without a chosen candidate still accompany the
next prompt, clearly marked unresolved, so the agent can inspect the options
or ask you to clarify.

## Keyboard shortcut and page access

**Alt+Shift+S** toggles the inspector on the current tab without opening the
popup. Change or assign it in `chrome://extensions/shortcuts` (or
`edge://extensions/shortcuts` in Edge). Browser, operating-system or other
extension shortcuts can take priority; the popup displays the actual assigned
shortcut, not just the suggested default. It works only while the browser has
focus, not as a global keyboard shortcut.

The companion injects its inspector only after you request selection, using
`activeTab`. It has no permanent page-access grant or automatically loaded
content script. While selecting, the icon shows **ON** and the page explains
how to exit. Escape, the shortcut, navigation, disconnect or a destination
change removes the overlay and its page-event listeners. Exiting does not
remove selections already sent to Pi or disconnect the local bridge. When
inactive, the inspector does not intercept page clicks or keys. You can keep
the toolbar icon unpinned and use only the shortcut after pairing.

If pairing or a destination choice is needed, or the page cannot be inspected,
the shortcut does not activate the inspector. The icon shows **!** and its
hover text explains the failure; open the popup for details. The shortcut never
chooses between multiple Pi sessions or resumes a paused connection. Internal
browser pages and other pages that prohibit injection cannot be selected.

## Source accuracy

### Development compiler setup

Ask Pi to enable precise visual context for a specific project. The packaged
[`sideroom-visual-setup` skill](../../skills/sideroom-visual-setup/SKILL.md) owns the
setup workflow and runtime-path checks, including Docker. Pi can run in
the project itself or in a parent folder holding several projects. The
`sideroom_visual_setup` tool has three actions:

- `discover`: list projects up to three child-folder levels deep, respecting
  ignore files, symlinks, generated folders and a 4,096-entry / 64-project budget.
  Discovery reports limits and per-project failures instead of configuring anything.
- `prepare`, with `project`: return a configuration edit, pinned development
  dependency installation command and available check scripts for that project.
  The parent agent reads the guides, applies the edit with Pi's normal file tools,
  installs using the detected package manager, and runs the project's checks.
- `bind`, with `project` and `page`: associate that page origin with a project
  on the active Pi session branch and resolve its pending elements again. F7 also
  offers **Associate this page with a project** when reviewing an element.

For example, from a folder containing `shop/` and `admin/`, ask Pi to configure
`shop/`. Only that project's configuration and development dependency change.
An origin association applies to all routes on that origin; apps sharing an
origin need separate origins or an explicit reassociation. Another port has a
different origin. Associations survive compaction and restore only from the
active branch; they are never written into project files or the system prompt.

Automatic patches support static Vite, Astro, Nuxt, Webpack and Rspack configs,
plus Next.js 16+ configs without existing custom bundler hooks. Existing settings
are preserved. Custom exports, multiple exports, executable configuration
mutations, spreads, computed keys and existing inspector integrations need a
targeted edit by the parent agent; prepare leaves
them unchanged and explains the limitation. Missing build configs also need a
normal agent edit before prepare can proceed. Workspace package managers are
inherited from ancestor workspace manifests or pnpm workspace files when the
child does not declare its own manager or lockfile.

The generated integration uses the Code Inspector compiler package, not its
browser UI: Vite uses `@code-inspector/core`, Webpack/Rspack and Next use the
metadata loader in `@code-inspector/webpack`. Both are pinned to 2.0.9 in the
installation plan. The metadata hook runs before framework transforms and only
in development; it adds no extra browser client, editor-launch service or Pi
wrapper. This avoids source-position shifts caused by injecting a second UI
before instrumenting markup. Vite skips component-wrapper markers so their
props cannot replace native-element locations. No source maps or framework
runtime internals are required for this mode.

Restart the development server after applying setup. Upgrade/reload both Pi and
the browser companion, then refresh already inspected pages: protocol version 3
carries the additional location fields. Old companions must be reloaded; the
persistent pairing address is retained.

The companion reads only the selected node's `data-insp-path`, never a parent
marker. Absolute paths identify files beneath the Pi working folder, including
children; relative paths require a page association. Paths from another machine
or container need a matching local project/path arrangement and remain unresolved
until it exists. Pi checks exclusions, project boundaries, format, line, column
and native tag against parsed local markup. A single validated compiler location
is selected automatically and labelled **compiler location checked**. Its context
includes the column and source range. Missing, excluded or mismatched metadata
produces an explicit unresolved reason, without quietly substituting a weaker
candidate. A selection with no marker still uses inferred matching, scoped to the
associated project when there is one.

A compiler marker identifies a declaration, not every instance or component use
site. Component wrappers, forwarded markers, generated nodes and unsupported
markup can remain unresolved. The page is untrusted and a matching local tag is
not proof that its running build matches the local revision. The captured source
hash prevents attaching a reference after subsequent local edits. Verification
requires an actual selection with a locally validated marker; dependency
installation alone is not a verified setup.

### Inferred matching

The browser knows the rendered element; it does not generally know the file
that generated it. With no application instrumentation, this extension searches
the local source for matching static classes, ids and text. Classes are counted
once, their contribution is bounded, and a conflicting static id excludes a
candidate. Parent ids and classes add evidence only in ancestor order; a parent
tag alone does not qualify an element. Each score includes its reasons.
Text is joined as rendered rather than with invented spaces. Literal string
expressions can contribute evidence, but unknown expressions are never executed
or erased to manufacture matching text. Conditional children and attribute
spreads leave text uncertain rather than proving a full text match. Vue custom
file blocks are excluded when a template is present. Hidden, editable and form
text is excluded, HTML entities are decoded, and a text prefix at the companion's
160-character capture limit is weaker evidence than full static text.

Every inferred range exists in the source version inspected. The relationship
between that range and the rendered element remains **inferred**, even after
you choose a candidate. It is never labelled exact. Repeated markup stays
ambiguous, and a tag name alone is insufficient evidence. Dynamic classes,
translated text, generated markup, runtime-only elements and component wrapper
tags can leave the origin unresolved.

The supported search inputs are `.html`, `.htm`, `.vue`, `.svelte`, `.astro`,
`.jsx` and `.tsx`. HTML uses `parse5`; JSX/TSX use `@babel/parser`; Vue uses
`@vue/compiler-dom`; Svelte uses `svelte/compiler`'s modern syntax tree; and
Astro uses `@astrojs/compiler/sync`. Script strings, comments and Astro
frontmatter are not markup candidates. Component wrappers do not establish
which native DOM node a component renders. These are compiler dependencies in
Sideroom, not plugins or runtime dependencies added to the inspected app.
No framework runtime internals are read, and inspected code is never executed.
Compiler locations additionally support JSX in `.js`, `.mjs`, `.ts` and `.mts`.

Ranges are checked against the original source. Astro's byte positions are
converted to string positions, including Unicode before the element. When its
closing position cannot be verified, only the original opening tag is returned.
Syntax errors, unsupported or external Vue templates and unverifiable opening
positions cause a file to be omitted and the search to be labelled truncated;
other files still contribute candidates. There is no HTML fallback for an
unparseable component. Unexpected internal errors remain errors. The agent must
read the current file before editing it.

## Local connection and Windows / WSL

The first `F7` pairing creates a stable localhost port and a 256-bit credential
in `getAgentDir()/sideroom-visual-context/connection.json`, outside the inspected
project. Subsequent trusted interactive Pi sessions join automatically. The
first active Pi process hosts the shared listener, bound only to `127.0.0.1`;
other processes register as destinations. If the host exits, another active
process takes over the same port. No separate daemon, CLI or project setup is
required. The listener disappears when no Pi process remains.

The credential travels in the first authenticated message, never in a URL query
or a Pi session entry. Creation is atomic across concurrent Pi processes; Linux
uses directory mode `0700` and file mode `0600`. Windows uses the account's
profile directory and its filesystem permissions, not a claim of POSIX modes.

The browser remembers up to four independent installations using `storage.local`,
restricted to trusted extension contexts. Windows and WSL can use separate Pi
configuration directories and credentials, with their destinations merged in
one selector. A sole session is selected automatically; multiple sessions
require an explicit choice. Adding another destination clears an automatic
choice, but preserves a choice the user made explicitly.
If an explicitly chosen destination disappears, the companion waits for it
or asks you to choose another; it never substitutes a different session.

The companion exchanges a heartbeat every 20 seconds and reconnects after
shutdown, restart or broker handoff. When its worker has been suspended while
Pi is closed, an alarm checks again each minute; opening the popup also retries.
**Disconnect** pauses reconnection and stops inspectors while remembering the
authorizations. **Connect to Pi** resumes them. **Forget authorizations** deletes
the saved browser credentials; it does not rotate the installation credential
or revoke a different browser profile. `F7`'s disconnect stops only that Pi
instance from receiving elements until it joins again.

After upgrading the original session-only companion, reload it in
`chrome://extensions` or `edge://extensions` and pair once with each
installation's new persistent
address. Old temporary addresses cannot be reused. The icon is a white `S` on
black, rendered with Archivo Variable, Sideroom's website text family.

For Windows Pi and a Windows browser, the connection uses Windows localhost. For
WSL Pi and a Windows browser, Windows must be able to reach WSL localhost. Standard
WSL localhost forwarding or mirrored networking provides this; Sideroom does
not alter Windows networking, firewall rules, or bind a listener to every
network interface. If localhost forwarding is disabled, the popup reports
that Pi cannot be reached. This is a machine-level networking requirement,
not application configuration.
See Microsoft's [WSL networking documentation](https://learn.microsoft.com/en-us/windows/wsl/networking)
for localhost access from Windows and mirrored networking.

The first authorization starts from `F7`; later trusted interactive sessions
join automatically. The bridge accepts extension origins for browser clients
and an authenticated internal Pi origin for destination registration. It
authenticates before processing a selection, limits incoming frames to 8 KiB
and limits selection frequency. The companion checks the complete outgoing
UTF-8 frame before creating a receipt or sending it. Oversized captures receive
a local error without closing the connection. Identified replies settle only
the matching selection on the matching installation; ID-less errors retain the
installation-wide handling used by older brokers.
The browser provides bounded DOM descriptions and optional untrusted compiler
coordinates; no browser path authorizes a file read outside the allowed project.
Unknown origins, wrong credentials and invalid payloads are rejected.

## State and lifecycle

Pending elements are stored with `appendEntry('sideroom-visual-context', ...)`
and reconstructed from the active branch. Empty snapshots are authoritative.
The stored payload contains DOM descriptors, local ranges and source hashes;
it contains no pairing credential or source-file body. Resume and compaction
restore pending elements. Conversation and tree changes keep the connection
and publish a new destination revision. Both the broker and receiving Pi
process reject selections for an earlier revision. The companion stops the old
inspector, so clicks made for an old conversation cannot attach to the new one.
Selections are routed only to the chosen destination; pending data is never
shared between Pi instances.

Before attaching context or accepting a chosen candidate, source hashes and
project boundaries are checked again. Changed, removed or moved-outside-project
files lose their source reference. Each restore or attachment reads and hashes
each distinct referenced file once, preserving candidate identity and order.
These versions are discarded after the operation; the next operation checks
the filesystem again. A pending selection is a description of the
page at click time; it does not assert that the live DOM is still unchanged.

The next idle interactive prompt receives the context through Pi's `input`
transformation. Images and the user's original text are preserved. Busy input,
queued follow-ups, extension steers, shell input and slash commands do not
consume pending elements. A matching `before_agent_start` consumes only the
elements attached to that prompt, after model/auth validation; failed prompt
submission leaves them pending. An empty snapshot prevents duplicate attachment.
The system prompt is never changed.

Browser text is marked untrusted data. URLs lose credentials, query strings
and fragments. Form values and editable text are excluded from capture. Source
search respects ignore files, excludes hidden and sensitive-named files,
symlinks and generated/dependency directories, and reads at most 4,096 entries,
16 directory levels, 256 KiB per file and 8 MiB of source. A search cut short
by a limit or an omitted unparseable file is labelled truncated, and a candidate
list shortened by the eight-candidate cap is labelled capped. The search retains
only the eight best candidates while walking, with the same score, path and
line ordering. Ignore rules are shared within each synchronous search, not
between searches, and path metadata is still checked against symlink changes.
Selection and
association write only Pi session entries. Explicit compiler setup changes only
the selected project's build configuration and development dependencies through
normal parent-agent tools.

The first version selects the main document and exposed DOM elements. It does
not claim selection inside cross-origin iframes, closed shadow roots or canvas.
The companion targets Chromium-based browsers 116 or later, such as Chrome,
Edge or Brave; Firefox is outside this version's scope. A Windows browser
reaching WSL requires a machine-level
smoke test in addition to automated Linux Chromium checks.

## Implementation and verification

| File | Responsibility |
| --- | --- |
| `extensions/visual-context/index.ts` | Pi events, `F7` action coordination, session-generation checks and cleanup. |
| `dialogs.ts` | F7 menus and answer decoding without changing session state. |
| `model.ts` | Bounded DOM contract, pending selections and context formatting. |
| `bridge.ts` | Pi registration, destination revisions and automatic broker takeover. |
| `broker.ts` | Authenticated local routing between browser clients and Pi processes. |
| `envelope.ts` | Websocket envelope both sides send and parse. |
| `pairing.ts` | Atomic global installation identity and persistent pairing address. |
| `match.ts` | Dialect dispatch, candidate scoring, reasons and source lines. Pure. |
| `markup.ts` | Shared static-element representation, text and range verification. |
| `parse-*.ts` | HTML, JSX/TSX, Vue, Svelte and Astro syntax extraction. |
| `literal.ts` | Literal string extraction without evaluating inspected code. |
| `source.ts` | Bounded candidate ranking, compiler resolution and batched stale-reference checks. |
| `files.ts` | Shared exclusions, directory-relative ignore rules and operation-local safe path policies. |
| `projects.ts` | Bounded child-project discovery and package managers. |
| `configure.ts` | Conservative AST-based configuration patches. |
| `compiler-config.ts` | Framework and compiler package contracts, development-only hooks and loaders. |
| `setup.ts` | Setup tool and configuration/installation plans. |
| `session.ts` | Branch snapshots, reception and one-time context consumption. |
| `ui.ts` | Compact widget and companion installation location. |
| `assets/visual-context/browser/background.js` | Browser connections, authorizations and per-selection receipts. |
| `assets/visual-context/browser/destinations.js` | Explicit and automatic destination choice, independent of browser APIs. |
| `assets/visual-context/browser/content.js` | DOM capture, highlighting and inspector cleanup. |

`match.test.ts` covers each dialect's real markup, literal attributes, script
and comment decoys, entities, Unicode, original ranges, dynamic expressions,
component wrappers, class deduplication, id conflicts, ordered ancestors,
truncated text and partial results after parse failures.

`source-policy.test.ts` checks nested ignore precedence, symlink replacement,
ranking equivalence, fresh operations and one file read for forty pending
candidate references. `dialogs.test.ts` checks menus, cancellation and unchanged
session state; `destinations.test.ts` checks explicit and automatic choices,
destination revisions and independent instances. Worker tests check individual
receipt errors, wrong-installation replies, UTF-8 frame limits and recovery after
failed sends. F7 integration tests retain stale-session and stale-source guards.

`node:test` covers real socket authentication and rejection, multiline source
locations, ignored files, symlinks, ambiguity, source changes, branch snapshots,
compaction, queue boundaries, the pending cap and the complete bridge-to-input
flow. Real socket tests also cover independent destinations, stale revisions,
concurrent identity creation, Pi restart and broker takeover. Companion tests
cover browser restart, alarms, remembering Windows and WSL independently,
explicit destination choice, disconnect and forgetting authorization. They also
cover keyboard activation and cancellation, rapid repeated shortcuts, multiple
selections, per-tab indicators, missing or ambiguous destinations, paused
connections, unsupported pages, injection failures and navigation cleanup.
`extensions/shared/prompt-cache.test.ts` includes this extension in its
combined system-prompt checks. `metadata.test.ts`, `setup.test.ts` and inspector
tests cover original coordinates, sibling projects, origin association, restore,
stale references, invalid metadata, setup trust, configuration preservation and
development-only behavior. Compiler verification also exercised the generated
Vite config against the real Code Inspector compiler package and checked original
React/JSX, Vue, Svelte and Astro positions. The compiler-mode Chromium
smoke test loaded generated configs for React, Vue and Astro child projects,
selected reused buttons with the actual companion inspector, verified their
original declaration coordinates and project paths, checked click suppression
and Escape cleanup, and confirmed that a React production build contains no
compiler markers. These temporary smoke fixtures live outside the repository.
The earlier inferred-mode verification used a local Vue
development server without changing its configuration. The Linux Chromium
smoke test loads a temporary copy of the companion with a localhost-only host
grant to simulate the toolbar's `activeTab` grant in headless automation; that
permission is absent from the published companion. The real inspector click on
a component's call-to-action button returns that template range alongside an
ambiguous candidate, suppresses navigation, and Escape removes the inspector.
The persistent-connection smoke test authorizes two independent local
installations with simulated Windows/WSL destination labels, routes to the
chosen instance, reconnects after broker host shutdown, and restores both
authorizations after restarting Chromium. The simulated labels do not replace
the pending native Windows/WSL networking check.
