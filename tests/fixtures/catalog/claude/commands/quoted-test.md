---
description: "Test argument quoting and special tokens"
argument-hint: "<quoted-msg> [author]"
---

Message: $ARGUMENTS
Arg1: $1
AllArgs: $@
Slice: ${@:2:2}
