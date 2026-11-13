---
title: spb gate loop capped when it adds unrequested scope after the feature is live
date: 2026-11-14
tags: [intention, spb, cmd-pallet/usage]
---

# Decision — cap the spb gate loop (usage-counter)
- Context: spb-plan Workflow `wf_7c6ad914-c21` on [[2026-11-14_usage-counter]] ran 8 gate rounds without @V EXIT; rounds kept opening new edge cases (G1–G12) and grew the plan with code the user never asked for.
- Decision (@A arbiter, option B): cap scope. Open findings → beads (cpal-qp8.7–.9); unrequested additions deferred (cpal-qp8.10); single final @V on live main closes the job.
- Rule going forward: when the feature already meets every [U#] and is live, a gate loop that adds unrequested scope is capped — findings become beads, not plan scope.
