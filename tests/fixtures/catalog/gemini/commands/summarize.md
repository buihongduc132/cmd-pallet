---
description: "Summarize recent git commits"
argument-hint: "[count]"
---

git log -n ${@:1:1} --oneline
