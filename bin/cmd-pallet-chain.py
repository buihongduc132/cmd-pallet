#!/usr/bin/env python3
"""
cmd-pallet-chain — shell-native chain runner over cmd-pallet commands.

Mandate (flow/findings/2026-09-05_cmd-pallet-chain-mandate.md — user verbatim):
  - Python, entirely run on shell.
  - Each hop invokes the cli-agent (pi default | agy) via `pi -p <prompt>`.
  - Step instructions LOADED DYNAMICALLY via cmd-pallet CLI (read/run) — never
    stored in this repo.
  - Pre-flight probe: every chain cmd must resolve in cmd-pallet, else
    immediate error naming exactly what failed.
  - Pipe modes: pipe-all (default) | pipe-one | pipe-none.
  - User verbatim initial request ALWAYS carried through every hop.
  - Prompt template (exact):
      this is user requirement : <user input>
      This is previous context : <...previous context , pipe>

      <cmd pallet result , automate expand on itself>

Usage:
  cmd-pallet-chain --chain "a,b,...,z" --requirement "<user input>" \
      [--agent pi|agy] [--pipe all|one|none] [--workdir DIR] [--dry-run] [--json]
  Chain items: comma-separated. Items starting with '/' or matching a cmd-pallet
  command = cmd hop (dynamically loaded); any other item = literal prose hop
  (passed as-is in the prompt, e.g. "delegate sub agents to ...").

Exit codes: 0 ok; 2 usage; 3 probe failure (names missing cmds); 4 agent hop failure.
"""

import argparse
import json
import os
import shlex
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone

DEFAULT_TIMEOUT = int(os.environ.get("CMD_PALLET_CHAIN_TIMEOUT", "3600"))  # 1h per hop


def die(code: int, msg: str) -> "None":
    print(f"cmd-pallet-chain: {msg}", file=sys.stderr)
    sys.exit(code)


def cmd_pallet() -> str:
    """Resolve the cmd-pallet CLI binary (repo bin/ first, then PATH)."""
    here = os.path.dirname(os.path.abspath(__file__))
    local = os.path.join(here, "..", "bin", "cmd-pallet.js")
    if os.path.exists(local):
        return local
    on_path = shutil.which("cmd-pallet")
    if on_path:
        return on_path
    die(3, "cmd-pallet CLI not found (repo bin/cmd-pallet.js nor PATH)")


def read_command(pallet: str, name: str) -> "dict | None":
    """cmd-pallet read <name> → dict; None if not found.
    NOTE: `read --json` truncates at exactly 16384 bytes (upstream buffer cap,
    live-verified 2026-09-05) — JSON parse fails on large cmds. Fallback: plain
    `read` (untruncated) + parse the frontmatter header from text."""
    try:
        r = subprocess.run(
            [pallet, "read", name],
            capture_output=True, text=True, timeout=60,
        )
    except subprocess.TimeoutExpired:
        return None
    if r.returncode != 0 or not r.stdout.strip():
        return None
    text = r.stdout
    # First line is "# <name>" for found cmds; errors print "Command not found".
    if not text.startswith("#") and "Command not found" in text:
        return None
    desc = ""
    hint = ""
    for line in text.splitlines()[:4]:
        if line.startswith("description:"):
            desc = line.split(":", 1)[1].strip()
        if line.startswith("argument-hint:"):
            hint = line.split(":", 1)[1].strip()
    # Body = everything after the frontmatter-ish header (leading '# name' + hints + $ARGUMENTS marker stays — it IS the cmd content).
    return {"name": name, "description": desc, "argumentHint": hint, "content": text}


def probe_chain(pallet: str, chain: "list[str]") -> "tuple[list[dict|None], list[str]]":
    """Probe every cmd hop. Returns (loaded, missing). Prose hops → None entry."""
    loaded, missing = [], []
    for item in chain:
        name = item.strip().lstrip("/")
        if name.startswith("("):  # explicit prose marker "(text)"
            loaded.append(None)
            continue
        doc = read_command(pallet, name)
        if doc is None:
            missing.append(item)
            loaded.append(None)
        else:
            loaded.append(doc)
    return loaded, missing


def build_prompt(requirement: str, context: str, instruction: str) -> str:
    """Exact mandate template. Instruction = dynamically loaded cmd content or prose hop."""
    return (
        f"this is user requirement : {requirement}\n"
        f"This is previous context : {context}\n\n"
        f"{instruction}"
    )


def run_agent(agent: str, prompt: str, workdir: str, timeout: int) -> "tuple[int, str]":
    """Invoke cli-agent on the shell: pi -p <prompt> (or agy). Returns (rc, output).
    pi uses -ne (no extensions): /tmp cwd has no pi project context and a broken
    global extension (open-goal-client) hard-fails loads outside projects —
    verified live: plain pi -p in /tmp → extension load error; -ne → clean run."""
    if agent == "pi":
        argv = ["pi", "-ne", "-p", prompt]
    elif agent == "agy":
        argv = ["agy", "-p", prompt]
    else:
        die(2, f"unsupported cli-agent '{agent}' (currently just pi / agy)")
    try:
        r = subprocess.run(
            argv, cwd=workdir, capture_output=True, text=True, timeout=timeout
        )
    except subprocess.TimeoutExpired:
        return 124, f"<agent timeout after {timeout}s>"
    except FileNotFoundError:
        return 127, f"<agent binary '{agent}' not found on PATH>"
    return r.returncode, (r.stdout or "") + (("\n[stderr]\n" + r.stderr) if r.stderr.strip() else "")


def pipe_context(outputs: "list[str]", mode: str) -> str:
    if mode == "none":
        return "<none>"
    if mode == "one":
        return outputs[-1] if outputs else "<none — first hop>"
    return "\n---\n".join(
        f"[hop {i+1} output]\n{o}" for i, o in enumerate(outputs)
    ) if outputs else "<none — first hop>"


def main() -> int:
    ap = argparse.ArgumentParser(prog="cmd-pallet-chain")
    ap.add_argument("--chain", required=True,
                    help="comma-separated chain: cmd-pallet cmd names and/or (prose hops)")
    ap.add_argument("--requirement", required=True,
                    help="user verbatim initial request (retained through ALL hops)")
    ap.add_argument("--agent", default="pi", choices=["pi", "agy"])
    ap.add_argument("--pipe", default="all", choices=["all", "one", "none"],
                    dest="pipe_mode")
    ap.add_argument("--workdir", default=os.getcwd())
    ap.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT)
    ap.add_argument("--dry-run", action="store_true",
                    help="probe + print prompts, do not invoke agents")
    ap.add_argument("--json", action="store_true", help="machine-readable run report")
    args = ap.parse_args()

    chain_raw = args.chain
    chain: "list[str]" = []
    # split on commas NOT inside (prose hop) parens
    depth = 0
    cur = ""
    for ch in chain_raw:
        if ch == "(" :
            depth += 1
        elif ch == ")":
            depth = max(0, depth - 1)
        if ch == "," and depth == 0:
            chain.append(cur.strip())
            cur = ""
        else:
            cur += ch
    if cur.strip():
        chain.append(cur.strip())
    chain = [c for c in chain if c]
    if not chain:
        die(2, "empty chain")
    if not args.requirement.strip():
        die(2, "empty requirement (user verbatim initial request is mandatory)")

    pallet = cmd_pallet()
    loaded, missing = probe_chain(pallet, chain)
    if missing:
        die(3, "chain probe FAILED — not available in cmd-pallet: "
              + ", ".join(f"'{m}'" for m in missing)
              + " (fix names or sync catalog; nothing was executed)")

    report = {
        "chain": chain,
        "agent": args.agent,
        "pipeMode": args.pipe_mode,
        "requirement": args.requirement,
        "startedAt": datetime.now(timezone.utc).isoformat(),
        "hops": [],
    }

    outputs: "list[str]" = []
    for idx, item in enumerate(chain):
        name = item.lstrip("/")
        doc = loaded[idx]
        if doc is not None:
            instruction = (
                f"# /{name} (loaded dynamically from cmd-pallet)\n"
                f"{doc.get('content') or ''}"
            )
        else:
            instruction = f"# (prose hop)\n{item}"
        prompt = build_prompt(args.requirement, pipe_context(outputs, args.pipe_mode), instruction)

        if args.dry_run:
            report["hops"].append({"hop": idx + 1, "name": name, "type": "cmd" if doc else "prose", "promptChars": len(prompt)})
            print(f"[dry-run] hop {idx+1}: {name} — prompt {len(prompt)} chars", file=sys.stderr)
            continue

        rc, out = run_agent(args.agent, prompt, args.workdir, args.timeout)
        outputs.append(out if out.strip() else f"<hop {idx+1} produced no output>")
        report["hops"].append({
            "hop": idx + 1, "name": name,
            "type": "cmd" if doc else "prose",
            "exitCode": rc, "outputChars": len(out),
        })
        print(f"[hop {idx+1}/{len(chain)}] {name}: rc={rc} out={len(out)}c", file=sys.stderr)
        if rc != 0:
            report["status"] = "failed"
            report["failedHop"] = idx + 1
            if args.json:
                print(json.dumps(report, indent=2))
            die(4, f"hop {idx+1} ('{name}') agent exited {rc} — chain aborted (previous outputs retained in report)")

    report["status"] = "completed"
    report["finishedAt"] = datetime.now(timezone.utc).isoformat()
    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print("\n=== FINAL HOP OUTPUT ===\n" + (outputs[-1] if outputs else ""), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
