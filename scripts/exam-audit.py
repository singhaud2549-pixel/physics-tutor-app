#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
exam-audit.py — เครื่องมือตรวจข้อสอบ/คลังโจทย์ เทียบเกณฑ์ A-Level

ใช้ยังไง (รันจากโฟลเดอร์ไหนก็ได้):
    python3 scripts/exam-audit.py mock MOCK-ALEVEL-1   ตรวจชุด mock 1 ชุด
    python3 scripts/exam-audit.py bank                 ตรวจคลังทั้งคลัง เทียบผัง
    python3 scripts/exam-audit.py traps                สรุปดัชนี trap ว่าพอสร้าง mock กี่ชุด

เกณฑ์ทั้งหมดมาจากการอ่าน PDF ข้อสอบจริง (A-Level 2568 ครบ 30 ข้อ · 2569 20 ข้อ)
รายละเอียด: Bank/reference-exam-style/รูปทรงข้อสอบ-A-Level.md

⚠️ สคริปต์นี้ "นับ" ได้อย่างเดียว — ตัดสินคุณภาพเนื้อหาไม่ได้
   การจัดหมวดด้วยคีย์เวิร์ดเคยผิด 27% มาแล้ว ผลที่ออกมาต้องมีคนอ่านยืนยันเสมอ
"""
import re, sys, glob, os, collections

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
PROBLEMS = os.path.join(APP, "problems")
BANK = os.path.expanduser("~/Desktop/singha august/Bank/reference-exam-style")

# ── เกณฑ์จากข้อสอบจริง ──────────────────────────────────────────────
BLUEPRINT = {  # ส่วนของผัง -> (ต่ำสุด, สูงสุด) ข้อต่อชุด 30 ข้อ
    1: ("กลศาสตร์", 8, 10), 2: ("คลื่นกล และแสง", 5, 7),
    3: ("ไฟฟ้า แม่เหล็ก EM", 6, 8), 4: ("อุณหพลศาสตร์/สมบัติสาร", 3, 5),
    5: ("ฟิสิกส์แผนใหม่", 3, 5),
}
SEC_OF = {
    "จลนศาสตร์": 1, "โพรเจกไทล์": 1, "การเคลื่อนที่แบบวงกลม": 1, "แรงและกฎนิวตัน": 1,
    "งาน-พลังงาน-กำลัง": 1, "โมเมนตัมและการชน": 1, "สมดุลและโมเมนต์": 1,
    "การเคลื่อนที่ฮาร์มอนิก (SHM)": 1, "ธรรมชาติและการวัด": 1,
    "คลื่นกล": 2, "เสียง": 2, "แสงและทัศนศาสตร์": 2,
    "ไฟฟ้าสถิต": 3, "ไฟฟ้ากระแส (วงจร)": 3, "ไฟฟ้ากระแสสลับ": 3, "แม่เหล็กไฟฟ้า": 3,
    "คลื่นแม่เหล็กไฟฟ้า": 3,
    "ของไหล": 4, "ของแข็ง": 4, "ความร้อนและแก๊ส": 4,
    "ฟิสิกส์อะตอม/ควอนตัม": 5, "ฟิสิกส์นิวเคลียร์": 5,
}
TARGET = {          # สัดส่วนเป้าของชุด mock (จากข้อสอบจริง)
    "mc": 25, "numeric": 5, "choices": 5,
    "fmt_A": (10, 14),   # ตัวเลขล้วน
    "fmt_B": (8, 13),    # สูตร/ตัวแปร  ← 2568=24% 2569=53% เป้ากลาง ~40%
    "fmt_C": (3, 6),     # ข้อความ/เปรียบเทียบ
    "sorted_pct": 90, "figure_pct": (30, 40), "span_max": 3.0, "g": "9.8",
}

# ── ยูทิลิตี้ ────────────────────────────────────────────────────────
def load(path):
    txt = open(path, encoding="utf-8").read()
    p = {"file": os.path.basename(path), "traps": [], "choices": [], "raw": txt}
    for line in txt.split("\n"):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        i = line.find(":")
        if i == -1:
            continue
        k, v = line[:i].strip(), line[i + 1:].strip()
        if k == "id": p["id"] = v
        elif k == "หัวข้อ": p["topic"] = v
        elif k == "หัวข้อย่อย": p["sub"] = v
        elif k == "ระดับความยาก": p["level"] = (re.search(r"\d", v) or [None])[0]
        elif k == "ชุดข้อสอบ": p["set"] = v
        elif k == "โจทย์": p["prob"] = v
        elif k == "รูป": p["fig"] = v
        elif k == "trap": p["traps"].append(v)
        elif re.fullmatch(r"ตัวเลือก\s*[A-Ea-e]", k): p["choices"].append(v)
    return p

def numval(s):
    # ตัด LaTeX ที่ห่อตัวเลขออกก่อน ($5.0$ · $5.0\,$ · \(5.0\)) ไม่งั้นเลขจะถูกอ่านเป็นข้อความ
    s = s.strip().strip("$").replace("\\(", "").replace("\\)", "").replace("\\,", "").replace("\\ ", "")
    s = s.replace(",", "").replace("−", "-").strip()
    m = re.match(r"^\s*(-?[\d.]+)\s*(?:[×x]\s*10\s*\^?\{?(-?\d+)\}?)?", s)
    if not m:
        return None
    try:
        v = float(m.group(1))
    except ValueError:
        return None
    return v * (10 ** int(m.group(2)) if m.group(2) else 1)

def strip_tex(o):
    """ตัด $...$ และคำสั่ง LaTeX ที่ไม่ใช่เนื้อหาออก เหลือแก่นไว้ตัดสินชนิด"""
    o = o.strip().strip("$")
    return o.replace("\\(", "").replace("\\)", "").replace("\\,", "").replace("\\!", "").strip()

def choice_kind(opts):
    """A=ตัวเลขล้วน  B=สูตร/ตัวแปร  C=ข้อความ/เปรียบเทียบ"""
    opts = [strip_tex(o) for o in opts]
    if len(opts) < 2:
        return "?"
    if sum(1 for o in opts if re.search(r"[<>≥≤]", o)) >= len(opts) - 1:
        return "C"
    pure = sum(1 for o in opts
               if numval(o) is not None and len(re.sub(r"[\d.,\s×x^{}\-−/]", "", o)) <= 8)
    if pure >= len(opts) - 1:
        return "A"
    if sum(1 for o in opts if re.search(r"[a-zA-Zα-ωΑ-Ω√]", o) and len(o) <= 40) >= len(opts) - 1:
        return "B"
    return "C"

def ok(cond): return "✅" if cond else "❌"

def bar(label, got, want, good):
    print(f"  {ok(good)} {label:34s} {got:<22s} เป้า {want}")

# ── คำสั่ง: ตรวจชุด mock ─────────────────────────────────────────────
def audit_mock(set_id):
    ps = [load(f) for f in sorted(glob.glob(os.path.join(PROBLEMS, "*.md")))]
    ps = [p for p in ps if p.get("set") == set_id]
    if not ps:
        print(f"❌ ไม่พบชุด '{set_id}'")
        sets = sorted({p["set"] for p in [load(f) for f in glob.glob(os.path.join(PROBLEMS, '*.md'))] if p.get("set")})
        print("   ชุดที่มี:", ", ".join(sets) or "(ไม่มีเลย)")
        return 1
    mc = [p for p in ps if p["choices"]]
    num = [p for p in ps if not p["choices"]]
    print(f"\n{'='*66}\n📋 ตรวจชุด {set_id} — {len(ps)} ข้อ\n{'='*66}")

    print("\n── โครงสร้าง")
    bar("ปรนัย", f"{len(mc)} ข้อ", "25", len(mc) == TARGET["mc"])
    bar("เติมตัวเลข", f"{len(num)} ข้อ", "5", len(num) == TARGET["numeric"])
    nch = collections.Counter(len(p["choices"]) for p in mc)
    bar("5 ตัวเลือกทุกข้อ", str(dict(nch)), "{5: 25}", set(nch) == {5})

    print("\n── รูปแบบคำตอบ (ของจริง: 2568 A56/B24/C20 · 2569 A40/B53/C7)")
    fk = collections.Counter(choice_kind(p["choices"]) for p in mc)
    for k, name in [("A", "ตัวเลขล้วน"), ("B", "สูตร/ตัวแปร"), ("C", "ข้อความ/เปรียบเทียบ")]:
        lo, hi = TARGET[f"fmt_{k}"]
        pct = round(fk[k] * 100 / len(mc)) if mc else 0
        bar(f"{k} {name}", f"{fk[k]} ข้อ ({pct}%)", f"{lo}-{hi} ข้อ", lo <= fk[k] <= hi)

    print("\n── ตัวเลือก")
    srt = span = tot = 0
    wide = []
    for p in mc:
        vs = [numval(o) for o in p["choices"]]
        if any(v is None for v in vs):
            continue
        tot += 1
        if vs == sorted(vs) or vs == sorted(vs, reverse=True):
            srt += 1
        pos = [v for v in vs if v > 0]
        if len(pos) >= 2:
            r = max(pos) / min(pos)
            if r <= TARGET["span_max"]:
                span += 1
            else:
                wide.append((p.get("id", p["file"]), round(r, 1)))
    if tot:
        bar("เรียงลำดับตัวเลือกตัวเลข", f"{srt}/{tot} = {round(srt*100/tot)}%",
            f"≥{TARGET['sorted_pct']}%", srt * 100 / tot >= TARGET["sorted_pct"])
        bar("ตัวเลือกห่างกัน ≤3 เท่า", f"{span}/{tot}", "ส่วนใหญ่", span >= tot * 0.6)
        if wide:
            print("     ↳ ข้อที่ตัวเลือกห่างเกินไป:",
                  ", ".join(f"{i}({r}x)" for i, r in wide[:6]))

    print("\n── ตัวเลขและค่าคงตัว")
    def body(p):  # ตัดบรรทัด trap: ออก — ใส่ g=10 เป็น "ตัวลวง" ได้ ไม่ใช่ความผิด
        return "\n".join(l for l in p["raw"].split("\n") if not l.startswith("trap:"))
    g10 = [p for p in ps if re.search(r"g\s*=\s*10\b|เท่ากับ 10 เมตร", body(p))]
    g98 = [p for p in ps if re.search(r"g\s*=\s*9\.8|9\.8 เมตร", body(p))]
    bar("ใช้ g = 9.8", f"9.8: {len(g98)} · 10: {len(g10)} ข้อ", "ไม่มี g=10 เลย", not g10)
    if g10:
        print("     ↳ ข้อที่ยังใช้ g=10:", ", ".join(p.get("id", p["file"]) for p in g10[:8]))

    print("\n── รูปและความยาว")
    nf = sum(1 for p in ps if p.get("fig"))
    lo, hi = TARGET["figure_pct"]
    pct = round(nf * 100 / len(ps))
    bar("มีรูป/ตาราง", f"{nf}/{len(ps)} = {pct}%", f"{lo}-{hi}%", lo <= pct <= hi)
    longs = [(p.get("id", p["file"]), len(p.get("prob", ""))) for p in ps if len(p.get("prob", "")) > 350]
    bar("โจทย์ยาว ≤350 ตัวอักษร", f"เกิน {len(longs)} ข้อ", "0 ข้อ", not longs)
    if longs:
        print("     ↳", ", ".join(f"{i}({n})" for i, n in longs[:6]))

    print("\n── สัดส่วนบทเทียบผัง")
    sc = collections.Counter(SEC_OF.get(p.get("topic"), 0) for p in ps)
    for k in sorted(BLUEPRINT):
        name, lo, hi = BLUEPRINT[k]
        bar(f"ส่วน {k} {name}", f"{sc[k]} ข้อ", f"{lo}-{hi}", lo <= sc[k] <= hi)
    if sc[0]:
        print(f"     ⚠️ มี {sc[0]} ข้อที่หัวข้อไม่อยู่ในผัง — เช็คชื่อบทให้ตรง categories.js")

    print("\n── ตรวจย้อนกลับได้ไหม")
    has_ids = sum(1 for p in ps if re.search(r"^trap-ids:", p["raw"], re.M))
    bar("มีฟิลด์ trap-ids:", f"{has_ids}/{len(ps)} ข้อ", "ครบทุกข้อ", has_ids == len(ps))
    if has_ids < len(ps):
        print("     ↳ ไม่มี trap-ids จะเช็คไม่ได้ว่าชุดนี้ซ้ำกับชุดอื่นแค่ไหน")
    print()
    return 0

# ── คำสั่ง: ตรวจคลัง ────────────────────────────────────────────────
def audit_bank():
    ps = [load(f) for f in sorted(glob.glob(os.path.join(PROBLEMS, "*.md")))]
    ps = [p for p in ps if p.get("id")]
    practice = [p for p in ps if not p.get("set")]
    print(f"\n{'='*66}\n📚 ตรวจคลังโจทย์ — {len(ps)} ข้อ (ฝึกแยกบท {len(practice)})\n{'='*66}")

    print("\n── ความครอบคลุมตามผัง (คลังแยกบทไม่มีเพดาน ดูแค่ว่าขาดตรงไหน)")
    sc = collections.Counter(SEC_OF.get(p.get("topic"), 0) for p in practice)
    tot = len(practice)
    for k in sorted(BLUEPRINT):
        name, lo, hi = BLUEPRINT[k]
        want = round((lo + hi) / 2 / 30 * 100)
        got = round(sc[k] * 100 / tot)
        flag = "⚠️ บาง" if got < want - 3 else "✅"
        print(f"  {flag} ส่วน {k} {name:24s} {sc[k]:3d} ข้อ ({got:2d}%)   ผังให้ ~{want}%")

    print("\n── บทที่ผังมีแต่คลังไม่มี")
    have = {p.get("topic") for p in ps}
    missing = [t for t in SEC_OF if t not in have]
    print("  " + (", ".join(missing) if missing else "✅ ครบทุกบท"))

    print("\n── ความหนาแน่นของหัวข้อย่อย (ตัวชี้ว่า adaptive ทำงานไหม)")
    subs = collections.Counter(f"{p.get('topic')} ▸ {p.get('sub','(ไม่ระบุ)')}" for p in practice)
    thin = sum(1 for v in subs.values() if v < 3)
    print(f"  หัวข้อย่อยทั้งหมด {len(subs)} · มี <3 ข้อ {thin} ({round(thin*100/len(subs))}%)")
    print(f"  {ok(thin/len(subs) < 0.5)} ถ้าเกิน 50% แปลว่ากฎ 'ถูก 3 ข้อติด' แทบไม่ทำงาน")

    print("\n── ปรนัยที่อธิบายช้อยส์ผิดไม่ครบ")
    bad = [p for p in ps if p["choices"] and len(p["traps"]) < len(p["choices"]) - 1]
    print(f"  {ok(not bad)} {len(bad)} จาก {sum(1 for p in ps if p['choices'])} ข้อ ยังอธิบายไม่ครบทุกตัวลวง")
    print()
    return 0

# ── คำสั่ง: สรุปดัชนี trap ──────────────────────────────────────────
def audit_traps():
    path = os.path.join(BANK, "ดัชนี-trap.md")
    if not os.path.exists(path):
        print("❌ ไม่พบ", path); return 1
    txt = open(path, encoding="utf-8").read()
    cur, by = None, collections.defaultdict(list)
    for line in txt.split("\n"):
        m = re.match(r"^## (.+?) \((\d+) trap\)", line)
        if m:
            cur = m.group(1); continue
        m = re.match(r"^\|\s*(\d+)\s*\|\s*([A-D])\s*\|", line)
        if m and cur:
            by[cur].append((int(m.group(1)), m.group(2)))
    print(f"\n{'='*66}\n🎯 ดัชนี trap — {sum(len(v) for v in by.values())} รายการ\n{'='*66}")
    secs = collections.defaultdict(int)
    for tp, v in by.items():
        secs[SEC_OF.get(tp, 0)] += len(v)
    print("\n── สร้างชุด mock ได้กี่ชุด (1 trap = 1 ข้อ · เป็นขั้นต่ำ)")
    worst = 99
    for k in sorted(BLUEPRINT):
        name, lo, hi = BLUEPRINT[k]
        q = (lo + hi) // 2
        n = secs[k]; sets = n // q; worst = min(worst, sets)
        print(f"  ส่วน {k} {name:24s} {n:3d} trap ÷ {q}/ชุด = {sets} ชุด" + ("  🔴 คอขวด" if sets <= 3 else ""))
    print(f"\n  → สร้างได้ปลอดภัย {worst} ชุด")
    print("\n── บทที่ trap บางสุด (ควรเติมก่อน)")
    for tp, v in sorted(((t, v) for t, v in by.items() if SEC_OF.get(t)), key=lambda x: len(x[1]))[:7]:
        print(f"  {len(v):3d}  {tp}")
    print()
    return 0

# ── main ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    cmds = {"mock": lambda a: audit_mock(a[0] if a else "MOCK-ALEVEL-1"),
            "bank": lambda a: audit_bank(), "traps": lambda a: audit_traps()}
    if len(sys.argv) < 2 or sys.argv[1] not in cmds:
        print(__doc__); sys.exit(1)
    sys.exit(cmds[sys.argv[1]](sys.argv[2:]))
