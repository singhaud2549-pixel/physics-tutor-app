import re, sys, json
TAIL = re.compile(r"(?:\s+#(?:พลาด|trap)/\S+)+\s*$")
def apply(plan):
    for path, tags in plan.items():
        lines = open(path, encoding="utf-8").read().split("\n")
        idx = [i for i, l in enumerate(lines) if l.startswith("trap:")]
        assert len(idx) == len(tags), f"{path}: trap {len(idx)} บรรทัด แต่เตรียมป้าย {len(tags)}"
        for i, tag in zip(idx, tags):
            assert not TAIL.search(lines[i]), f"{path} บรรทัด {i+1} มีป้ายแล้ว"
            lines[i] = lines[i].rstrip() + " " + tag
        open(path, "w", encoding="utf-8").write("\n".join(lines))
        print(f"✓ {path.split('/')[-1]:<40} {len(tags)}")
if __name__ == "__main__":
    apply(json.load(sys.stdin))
