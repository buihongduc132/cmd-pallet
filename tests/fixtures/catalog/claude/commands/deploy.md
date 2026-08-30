---
description: "Deploy current branch to target environment"
argument-hint: "<env> [flags]"
---

echo "Deploying branch to $1 with options: $ARGUMENTS"
./scripts/deploy.sh "$1" "$@"
