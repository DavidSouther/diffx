---
'diffx-cli': patch
---

Harden the diff scroll container against scroll-position jumps during virtualized rendering: keep native scroll anchoring enabled explicitly and raise the virtualizer overscan buffer so rows mount farther from the viewport edge
