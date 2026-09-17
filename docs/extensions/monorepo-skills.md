# `monorepo-skills`

Makes skills in monorepo child folders available when Pi starts above them.
Pi normally discovers `.pi/skills` only from its working directory and
`.agents/skills` from that directory and its ancestors; it does not walk down.

The extension has no tool, command, UI, or persisted state. It contributes
paths through `resources_discover` in TUI, print, and RPC modes.

## Discovery contract

The scan starts at Pi's working directory and visits at most three child-folder
levels. The working directory itself is excluded because Pi already discovers
its project skills.

For each child folder:

- an existing `.pi/skills` directory is contributed as one skill path;
- `.agents/skills` is enumerated with Pi's own location rules: root Markdown
  files are ignored, Markdown files inside grouping folders are included, and
  a folder containing `SKILL.md` contributes that file and stops recursion
  below it;
- `.pi/skills` precedes `.agents/skills` when both exist;
- child folders sort lexically, so duplicate-name winners are deterministic.

The traversal reads `.gitignore`, `.ignore`, and `.fdignore` files from the
working directory downward. It skips `node_modules`, hidden traversal folders,
and directory symlinks. Ignore files above the working directory do not apply.

## Trust and disable flags

No paths are contributed until `ctx.isProjectTrusted()` is true. A project that
Pi has not trusted cannot add monorepo skills to the prompt.

The extension also returns no paths when `process.argv` contains
`--no-skills` or `-ns` before the `--` option terminator. Pi applies its own
`noSkills` filter before extension paths are added, so the extension must honor
those CLI flags itself. SDK hosts that disable skills without reflecting the
choice in `process.argv` are outside this check.

`--no-extensions` prevents the extension from loading at all.

## Prompt and collisions

Pi adds each discovered skill's name, description, and location to the system
prompt. It reads the full skill body only when the model selects that skill.
When at least one monorepo skill exists, Sideroom appends one static note:
prefer the skill whose location is inside the folder being edited when several
skills cover the same work. The note is idempotent and stays byte-identical
within the session.

Skill names share Pi's flat namespace. Pi keeps the first skill with a name and
lists every skipped path under `[Skill conflicts]` at startup and after
`/reload`. Normal project and user skills load before extension paths, so a
monorepo skill cannot override them. Use `pi config -l` to disable the earlier
skill when the child-folder version must win.

The extension does not run a second collision detector. Duplicating Pi's user,
project, package, and CLI precedence would drift as Pi changes.

## Cost

Every discovered skill permanently adds its name, description, and location to
the session's system prompt. Six current Sideroom skills format to 3,699
characters in Pi 0.85.1, about 150 tokens per skill by a
four-characters-per-token estimate. The three-level limit bounds filesystem
work, not prompt size.
