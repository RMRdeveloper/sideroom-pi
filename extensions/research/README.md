# Research extension

`index.ts` registers `sideroom_research`, instructs the parent to use it
proactively for non-trivial code exploration, and rejects identical requests
that are already running. It returns immediately and sends the result to the
originating session branch, resuming an idle parent. Session start, branch
navigation, shutdown and parent cancellation cancel active research and discard
late results. It adds no project files. `delivery.ts` keeps reports in memory
until Pi records their messages. It retries unconfirmed reports every five
seconds while idle. A slow delivery can be duplicated because Pi does not
expose asynchronous delivery failures to the extension.

`agent.ts` creates a separate in-memory agent using the parent session's model
registry. It offers only project listing, bounded file reads and literal search,
and the two fixed Git operations. It does not load other extensions, a shell,
web tools, user interaction, or delegation.

`reader.ts` opens project paths through Linux `/proc/self/fd`, rejects symbolic
links and direct `.git` access, and verifies the project root identity. These
checks are not an operating-system sandbox: hard links, mounted filesystems and
concurrent directory moves remain limitations. The model is responsible for
avoiding unrelated credentials and sensitive files. Hidden files and ignored
files are not excluded. File contents can be sent to the selected model provider.

`workflow.ts` owns the cooperative time and generated-output limits, cancellation,
call counting, one correction attempt for unread cited files and partial report recovery. `partial.ts` preserves bounded excerpts
from successful reads, searches and Git operations when no model-written partial
report is available. `report.ts` validates final and intermediate reports.
`limits.ts` resolves the environment limits without letting the model increase
them. The deadline depends on the provider and filesystem honoring cancellation;
it is not an operating-system execution limit.

`evidence.ts` records the first complete-file fingerprint from each successful
read and detects changed or unavailable files. `reconcile.ts` marks findings
with unread, changed or unverified references as pending, retains the original
conclusion separately and removes the recommendation. This checks provenance and
freshness, not whether a claim or excerpt is true. `revision.ts` and `git.ts`
use the fixed operations in `git-client.ts`; no user-supplied shell command is
run. `execute.ts` combines these parts and `output.ts` bounds the delivered report.
The report shows research usage separately because Pi cannot add usage to the
session total after the initial tool result.

See [research](../../docs/extensions/research.md) for usage, limits and the
recorded evaluation. The current tool has no web access and does not respect
ignore files. Its result must not be treated as authorization to act.
