---
description: "Resolve pull request review comments"
argument-hint: "<pr-number> [filter]"
---

gh pr view $1 --comments
Resolve comments matching $ARGUMENTS using git diff.
