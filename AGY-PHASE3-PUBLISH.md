# TASK: publish + harden — verify, create gh repo, push, final polish.

You are in /home/bhd/Documents/Projects/bhd/cmd-pallet (Phase 2 left tests green, committed).

1. Verify locally: npm install && npm test && npm run typecheck && npm run smoke-test (add smoke-test script if missing: drives fixture catalog end-to-end, structural invariants only).
2. npm link → cd /tmp && cmd-pallet ping && cmd-pallet list | head -3 && cmd-pallet help | head -5 → unlink after.
3. gh repo create buihongduc132/cmd-pallet --public --source . --push
4. README final: badges-free, install via github URL, usage per verb, distinction table, trust chain.
5. COMMIT any polish + PUSH origin main.
6. Output: repo URL, test counts, link-probe proof lines.

HARD: no force-push; single main branch; MIT LICENSE present; .gitignore excludes node_modules.
