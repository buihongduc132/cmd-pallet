---
kind: findings
date: 2026-09-05
title: cmd-pallet-chain — user mandate (verbatim) + implementation requirements
status: active
---

# Findings — cmd-pallet-chain (user message, retained verbatim per trust chain)

User message 2026-09-05, UNSTRIPPED:

> stop , another  already  done  that  chain; you are  to do  another  things ; and you are understand how to chain the cmd;
>
> go to ../cmd-pallet repository ; Before starting the works , add all of the below message into flow/findings/ of cmd-pallet , then do it .
>
> Then add the other implement of cmd-pallet-chain;
>
> Using python , it invoke each chain as cli ; then it using pi -p {{prompt}} to pass down the output ;
> That is entirely run on shell ;
>
> with this kind of requirement ```flow-*;
>
> a. now invoke each of these (in cmd-pallet) , these are the example workflow that we build in dy-flow; (NOTE that the step COULD use cmd-pallet cli to LOAD the instruction as well , DO NOT stored these instruction in OUR repository / workflow itself , it must be dynamic loaded by cmd-pallet);
>
> "Given with the user requirement / request that already explored and have the solutions"
> -> /to-pi-cmd-chained-prose /10-findings-persist -> /gotcha-coverage -> delegate sub agents to identify the DRY approach to implement that aligned with best practice , scalfold the directory and files -> /10-plans-declarative -> /mqa-to-tickets , assign to agy-f -> /mqa-drive-plan
>
> Each of these hop should PAIR with the SL runner ;
> a. init requirement must retains through all of chain;
> b. each should recive the message of previous hops (all previous hops);
>
> ```
>
> arg of the cmd-pallet-chain would be:
> - array of cmd chain , it will probes to see if all cmd chain available , if not then raise error immediately with clear context on what failing;
> - cli-agent ( currently just pi / agy , by default pi )
> 3 modes: pipe-all , pipe-one , pipe-none:
> -- pipe-all , whole all the PREVIOUS output of previous run and pipe to the current run as context ; (default )
> -- pipe-one , just one most recent ; pipe-none , none;
>
> Together with pipe , must always keep the user verbaltism initial request ;
>
> template
>
> ```
> this is user requirement : <user input>
> This is previous context : <...previous context , pipe>
>
> <cmd pallet result , automate expand on itself>
> ```

## Derived requirements (from verbatim, no creativity)

1. NEW implementation in ../cmd-pallet: `cmd-pallet-chain` — Python, shell-native, invokes each chain hop via `pi -p {{prompt}}` (or agy), passing outputs down.
2. Chain steps = cmd-pallet command names; step instructions LOAD DYNAMICALLY via cmd-pallet CLI (read/run expansion) — NEVER stored in our repo/workflow files.
3. Pre-flight probe: all chain cmds must resolve in cmd-pallet; missing → immediate error naming exactly what failed.
4. cli-agent arg: pi (default) | agy.
5. Pipe modes: pipe-all (default; ALL previous outputs as context) | pipe-one (most recent only) | pipe-none.
6. ALWAYS prepend user verbatim initial request through every hop (independent of pipe mode).
7. Prompt template (exact):
   ```
   this is user requirement : <user input>
   This is previous context : <...previous context , pipe>

   <cmd pallet result , automate expand on itself>
   ```
8. Reference chain (the dy-flow example, loadable not embedded): /to-pi-cmd-chained-prose → /10-findings-persist → /gotcha-coverage → (prose hop: DRY-approach delegation + scaffold) → /10-plans-declarative → /mqa-to-tickets (assign agy-f) → /mqa-drive-plan. "Each of these hop should PAIR with the SL runner" — SL pairing noted as separate concern (verifier-loop), recorded not designed here.
9. Note: chain items that are NOT slash-commands (e.g. "delegate sub agents…") are prose hops — the chain runner must accept them as literal prompt text hops alongside cmd-pallet hops.
