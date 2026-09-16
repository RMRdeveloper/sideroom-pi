---
"@rmrdeveloper/sideroom-pi": patch
---

Correct the file-path handling in two mutation guards and the distinct-file
count behind the walkthrough offer.

A full `write` is compared against the file Pi actually resolves, so rewriting a
path as `@icon.ts`, `~/icon.ts`, a file URL, or through a symlink no longer
re-flags content that was already in the file. The decorative-symbol detector no
longer treats the copyright, trademark, and registration signs as emoji, while a
real emoji still blocks the mutation.

`explain` counts one physical file once, so reaching the same file through
different spellings cannot inflate the five-file threshold and offer a
walkthrough for work that does not need one.
