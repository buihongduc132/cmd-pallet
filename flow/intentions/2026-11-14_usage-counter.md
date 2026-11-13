---
title: Usage counter per host / action / date-hour (verbatim)
date: 2026-11-14
tags: [intention, cmd-pallet/usage, git-sync]
---

# Intention — cmd-pallet usage counter

Source: Claude Code session, 2026-11-14 (user goal). Creation/invocation wrapper ("Invoke cmd-pallet spb-plan then create it as GC for me then start implement all of these using sbp-sub agents mode;") excluded — it is how the work is run, not what it builds.

## User verbatim
- [U1] "make the json storage (inside the cmd-pallet repository itself , this will tracked and commit and push all changes as well)."
- [U2] "per invokation of any action of cmd-pallet , make the counter of these usage"
- [U3] "{ <hostname>: { <action>: { date-hour: count } } ( keep increase it and group per date-hour per action ;"
- [U4] "ALSO for invoke that read 1 cmd , must having storage like that put what cmd being read."
- [U5] "This is for us to keep track and also merged usage between multiple machine utilizing git."
- [U6] "And also later on having stats on which cmd being use most , and which machine , time."

## Elaboration (decided, cited)
- [U1][U5] One file per host: `usage/<hostname>.json`. Two machines never edit the same file → git merge never conflicts. Union of files = merged view.
- [U3] File shape stays `{ "<hostname>": { "<action>": { "<date-hour>": count } } }`. date-hour = UTC `YYYY-MM-DDTHH` (same clock on every machine).
- [U4] Per-cmd file `usage/<hostname>.cmds.json`, same pattern: `{ "<hostname>": { "<cmd>": { "<action>": { "<date-hour>": count } } } }`. Applies to verbs that take one cmd (`read`/`get`/`run`).
- [U2] "action" = the verb's own name from the verb table (`list`, `search`, `read`, `get`, `run`, `ping`, `sync`, `help`). `--help`/no verb → `help`, `--version` → `version`, unknown verb → `unknown`. Every invocation counts once.
- [U1] commit of `usage/` paths only, in the background, debounced; never slows or fails the CLI. Only on branch `main` tracking `origin/main`. Push skipped while someone else's non-usage commits are unpushed. To push it must merge `origin/main` into the checkout (like `git pull`) — accepted, called out in README.
- [U6] stats verb: first deferred ("later on"); built in plan r3 Task 5 (`cmd-pallet stats`, cpal-qp8.6) because the user asked to implement "all of these".
