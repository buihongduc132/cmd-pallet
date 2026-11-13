CONTINUE

(a) **FAIL** — G13, N1, N2, TL-3, r10-OE1, and r10-OE2 are resolved in the plan. N3 and N12 remain unresolved. N4’s paused acquirer is specified to retry.

(a2) **PASS** — The tech-lead table has zero open block or should findings; TL-3’s nonce-specific unlink protocol and race test address its concern.

(b) **PASS** — The planned components map to [U1]–[U6] or valid [TL-n] findings. Same-host auto-merge remains deferred under the arbiter decision; the new gotchas do not justify adding it.

1. **N3:** The plan does not make stale-temp cleanup safe against a concurrent rename. Cleanup could remove the owner file after the temp directory becomes the live lock, leaving an ownerless lock. Specify race-safe cleanup and retain the interleaving test.
2. **N12:** Task 4 requires an `ok:` log line to pass even when the exact key and count are already verified on the remote. Make remote data the acceptance proof and the log diagnostic; test a crash after push but before log append.

VERDICT=CONTINUE OPEN=2