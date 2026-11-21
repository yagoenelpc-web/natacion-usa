"""Arreglos sobre web/data/unis.json (nombres cortos, estados, entrenadores)."""
import json, re, sys, urllib.parse

STATES = {"Alabama":"AL","Alaska":"AK","Arizona":"AZ","Arkansas":"AR","California":"CA","Colorado":"CO","Connecticut":"CT","Delaware":"DE","Florida":"FL","Georgia":"GA","Hawaii":"HI","Idaho":"ID","Illinois":"IL","Indiana":"IN","Iowa":"IA","Kansas":"KS","Kentucky":"KY","Louisiana":"LA","Maine":"ME","Maryland":"MD","Massachusetts":"MA","Michigan":"MI","Minnesota":"MN","Mississippi":"MS","Missouri":"MO","Montana":"MT","Nebraska":"NE","Nevada":"NV","New Hampshire":"NH","New Jersey":"NJ","New Mexico":"NM","New York":"NY","North Carolina":"NC","North Dakota":"ND","Ohio":"OH","Oklahoma":"OK","Oregon":"OR","Pennsylvania":"PA","Rhode Island":"RI","South Carolina":"SC","South Dakota":"SD","Tennessee":"TN","Texas":"TX","Utah":"UT","Vermont":"VT","Virginia":"VA","Washington":"WA","West Virginia":"WV","Wisconsin":"WI","Wyoming":"WY","D.C.":"DC","Puerto Rico":"PR","British Columbia":"BC"}
NAME = re.compile(r"^[A-Z][A-Za-z'’.\-]+(?:\s+(?:[A-Z][A-Za-z'’.\-]+|de|van|von|da|del|la|Jr\.?|III|II|IV)){1,3}$")
BAD = re.compile(r"coach|swim|diving|staff|director|rental|facility|conference|university|college", re.I)

path = sys.argv[1] if len(sys.argv) > 1 else "web/data/unis.json"
d = json.load(open(path))
for u in d["unis"]:
    title = urllib.parse.unquote(u.get("wiki", "").rsplit("/", 1)[-1]).replace("_", " ")
    title = re.sub(r"\s+(men's |women's )?swimming and diving$", "", title)
    n = u["n"]
    # "Grizzlies" → "Adams State" (el nombre era solo el apodo)
    if title.endswith(" " + n) and title != n:
        u["nick"] = u.get("nick") or n
        u["n"] = title[: -len(n)].strip()
    elif len(n.split()) == 1 and u.get("nick") and n in u["nick"]:
        pass
    first = u["n"].split()[0].lower().replace("(", "")
    if u["div"] != "D1" and first not in u["full"].lower() and not u["n"].isupper():
        u["nick"] = u.get("nick") or u["n"]
        u["n"] = re.sub(r"\s+", " ", re.sub(r"\b(University|College|of|The|at)\b", " ", u["full"])).strip(" ,-–")
    if u["n"] in ("Big", "Red", "Golden", "Blue") or len(u["n"]) < 3 and u["n"] not in ("MIT",):
        u["n"] = re.sub(r"\b(University|College|of|The)\b", "", u["full"]).strip(" ,")
    u["n"] = re.sub(r"\s+(and|&)$", "", u["n"]).strip()
    # "McMurry War" (de "McMurry War Hawks") → "McMurry": quita del final las palabras del apodo que no están en el nombre oficial.
    if u["div"] != "D1":
        norm = lambda t: re.sub(r"[^\w\s()]", " ", re.sub(r"[’']", "", t.lower()))
        full_w = norm(u["full"]).split()
        w = u["n"].split()
        inside = lambda x: any(f == x or (len(x) >= 4 and f.startswith(x)) for f in full_w)
        cut = len(w)
        while cut > 1 and not inside(norm(w[cut - 1]).strip()) and not w[cut - 1].isupper() and not w[cut - 1].startswith("(") and w[cut - 1] not in ("College", "University"):
            cut -= 1
        if cut < len(w) and inside(norm(w[0]).strip()):
            extra = u.get("nick") or ""
            tail = w[cut:]
            u["nick"] = " ".join(tail + [x for x in extra.split() if x not in tail and x != "Lady"]) if not set(tail) & set(extra.split()) else " ".join(tail)
            u["n"] = " ".join(w[:cut])
    if u.get("city"):
        u["city"] = re.sub(r"\s+address$", "", u["city"]).strip()
    if not u.get("st") and u.get("city"):
        for name, ab in STATES.items():
            if u["city"].endswith(name):
                u["st"] = ab
                break
    for k in ("coach", "coachM", "coachW"):
        v = (u.get(k) or "").strip()
        if not v or not NAME.match(v) or BAD.search(v):
            u.pop(k, None)
        else:
            u[k] = v
# filas repetidas (tablas de transición)
uniq, keys = [], set()
for u in d["unis"]:
    k = (u["full"], u["div"])
    if k not in keys:
        keys.add(k)
        uniq.append(u)
d["unis"] = uniq
# nombres repetidos: añade el estado (la de D-I conserva el nombre)
seen = {}
for u in d["unis"]:
    seen.setdefault(u["n"], []).append(u)
for n, l in seen.items():
    if len(l) > 1:
        has_d1 = any(u["div"] == "D1" for u in l)
        for u in l:
            if has_d1 and u["div"] == "D1":
                continue
            u["n"] = f"{n} ({u.get('st') or u['div']})"
json.dump(d, open(path, "w"), ensure_ascii=False, separators=(",", ":"))
u = d["unis"]
print(len(u), "coach", sum(1 for x in u if x.get("coach") or x.get("coachM") or x.get("coachW")), "sin estado", sum(1 for x in u if not x.get("st")))
print([x["n"] for x in u if x["div"] == "D2"][:15])
print([x["n"] for x in u if "(" in x["n"]][:20])
