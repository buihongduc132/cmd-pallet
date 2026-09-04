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
    CRITICAL (investigator-B P6): `cmd-pallet read --json` via PIPE silently truncates
    at ~16KB — nondeterministic flush race (bin/cmd-pallet.js process.exit() before
    pipe drain). Redirect stdout to a TEMP FILE instead (full content guaranteed;
    verified 26,269 bytes clean where piped runs got 8-16KB)."""
    import tempfile
    try:
        with tempfile.NamedTemporaryFile(mode="w+", suffix=".md", delete=False) as tf:
            tmp = tf.name
        r = subprocess.run(
            [pallet, "read", name],
            stdout=open(tmp, "w"),
            stderr=subprocess.DEVNULL,
            timeout=60,
        )
        text = open(tmp).read()
        os.unlink(tmp)
    except subprocess.TimeoutExpired:
        return None
    if r.returncode != 0 or not text.strip():
        return None
    if not text.startswith("#") and "Command not found" in text:
        return None
    desc = ""
    hint = ""
    for line in text.splitlines()[:4]:
        if line.startswith("description:"):
            desc = line.split(":", 1)[1].strip()
        if line.startswith("argument-hint:"):
            hint = line.split(":", 1)[1].strip()
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


def run_agent(agent: str, prompt: str, workdir: str, timeout: int,
               log_base: "str | None" = None) -> "tuple[int, str]":
    """Invoke cli-agent on the shell. Returns (rc, output).
    pi: plain `pi -p --mode json` — investigator-B P2/P4: json mode STREAMS (NDJSON,
    crash-safe partials); text mode flushes only at exit (kill = total loss).
    Final text = last assistant message_end content. No -ne (user mandate).
    agy: `--print-timeout 240m0s --output-format stream-json` (P3: streams;
    result.result.response = final) + `--disable-slash-commands` (investigator-A:
    hop instructions embed literal '# /cmd' lines — prevent slash expansion).
    P5: process group (start_new_session) + SIGTERM→SIGKILL escalation → no
    orphaned 240min agents when the chain runner dies.
    P7: prompt >100KB → stdin (pi merges piped stdin into prompt)."""
    import signal
    if agent == "pi":
        argv = ["pi", "-p", "--mode", "json"]
        stdin_data = None
        if len(prompt) > 100_000:
            stdin_data = prompt  # off-argv (E2BIG guard); pi merges stdin into prompt
        else:
            argv.append(prompt)
    elif agent == "agy":
        argv = ["agy", "--print-timeout", "240m0s", "--output-format", "stream-json",
                "-p", prompt]
        stdin_data = None
    else:
        die(2, f"unsupported cli-agent '{agent}' (currently just pi / agy)")

    ndjson_path = f"{log_base}.ndjson" if log_base else None
    proc = subprocess.Popen(
        argv, cwd=workdir,
        stdin=subprocess.PIPE if stdin_data is not None else subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        start_new_session=True,  # P5: own process group
    )

    import threading
    lines: "list[str]" = []
    def tee():
        fh = open(ndjson_path, "a") if ndjson_path else None
        try:
            for line in proc.stdout:
                lines.append(line)
                if fh:
                    fh.write(line)
                    fh.flush()
        finally:
            if fh:
                fh.close()
    t = threading.Thread(target=tee, daemon=True)
    t.start()

    if stdin_data is not None:
        try:
            proc.stdin.write(stdin_data)
            proc.stdin.close()
        except BrokenPipeError:
            pass

    try:
        rc = proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        os.killpg(proc.pid, signal.SIGTERM)
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)
            proc.wait()
        return 124, extract_final("".join(lines), agent)
    t.join(timeout=5)
    return rc, extract_final("".join(lines), agent)


def extract_final(raw: str, agent: str) -> str:
    """Last authoritative final text from NDJSON stream (investigator-B P2/P3)."""
    if not raw.strip():
        return ""
    last_text = ""
    try:
        for line in raw.splitlines():
            line = line.strip()
            if not line:
                continue
            import json as _json
            try:
                ev = _json.loads(line)
            except _json.JSONDecodeError:
                continue
            if agent == "pi":
                if ev.get("type") == "message_end":
                    msg = ev.get("message", {})
                    if msg.get("role") == "assistant":
                        parts = "".join(
                            c.get("text", "") for c in (msg.get("content") or [])
                            if isinstance(c, dict)
                        )
                        if parts.strip():
                            last_text = parts
            elif agent == "agy":
                if ev.get("type") == "result":
                    resp = (ev.get("result") or {}).get("response") or ""
                    if resp.strip():
                        last_text = resp
    except Exception:
        pass
    return last_text or raw[-8000:]


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
    ap.add_argument("--log-dir", default=None,
                    help="store full run logs here (default: .cmd-pallet-chain-logs/ under workdir; every hop gets prompt+output+meta files)")
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

    # ── Log store: one run dir, per-hop files (prompt / output / meta) ──────────
    log_root = args.log_dir or os.path.join(args.workdir, ".cmd-pallet-chain-logs")
    run_stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    run_log_dir = os.path.join(log_root, run_stamp)
    os.makedirs(run_log_dir, exist_ok=True)

    # run-level summary log (P8: running state written at start, below)
    with open(os.path.join(run_log_dir, "run.meta.json"), "w") as f:
        json.dump({**report, "status": "running"}, f, indent=2)

    def write_hop_log(idx: int, name: str, prompt: str, rc: "int|None", output: str, extra: dict):
        safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in name)[:60] or "hop"
        base = os.path.join(run_log_dir, f"{idx+1:02d}-{safe}")
        with open(base + ".prompt.md", "w") as f:
            f.write(prompt)
        if output is not None:
            with open(base + ".output.md", "w") as f:
                f.write(output)
        meta = {"hop": idx + 1, "name": name, "exitCode": rc, "promptChars": len(prompt),
                "outputChars": len(output or ""), "loggedAt": datetime.now(timezone.utc).isoformat(), **extra}
        with open(base + ".meta.json", "w") as f:
            json.dump(meta, f, indent=2)
        return meta

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
            meta = write_hop_log(idx, name, prompt, None, None, {"type": "cmd" if doc else "prose", "dryRun": True})
            report["hops"].append(meta)
            print(f"[dry-run] hop {idx+1}: {name} — prompt {len(prompt)} chars", file=sys.stderr)
            continue

        hop_t0 = time.time()
        safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in name)[:60] or "hop"
        log_base = os.path.join(run_log_dir, f"{idx+1:02d}-{safe}")
        # P8: heartbeat meta BEFORE spawn — killed chain leaves inspectable state
        with open(log_base + ".meta.json", "w") as f:
            json.dump({"hop": idx + 1, "name": name, "status": "running",
                       "pid": os.getpid(), "agent": args.agent,
                       "startedAt": datetime.now(timezone.utc).isoformat()}, f, indent=2)
        rc, out = run_agent(args.agent, prompt, args.workdir, args.timeout, log_base=log_base)
        duration = round(time.time() - hop_t0, 2)
        outputs.append(out if out.strip() else f"<hop {idx+1} produced no output>")
        meta = write_hop_log(idx, name, prompt, rc, out, {
            "type": "cmd" if doc else "prose", "agent": args.agent, "durationSec": duration,
            "status": "done" if rc == 0 else "failed"})
        report["hops"].append({
            "hop": idx + 1, "name": name,
            "type": "cmd" if doc else "prose",
            "exitCode": rc, "outputChars": len(out), "durationSec": duration,
        })
        print(f"[hop {idx+1}/{len(chain)}] {name}: rc={rc} out={len(out)}c {duration}s → {meta['promptChars'] and ''}{run_log_dir}", file=sys.stderr)
        if rc != 0:
            report["status"] = "failed"
            report["failedHop"] = idx + 1
            if args.json:
                print(json.dumps(report, indent=2))
            die(4, f"hop {idx+1} ('{name}') agent exited {rc} — chain aborted (previous outputs retained in report)")

    report["status"] = "completed"
    report["finishedAt"] = datetime.now(timezone.utc).isoformat()
    report["logDir"] = run_log_dir
    # run-level summary log (final overwrite of the running-state file)
    with open(os.path.join(run_log_dir, "run.meta.json"), "w") as f:
        json.dump(report, f, indent=2)
    with open(os.path.join(run_log_dir, "requirement.verbatim.md"), "w") as f:
        f.write(args.requirement)
    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print(f"\n=== FINAL HOP OUTPUT ===\n{(outputs[-1] if outputs else '')}\n\n[logs] {run_log_dir}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
