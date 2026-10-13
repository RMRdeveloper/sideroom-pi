---
"@rmrdeveloper/sideroom-pi": patch
---

Improve browser element source detection with dedicated JSX/TSX, Vue, Svelte and
Astro parsers alongside HTML parsing. Exclude script strings and comments,
recognize literal string expressions without executing source, verify original
ranges including Astro byte offsets, and preserve partial search results when a
component cannot be parsed.

Rank candidates with bounded, deduplicated class evidence, reject conflicting
static ids, and explain ordered ancestor evidence. Match rendered text without
invented whitespace or erased expressions, decode HTML entities, exclude private
text, and distinguish truncated text prefixes from full static text.
