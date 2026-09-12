# Security policy

Sideroom Pi is a Pi package: its extensions run inside the Pi process with the
same access Pi already has, and they read and write the repository you are
working in. That is the trust boundary worth reporting against.

## Supported versions

Only the latest release published on npm receives security fixes. Fixes ship as
a new release through the [Changesets workflow](./CONTRIBUTING.md#changesets);
older versions are not patched.

| Version | Supported |
| --- | --- |
| Latest release on npm | ✅ |
| Any older release | ❌ |

## Reporting a vulnerability

Report privately through GitHub:
**[open a security advisory](https://github.com/RMRdeveloper/sideroom-pi/security/advisories/new)**.

Do not open a public issue, and do not disclose the problem in a pull request
before it is fixed.

Include what you have:

- the Sideroom Pi, Pi, and Node versions, plus your operating system;
- the affected extension or skill and the mode you were in;
- the smallest reproduction you can build, or the reasoning that shows the flaw;
- the impact you believe it has, and any suggested fix.

## What is in scope

- Unintended writes outside what Pi was asked to change, including Sideroom
  state landing in a target repository.
- A mutation that reaches the filesystem after the `guidelines` or
  `sideroom_rules` gate was supposed to block it.
- Code execution or data exfiltration triggered by the content the tools read,
  rather than by the user's own instructions.
- A path traversal, injection, or unsafe deserialization in extension code or in
  the preview tooling.
- A published artifact that differs from the tagged source, or a compromised
  release path.

## What is out of scope

- The documented fact that Pi extensions execute arbitrary code with full system
  access. Review the source before installing, as Pi itself advises.
- Behavior of your own project's check commands, hooks, or linters.
- Vulnerabilities in Pi, in `pi-tui`, or in `typebox`. Report those upstream.
- The `sideroom_rules` and `sideroom_done` checks being heuristics that a
  determined agent could route around. They reduce accidents; they are not a
  sandbox.

## What to expect

This is a single-maintainer project, so support is best effort and there is no
response-time SLA. Reports are acknowledged, triaged, and fixed in a new release
where possible; you are credited in the advisory unless you ask otherwise.
