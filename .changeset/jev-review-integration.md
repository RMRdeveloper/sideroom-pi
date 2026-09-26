---
"@rmrdeveloper/sideroom-pi": minor
---

Tighten the Jev review and hand its findings to the guidelines review.

- Jev findings no longer land on each tool result. `extensions/jev/` emits them
  on `sideroom:review-note`, and the guidelines review carries them in its
  end-of-run steer, with one follow-up per turn for notes that arrive after the
  review fired.
- No request is made for files outside a supported language (READMEs, JSON,
  YAML, lockfiles), for edits that add no lines, or for files outside the
  working directory.
- The request carries the path relative to the working directory, resolved the
  way Pi's file tools resolve it, so an absolute path the model wrote never
  leaves the machine and one file is deduplicated however it was spelled.
- The 60k budget now measures the whole serialized state, which covers a new
  file travelling as both body and added lines.
- Escape cuts a request in flight through the run's abort signal, and a
  cancelled request no longer counts toward switching Jev off.
- A rate limit (`429`) pauses Jev until the next idle prompt and shows
  `jev: rate limited` instead of counting as an outage.
- A message typed during a run no longer clears the per-turn dedup, and
  recorded calls another extension blocked are dropped on `turn_end` and
  `session_start`.
