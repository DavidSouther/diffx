# Quick loop: large files and long lines

Research: main thread called parsePatchFiles, patch.split, and processFile; rendering a 20 KB single-line file hung the tab.
Design: index patch cheaply in a worker (src/ui/patchIndex.ts), classify hidden (generated, large, long-lines), parse lazily per file, hidden files parse only after "Show diff". Feature test: tests/unit/patchIndex.test.ts.
Plan: indexer + tests, worker + client, useParsedFiles/useFullDiffs, HiddenFileDiff, App wiring.
Not verified: manual browser run against a real large diff.
