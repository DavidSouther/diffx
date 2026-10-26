---
'diffx-cli': patch
---

Large files and very long lines no longer hang the browser. Patch indexing, parsing, and full-file expansion now run in a background worker. Generated files (lockfiles, minified or generated sources) and very large or very-long-line diffs start hidden behind a "Show diff" button and are not parsed until expanded.

Syntax highlighting also runs in a worker pool, which was the dominant main-thread cost.
