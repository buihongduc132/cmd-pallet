"""cmd-pallet-chain — unit tests (probe, chain parsing, pipe modes, template)."""
import importlib.util, json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
BIN = os.path.join(HERE, "..", "bin", "cmd-pallet-chain.py")

spec = importlib.util.spec_from_file_location("cpc", BIN)
cpc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cpc)

def run(*argv):
    return subprocess.run([sys.executable, BIN, *argv], capture_output=True, text=True, timeout=120)

def test_probe_ok():
    r = run("--chain", "10-findings-persist", "--requirement", "t", "--dry-run", "--json")
    assert r.returncode == 0, r.stderr
    d = json.loads(r.stdout)
    assert d["status"] == "completed" and d["hops"][0]["type"] == "cmd"

def test_probe_missing_names_culprit():
    r = run("--chain", "real-nope-1,10-findings-persist,real-nope-2", "--requirement", "t", "--dry-run")
    assert r.returncode == 3
    assert "real-nope-1" in r.stderr and "real-nope-2" in r.stderr

def test_prose_hop_parens_commas():
    chain = "10-findings-persist,(delegate sub agents, scaffold the files),gotcha-coverage"
    r = run("--chain", chain, "--requirement", "t", "--dry-run", "--json")
    assert r.returncode == 0, r.stderr
    d = json.loads(r.stdout)
    assert len(d["hops"]) == 3
    assert d["hops"][1]["type"] == "prose" and "delegate sub agents" in d["hops"][1]["name"]

def test_pipe_modes():
    base = ("--chain", "10-findings-persist,gotcha-coverage", "--requirement", "t", "--dry-run", "--json")
    for mode in ("all", "one", "none"):
        r = run(*base, "--pipe", mode)
        assert r.returncode == 0
        assert json.loads(r.stdout)["pipeMode"] == mode

def test_template_exact():
    p = cpc.build_prompt("USER REQ", "PREV CTX", "INSTRUCTION")
    assert p.startswith("this is user requirement : USER REQ\nThis is previous context :\n<<<PREV_CONTEXT\nPREV CTX\nPREV_CONTEXT>>>")
    assert p.endswith("<<<INSTRUCTION\nINSTRUCTION\nINSTRUCTION>>>")

def test_requirement_always_present_every_hop():
    # dry-run hop2 prompt must contain requirement: build via module fn + outputs
    ctx = cpc.pipe_context(["out1"], "all")
    assert "out1" in ctx
    p = cpc.build_prompt("USER REQ", ctx, "INSTR")
    assert "USER REQ" in p  # verbatim requirement retained alongside piped context

def test_agent_whitelist():
    r = run("--chain", "10-findings-persist", "--requirement", "t", "--agent", "grok", "--dry-run")
    assert r.returncode == 2

def test_empty_requirement_rejected():
    r = run("--chain", "10-findings-persist", "--requirement", "  ", "--dry-run")
    assert r.returncode == 2
