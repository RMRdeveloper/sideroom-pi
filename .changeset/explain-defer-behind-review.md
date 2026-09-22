---
"@rmrdeveloper/sideroom-pi": patch
---

Stop the walkthrough offer from racing the guidelines review. Both fire on
`agent_settled`, and Pi runs their deferred steers in extension load order,
which comes from the filesystem, so the questionnaire could appear before the
review. `extensions/explain/` now holds its steer back one settle and offers at
the next one, after the review has run. A settle that mutates below the
five-file threshold still arms the delay, so a review turn that crosses the
threshold is not lost.
