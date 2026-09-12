---
"@rmrdeveloper/sideroom-pi": patch
---

Sharpen npm discovery metadata. The package description now states the outcome
in search terms people actually type ("asks clarifying questions", "live todo
board", "coding guidelines", "done while your checks are red") instead of
internal vocabulary, and the keyword list gains the intent terms the Pi gallery
and npm search index. The README hero leads with the one-line promise and the
`pi install` command so the gallery-rendered README converts before the reader
scrolls.

Add the gallery preview assets: `media/preview.png` (16:10 still of the real
questionnaire and board widgets) declared as `pi.image`, and `media/preview.mp4`
(the same widgets driven through a full question batch) declared as `pi.video`.
The gallery card thumbnail only accepts an image, so both fields are needed.
