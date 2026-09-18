# -*- coding: utf-8 -*-
"""Fuehrt die vier Abschnitts-Messungen zu EINER Wandliste zusammen und baut
app/public/plaene/hotel400.json im Schema von halle400.json.

GRUNDSATZ (halle400-planer/CLAUDE.md): nichts erfinden. Wo zwei Abschnitte
dieselbe Wand verschieden messen, wird NICHT gemittelt - der Abschnitt, dem der
Bereich gehoert, liefert die Geometrie, und BEIDE Werte stehen im Bericht.
"""
import json, math, os, random
from collections import defaultdict

SCR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'messungen')
if not os.path.isdir(SCR):
    SCR = os.path.dirname(os.path.abspath(__file__))
WURZEL = r'C:/Users/dania/.gemini/WebsiteAgentur/halle400-planer'
ZIEL_PLAN = os.path.join(WURZEL, 'app/public/plaene/hotel400.json')
ZIEL_BERICHT = os.path.join(WURZEL, 'data/hotel/hotel400-bericht.json')

PDF = 'Hotel-PDF 06.05.2026'
ABSCHNITTE = [
    ('kopf-west',  0,    1400, 'mess_kopf-west.json'),
    ('mitte-west', 1200, 3400, 'mess_mitte-west.json'),
    ('regel',      3200, 6000, 'mess_regel.json'),
    ('ost',        5800, 7800, 'mess_ost.json'),
]
# Besitzgrenzen: Mitte der absichtlichen Ueberlappung.
GRENZEN = [0, 1300, 3300, 5900, 7800]
X_MIN, X_MAX = 0, 7800
TOL_GLEICH = 15     # <= 15 cm: dieselbe Wand (Dedup)
TOL_KONFLIKT = 80   # bis 80 cm: Partner, aber widersprechend
TOL_ECKE = 10       # Ecken naeher als 10 cm werden zusammengefuehrt
EXT_LAENGS = 12     # so weit darf eine Laengswand auf eine Querwand zulaufen
EXT_QUER = 30       # so weit darf eine Querwand auf eine Laengswand zulaufen

mess = {}
for name, v, b, datei in ABSCHNITTE:
    mess[name] = json.load(open(os.path.join(SCR, datei), encoding='utf-8'))

konflikte = []
luecken = []
for _name, _v, _b, _d in ABSCHNITTE:
    for l in mess[_name].get('luecken', []):
        luecken.append({'abschnitt': _name, 'luecke': l if isinstance(l, str) else json.dumps(l, ensure_ascii=False)})
notizen = []


def ueberlapp(a0, a1, b0, b1):
    return min(a1, b1) - max(a0, b0)


# ── 1. KONFLIKTE IN DEN UEBERLAPPUNGS-ZONEN ───────────────────────────────
def pruefe_zone(links, rechts, z0, z1):
    ml, mr = mess[links], mess[rechts]

    def in_zone_l(w):
        return ueberlapp(w['x0_cm'], w['x1_cm'], z0, z1) >= 50

    def in_zone_q(w):
        return z0 <= w['x_cm'] <= z1

    # Laengswaende
    L = [w for w in ml['laengswaende'] if in_zone_l(w)]
    R = [w for w in mr['laengswaende'] if in_zone_l(w)]

    def nah_l(a, kandidaten):
        best, bi = None, None
        for i, b in enumerate(kandidaten):
            if ueberlapp(a['x0_cm'], a['x1_cm'], b['x0_cm'], b['x1_cm']) < 50:
                continue
            d = abs(a['y_cm'] - b['y_cm'])
            if best is None or d < best:
                best, bi = d, i
        return best, bi

    getroffen_r = set()
    for a in L:
        best, bi = nah_l(a, R)
        # Gegenseitig naechster Nachbar - sonst ist die Zuordnung geraten.
        if bi is not None:
            zurueck, zi = nah_l(R[bi], L)
            if zi is None or L[zi] is not a:
                konflikte.append({
                    'art': 'mehrdeutig', 'lage': 'laengswand', 'zone_cm': [z0, z1],
                    'a': {'abschnitt': links, 'y_cm': a['y_cm'], 'x_cm': [a['x0_cm'], a['x1_cm']],
                          'wandart': a['art'], 'sicherheit': a['sicherheit'], 'notiz': a.get('notiz', '')},
                    'b': {'abschnitt': rechts, 'y_cm': R[bi]['y_cm'], 'x_cm': [R[bi]['x0_cm'], R[bi]['x1_cm']],
                          'wandart': R[bi]['art'], 'sicherheit': R[bi]['sicherheit']},
                    'hinweis': f'in {links} liegen hier mehr Linien als in {rechts}; die naechste Linie des '
                               f'Nachbarn gehoert einer anderen. Beide Messungen behalten.'})
                continue
        if best is None or best > TOL_KONFLIKT:
            konflikte.append({
                'art': 'nur in einem Abschnitt gemessen', 'lage': 'laengswand',
                'zone_cm': [z0, z1],
                'a': {'abschnitt': links, 'y_cm': a['y_cm'], 'x_cm': [a['x0_cm'], a['x1_cm']],
                      'wandart': a['art'], 'sicherheit': a['sicherheit']},
                'b': None,
                'hinweis': f"in {rechts} ist an dieser Stelle keine Laengswand innerhalb {TOL_KONFLIKT} cm gemessen"})
            continue
        getroffen_r.add(bi)
        b = R[bi]
        if best > TOL_GLEICH:
            konflikte.append({
                'art': 'Versatz', 'lage': 'laengswand', 'zone_cm': [z0, z1], 'versatz_cm': best,
                'a': {'abschnitt': links, 'y_cm': a['y_cm'], 'x_cm': [a['x0_cm'], a['x1_cm']],
                      'wandart': a['art'], 'sicherheit': a['sicherheit'], 'notiz': a.get('notiz', '')},
                'b': {'abschnitt': rechts, 'y_cm': b['y_cm'], 'x_cm': [b['x0_cm'], b['x1_cm']],
                      'wandart': b['art'], 'sicherheit': b['sicherheit'], 'notiz': b.get('notiz', '')},
                'hinweis': 'beide Werte behalten; die Geometrie folgt dem Abschnitt, dem der Bereich gehoert'})
        elif a['art'] != b['art']:
            konflikte.append({
                'art': 'Wandart widerspricht', 'lage': 'laengswand', 'zone_cm': [z0, z1], 'versatz_cm': best,
                'a': {'abschnitt': links, 'y_cm': a['y_cm'], 'wandart': a['art']},
                'b': {'abschnitt': rechts, 'y_cm': b['y_cm'], 'wandart': b['art']},
                'hinweis': 'gleiche Lage, verschieden gedeutet'})
    for i, b in enumerate(R):
        if i in getroffen_r:
            continue
        if any(abs(a['y_cm'] - b['y_cm']) <= TOL_KONFLIKT
               and ueberlapp(a['x0_cm'], a['x1_cm'], b['x0_cm'], b['x1_cm']) >= 50 for a in L):
            continue
        konflikte.append({
            'art': 'nur in einem Abschnitt gemessen', 'lage': 'laengswand', 'zone_cm': [z0, z1],
            'a': None,
            'b': {'abschnitt': rechts, 'y_cm': b['y_cm'], 'x_cm': [b['x0_cm'], b['x1_cm']],
                  'wandart': b['art'], 'sicherheit': b['sicherheit']},
            'hinweis': f"in {links} ist an dieser Stelle keine Laengswand innerhalb {TOL_KONFLIKT} cm gemessen"})

    # Querwaende
    L = [w for w in ml['querwaende'] if in_zone_q(w)]
    R = [w for w in mr['querwaende'] if in_zone_q(w)]

    def nah_q(a, kandidaten):
        best, bi = None, None
        for i, b in enumerate(kandidaten):
            if ueberlapp(a['y0_cm'], a['y1_cm'], b['y0_cm'], b['y1_cm']) < 50:
                continue
            d = abs(a['x_cm'] - b['x_cm'])
            if best is None or d < best:
                best, bi = d, i
        return best, bi

    getroffen_r = set()
    for a in L:
        best, bi = nah_q(a, R)
        if bi is not None:
            zurueck, zi = nah_q(R[bi], L)
            if zi is None or L[zi] is not a:
                konflikte.append({
                    'art': 'mehrdeutig', 'lage': 'querwand', 'zone_cm': [z0, z1],
                    'a': {'abschnitt': links, 'x_cm': a['x_cm'], 'y_cm': [a['y0_cm'], a['y1_cm']],
                          'wandart': a['art'], 'sicherheit': a['sicherheit']},
                    'b': {'abschnitt': rechts, 'x_cm': R[bi]['x_cm'], 'y_cm': [R[bi]['y0_cm'], R[bi]['y1_cm']],
                          'wandart': R[bi]['art'], 'sicherheit': R[bi]['sicherheit']},
                    'hinweis': f'in {links} liegen hier mehr Querwaende als in {rechts}. Beide Messungen behalten.'})
                continue
        if best is None or best > TOL_KONFLIKT:
            konflikte.append({
                'art': 'nur in einem Abschnitt gemessen', 'lage': 'querwand', 'zone_cm': [z0, z1],
                'a': {'abschnitt': links, 'x_cm': a['x_cm'], 'y_cm': [a['y0_cm'], a['y1_cm']],
                      'wandart': a['art'], 'sicherheit': a['sicherheit']},
                'b': None,
                'hinweis': f"in {rechts} ist an dieser Stelle keine Querwand innerhalb {TOL_KONFLIKT} cm gemessen"})
            continue
        getroffen_r.add(bi)
        b = R[bi]
        if best > TOL_GLEICH:
            konflikte.append({
                'art': 'Versatz', 'lage': 'querwand', 'zone_cm': [z0, z1], 'versatz_cm': best,
                'a': {'abschnitt': links, 'x_cm': a['x_cm'], 'y_cm': [a['y0_cm'], a['y1_cm']],
                      'wandart': a['art'], 'sicherheit': a['sicherheit']},
                'b': {'abschnitt': rechts, 'x_cm': b['x_cm'], 'y_cm': [b['y0_cm'], b['y1_cm']],
                      'wandart': b['art'], 'sicherheit': b['sicherheit']},
                'hinweis': 'beide Werte behalten; die Geometrie folgt dem Abschnitt, dem der Bereich gehoert'})
        else:
            da = abs(a['y0_cm'] - b['y0_cm']) + abs(a['y1_cm'] - b['y1_cm'])
            if da > 100:
                konflikte.append({
                    'art': 'Ausdehnung widerspricht', 'lage': 'querwand', 'zone_cm': [z0, z1],
                    'a': {'abschnitt': links, 'x_cm': a['x_cm'], 'y_cm': [a['y0_cm'], a['y1_cm']]},
                    'b': {'abschnitt': rechts, 'x_cm': b['x_cm'], 'y_cm': [b['y0_cm'], b['y1_cm']]},
                    'hinweis': 'gleiche Achse, verschieden weit gemessen'})
    for i, b in enumerate(R):
        if i in getroffen_r:
            continue
        if any(abs(a['x_cm'] - b['x_cm']) <= TOL_KONFLIKT
               and ueberlapp(a['y0_cm'], a['y1_cm'], b['y0_cm'], b['y1_cm']) >= 50 for a in L):
            continue
        konflikte.append({
            'art': 'nur in einem Abschnitt gemessen', 'lage': 'querwand', 'zone_cm': [z0, z1],
            'a': None,
            'b': {'abschnitt': rechts, 'x_cm': b['x_cm'], 'y_cm': [b['y0_cm'], b['y1_cm']],
                  'wandart': b['art'], 'sicherheit': b['sicherheit']},
            'hinweis': f"in {links} ist an dieser Stelle keine Querwand innerhalb {TOL_KONFLIKT} cm gemessen"})


for i in range(3):
    links, rechts = ABSCHNITTE[i][0], ABSCHNITTE[i + 1][0]
    z0 = ABSCHNITTE[i + 1][1]
    z1 = ABSCHNITTE[i][2]
    pruefe_zone(links, rechts, z0, z1)

# ── 2. BESITZ-ZUSCHNITT -> EINE WANDLISTE ─────────────────────────────────
segmente = []   # {kind, a, s0, s1, art, sicherheit, notiz, beleg, abschnitt}
verworfen_kurz = 0
for i, (name, _, _, _) in enumerate(ABSCHNITTE):
    o0, o1 = GRENZEN[i], GRENZEN[i + 1]
    d = mess[name]
    beleg = d.get('beleg') or d['laengswaende'][0].get('beleg') or f'beleg_{name}.png'
    for w in d['laengswaende']:
        x0 = max(w['x0_cm'], o0, X_MIN)
        x1 = min(w['x1_cm'], o1, X_MAX)
        if x1 - x0 < 30:
            verworfen_kurz += 1
            continue
        segmente.append({'kind': 'h', 'a': float(w['y_cm']), 's0': float(x0), 's1': float(x1),
                         'art': w['art'], 'sicherheit': w['sicherheit'], 'notiz': w.get('notiz', ''),
                         'beleg': w.get('beleg', beleg), 'abschnitt': name})
    for w in d['querwaende']:
        x = w['x_cm']
        if not (o0 <= x < o1 or (i == 3 and x >= o1 and x - X_MAX <= 30)):
            continue
        x = min(max(float(x), X_MIN), X_MAX)
        y0, y1 = float(w['y0_cm']), float(w['y1_cm'])
        if y1 - y0 < 30:
            verworfen_kurz += 1
            continue
        segmente.append({'kind': 'v', 'a': x, 's0': y0, 's1': y1,
                         'art': w['art'], 'sicherheit': w['sicherheit'], 'notiz': w.get('notiz', ''),
                         'beleg': w.get('beleg', beleg), 'abschnitt': name})

# Rand-Beschnitt dokumentieren
ueber = [(n, w['x1_cm']) for n, _, _, _ in ABSCHNITTE for w in mess[n]['laengswaende'] if w['x1_cm'] > X_MAX]
ueber += [(n, w['x_cm']) for n, _, _, _ in ABSCHNITTE for w in mess[n]['querwaende'] if w['x_cm'] > X_MAX]
if ueber:
    notizen.append(f"{len(ueber)} gemessene Kanten liegen bis zu "
                   f"{max(v for _, v in ueber) - X_MAX} cm oestlich von x=7800 (Freihand-Streuung der "
                   f"Ostfassade). Auf x=7800 beschnitten, weil 78,00 m die Bezugslaenge ist.")

# ── 3. KNOTEN: QUERWAND TRIFFT LAENGSWAND ─────────────────────────────────
hs = [s for s in segmente if s['kind'] == 'h']
vs = [s for s in segmente if s['kind'] == 'v']

# 3a. FANGEN: ein gemessenes Wandende, das kurz VOR oder kurz HINTER der Wand
# endet, auf die es zulaeuft, wird auf sie gezogen. Ohne das bleibt entweder ein
# Schlitz oder ein Stummel, der in den Flur ragt - beides steht so nicht im Plan.
gefangen = []
for v in vs:
    for schluessel in ('s0', 's1'):
        kand = [h['a'] for h in hs
                if h['s0'] - EXT_LAENGS <= v['a'] <= h['s1'] + EXT_LAENGS
                and abs(h['a'] - v[schluessel]) <= EXT_QUER]
        if kand:
            neu = min(kand, key=lambda y: abs(y - v[schluessel]))
            if neu != v[schluessel]:
                gefangen.append(abs(neu - v[schluessel]))
                v[schluessel] = neu
for h in hs:
    for schluessel in ('s0', 's1'):
        kand = [x['a'] for x in vs
                if x['s0'] - EXT_QUER <= h['a'] <= x['s1'] + EXT_QUER
                and abs(x['a'] - h[schluessel]) <= EXT_LAENGS]
        if kand:
            neu = min(kand, key=lambda x: abs(x - h[schluessel]))
            if neu != h[schluessel]:
                gefangen.append(abs(neu - h[schluessel]))
                h[schluessel] = neu

vorher = len(segmente)
segmente = [s for s in segmente if s['s1'] - s['s0'] >= 25]
hs = [s for s in segmente if s['kind'] == 'h']
vs = [s for s in segmente if s['kind'] == 'v']
verworfen_kurz += vorher - len(segmente)

for s in segmente:
    s['punkte'] = {s['s0'], s['s1']}
for h in hs:
    for v in vs:
        if not (h['s0'] - 0.01 <= v['a'] <= h['s1'] + 0.01):
            continue
        if not (v['s0'] - 0.01 <= h['a'] <= v['s1'] + 0.01):
            continue
        h['punkte'].add(v['a'])
        v['punkte'].add(h['a'])

# ── 4. ECKEN ZUSAMMENFUEHREN (< 10 cm) ────────────────────────────────────
rohpunkte = []
for s in segmente:
    for t in sorted(s['punkte']):
        p = (t, s['a']) if s['kind'] == 'h' else (s['a'], t)
        rohpunkte.append(p)

raster = defaultdict(list)
Z = TOL_ECKE


def zelle(p):
    return (int(math.floor(p[0] / Z)), int(math.floor(p[1] / Z)))


eltern = {}


def finde(i):
    while eltern[i] != i:
        eltern[i] = eltern[eltern[i]]
        i = eltern[i]
    return i


def vereine(i, j):
    a, b = finde(i), finde(j)
    if a != b:
        eltern[b] = a


for idx, p in enumerate(rohpunkte):
    eltern[idx] = idx
for idx, p in enumerate(rohpunkte):
    cx, cy = zelle(p)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for j in raster.get((cx + dx, cy + dy), ()):
                q = rohpunkte[j]
                if (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 <= TOL_ECKE ** 2:
                    vereine(idx, j)
    raster[(cx, cy)].append(idx)

gruppen = defaultdict(list)
for idx in range(len(rohpunkte)):
    gruppen[finde(idx)].append(idx)
pos = {}
for g, mitglieder in gruppen.items():
    xs = [rohpunkte[i][0] for i in mitglieder]
    ys = [rohpunkte[i][1] for i in mitglieder]
    pos[g] = (round(sum(xs) / len(xs)), round(sum(ys) / len(ys)))
verschmolzen = sum(1 for g in gruppen if len(gruppen[g]) > 1)

rnd = random.Random(400600506)  # fester Startwert -> wiederholbarer Lauf


def guid():
    s = ''.join(rnd.choice('0123456789abcdef') for _ in range(32))
    return f'{s[0:8]}-{s[8:12]}-{s[12:16]}-{s[16:20]}-{s[20:32]}'


kennung = {}
corners = {}
for g in sorted(gruppen, key=lambda g: (pos[g][0], pos[g][1])):
    k = guid()
    kennung[g] = k
    corners[k] = {'x': float(pos[g][0]), 'y': float(pos[g][1])}

# ── 5. WAENDE ─────────────────────────────────────────────────────────────
punkt_index = {}
lauf = 0
for s in segmente:
    s['gruppen'] = []
    for t in sorted(s['punkte']):
        s['gruppen'].append(finde(lauf))
        lauf += 1

walls = []
gesehen = set()
for s in segmente:
    gs = s['gruppen']
    herkunft = (f"{PDF}, Abschnitt {s['abschnitt']}, {s['beleg']}"
                + ('' if s['sicherheit'] == 'sicher' else ' (unsicher)')
                + (f" - {s['notiz']}" if s['notiz'] else ''))
    for a, b in zip(gs, gs[1:]):
        if a == b:
            continue
        ka, kb = kennung[a], kennung[b]
        pa, pb = corners[ka], corners[kb]
        if math.dist((pa['x'], pa['y']), (pb['x'], pb['y'])) < 1.0:
            continue
        schluessel = tuple(sorted((ka, kb)))
        if schluessel in gesehen:
            continue
        gesehen.add(schluessel)
        walls.append({'corner1': ka, 'corner2': kb, 'herkunft': herkunft[:300], 'art': s['art']})

benutzt = set()
for w in walls:
    benutzt.add(w['corner1'])
    benutzt.add(w['corner2'])
corners = {k: v for k, v in corners.items() if k in benutzt}

# ── 6. RAEUME -> LABELS ───────────────────────────────────────────────────
NAME_UNKLAR = lambda n: n.strip().lower().startswith('unklar')
raeume = []
for name, _, _, _ in ABSCHNITTE:
    for r in mess[name]['raeume']:
        if NAME_UNKLAR(r['name']):
            continue
        raeume.append(dict(r, abschnitt=name))
unklar_zellen = sum(1 for n, _, _, _ in ABSCHNITTE for r in mess[n]['raeume'] if NAME_UNKLAR(r['name']))


def flaeche(r):
    return (r['x1_cm'] - r['x0_cm']) * (r['y1_cm'] - r['y0_cm'])


dedup_notizen = []
raus = set()
for i in range(len(raeume)):
    for j in range(i + 1, len(raeume)):
        a, b = raeume[i], raeume[j]
        if a['abschnitt'] == b['abschnitt'] or i in raus or j in raus:
            continue
        ux = ueberlapp(a['x0_cm'], a['x1_cm'], b['x0_cm'], b['x1_cm'])
        uy = ueberlapp(a['y0_cm'], a['y1_cm'], b['y0_cm'], b['y1_cm'])
        if ux <= 0 or uy <= 0:
            continue
        if ux * uy < 0.5 * min(flaeche(a), flaeche(b)):
            continue
        weg = i if flaeche(a) < flaeche(b) else j
        bleibt = j if weg == i else i
        raus.add(weg)
        dedup_notizen.append({
            'weg': {'abschnitt': raeume[weg]['abschnitt'], 'name': raeume[weg]['name'],
                    'x_cm': [raeume[weg]['x0_cm'], raeume[weg]['x1_cm']],
                    'y_cm': [raeume[weg]['y0_cm'], raeume[weg]['y1_cm']]},
            'bleibt': {'abschnitt': raeume[bleibt]['abschnitt'], 'name': raeume[bleibt]['name'],
                       'x_cm': [raeume[bleibt]['x0_cm'], raeume[bleibt]['x1_cm']],
                       'y_cm': [raeume[bleibt]['y0_cm'], raeume[bleibt]['y1_cm']]}})
raeume = [r for i, r in enumerate(raeume) if i not in raus]

# Randstuecke: was der Nachbarabschnitt vollstaendig misst, liegt hier nur
# angeschnitten vor. Unter 2 m2 an einer Abschnittskante ist das kein Raum.
grenze = {n: (v, b) for n, v, b, _ in ABSCHNITTE}
rand = []
for r in list(raeume):
    v, b = grenze[r['abschnitt']]
    amRand = min(abs(r['x0_cm'] - v), abs(r['x1_cm'] - b)) <= 30
    if amRand and flaeche(r) < 20000:
        raeume.remove(r)
        rand.append({'abschnitt': r['abschnitt'], 'name': r['name'],
                     'x_cm': [r['x0_cm'], r['x1_cm']], 'y_cm': [r['y0_cm'], r['y1_cm']],
                     'flaeche_m2': round(flaeche(r) / 10000, 2),
                     'grund': 'Randstueck am Abschnittsende, unter 2 m2 - kein eigener Raum'})

# ── 6a. BESCHRIFTUNGEN DES PLANS ──────────────────────────────────────────
# Die PDF hat keine Textebene, aber sie hat ZEHN Beschriftungen mit Leitlinie.
# Wo eine Leitlinie endet, ist keine Deutung, sondern eine Ablesung. Vier
# Endpunkte stehen in mess_kopf-west, die uebrigen sechs sind in
# hotel_entzerrt.png am Leitlinienende abgelesen (Bezug: bezug.json).
BESCHRIFTUNGEN = [
    ('Zimmer Typ 2',  650,  405, 'Leitlinienende, mess_kopf-west'),
    ('Backoffice',   1205,  335, 'Leitlinienende, mess_kopf-west'),
    ('Sonderzimmer',  355, 1110, 'Leitlinienende, mess_kopf-west'),
    ('Zimmer Typ 1', 1275, 1110, 'Leitlinienende, mess_kopf-west (Text steht unter dem Plan)'),
    ('Empfang',      1665,  286, 'Leitlinienende, hotel_entzerrt.png'),
    ('Aufzug',       2000, -170, 'Leitlinienende, hotel_entzerrt.png'),
    ('Waschraum',    2364,  293, 'Leitlinienende, hotel_entzerrt.png'),
    ('Flur',         3780,  620, 'Leitlinienende, hotel_entzerrt.png'),
    ('Loggia',       5632,   70, 'Leitlinienende, hotel_entzerrt.png'),
    ('Bad',          6441,  329, 'Leitlinienende, hotel_entzerrt.png'),
]
beschriftet = []
for text, ax, ay, beleg in BESCHRIFTUNGEN:
    treffer = [r for r in raeume if r['x0_cm'] <= ax <= r['x1_cm'] and r['y0_cm'] <= ay <= r['y1_cm']]
    if not treffer:
        luecken.append({'abschnitt': 'zusammenfuehrung',
                        'luecke': f"Die Beschriftung '{text}' des Plans (Leitlinienende {ax}/{ay} cm) "
                                  f"trifft keinen gemessenen Raum - dort fehlt die Messung."})
        continue
    r = min(treffer, key=flaeche)
    vorher = r['name']
    r['plan_text'] = text
    r['plan_beleg'] = f'{beleg}, Anker {ax}/{ay} cm'
    beschriftet.append({'plan_text': text, 'anker_cm': [ax, ay], 'beleg': beleg,
                        'raum_vorher': vorher, 'abschnitt': r['abschnitt'],
                        'x_cm': [r['x0_cm'], r['x1_cm']], 'y_cm': [r['y0_cm'], r['y1_cm']],
                        'wirkung': 'bestaetigt' if vorher.lower().startswith(text.split()[0].lower())
                                   else 'Plan-Beschriftung ersetzt die abgeleitete Deutung'})

TITEL = {'flur': 'Flur', 'bad': 'Bad', 'loggia': 'Loggia', 'zimmer': 'Zimmer',
         'treppe': 'Treppe', 'empfang': 'Empfang'}
def wirksam(r):
    return (r.get('plan_text') or r['name']).strip()


zimmer = [r for r in raeume if wirksam(r).lower().startswith(('zimmer', 'sonderzimmer'))]
zimmer.sort(key=lambda r: (r['x0_cm'], r['y0_cm']))
nummer = {id(r): i + 1 for i, r in enumerate(zimmer)}

labels = []
for r in sorted(raeume, key=lambda r: (r['x0_cm'], r['y0_cm'])):
    mx = (r['x0_cm'] + r['x1_cm']) / 2.0
    my = (r['y0_cm'] + r['y1_cm']) / 2.0
    n = wirksam(r)
    nl = n.lower()
    beleg = f"{PDF}, Abschnitt {r['abschnitt']}"
    if r.get('plan_beleg'):
        beleg += ' | ' + r['plan_beleg']
    if nl.startswith(('zimmer', 'sonderzimmer')):
        text = f'Zimmer {nummer[id(r)]:02d}'
        if nl.startswith('sonderzimmer'):
            zusatz = 'Sonderzimmer - im Plan beschriftet'
        elif 'typ 2' in nl:
            zusatz = 'Typ 2 - im Plan beschriftet'
        elif 'typ 1' in nl:
            zusatz = 'Typ 1 - im Plan beschriftet'
        else:
            zusatz = 'Typ unbelegt - der Plan beschriftet dieses Zimmer nicht'
    else:
        text = TITEL.get(nl, n)
        zusatz = 'im Plan beschriftet' if r.get('plan_text') else (
            '' if r.get('sicherheit') == 'sicher' else 'Deutung unsicher')
    # HERKUNFT GETRENNT VON DER SACHNOTE.
    # Bis hierher stand beides in EINEM Feld: `zusatz` trug erst die Sachnote
    # ("Typ 1 - im Plan beschriftet") und dann, mit ' | ' angehaengt, den Beleg
    # ("Hotel-PDF 06.05.2026, Abschnitt kopf-west | Leitlinienende, mess_...").
    # `zusatz` ist aber das Feld, das die Axonometrie UNTER den Raumnamen MALT
    # (src/axo/axo-zeichnen.js:345,421). Bei 74 Raeumen wurde daraus ein
    # unlesbares Textband ueber und unter dem Modell - im Bankgespraech genau
    # der Fehler, den man nicht mehr wegklicken kann.
    # Der Beleg geht deshalb nach `herkunft` - dasselbe Feld, das die WAENDE
    # oben schon tragen (Zeile 381) und das keine Anzeige liest. Er ist damit
    # nicht verloren, sondern nur nicht mehr auf dem Blatt; das 300er-Mass ist
    # ebenfalls von den Waenden uebernommen und schneidet weniger ab als die
    # frueheren 180 Zeichen fuer BEIDE Teile zusammen.
    labels.append({'text': text,
                   'zusatz': zusatz,
                   'herkunft': beleg[:300],
                   'seite': 'nord' if my < 617 else 'sued',
                   'anker_cm': [round(mx, 1), round(my, 1)]})

# ── 7. PLAN SCHREIBEN ─────────────────────────────────────────────────────
plan = {'floorplan': {'corners': corners, 'walls': walls, 'wallTextures': [],
                      'floorTextures': {}, 'newFloorTextures': {}, 'ausstattung': []},
        'items': [], 'labels': labels}
os.makedirs(os.path.dirname(ZIEL_PLAN), exist_ok=True)
with open(ZIEL_PLAN, 'w', encoding='utf-8') as f:
    json.dump(plan, f, ensure_ascii=False, indent=1)

# ── 8. MECHANISCHE PRUEFUNG ───────────────────────────────────────────────
befunde = []
roh = json.load(open(ZIEL_PLAN, encoding='utf-8'))
c, w = roh['floorplan']['corners'], roh['floorplan']['walls']
fehl = [x for x in w if x['corner1'] not in c or x['corner2'] not in c]
if fehl:
    befunde.append(f'{len(fehl)} Waende zeigen auf fehlende Ecken')
ausser = [k for k, v in c.items() if not (X_MIN <= v['x'] <= X_MAX and -400 <= v['y'] <= 2000)]
if ausser:
    befunde.append(f'{len(ausser)} Ecken ausserhalb x 0..7800 / y -400..2000')
klein = [r for r in raeume if flaeche(r) < 20000]
for r in klein:
    befunde.append(f"Raum unter 2 m2: {r['name']} ({r['abschnitt']}) "
                   f"{r['x0_cm']}..{r['x1_cm']} x {r['y0_cm']}..{r['y1_cm']} = {flaeche(r)/10000:.2f} m2")
grad = defaultdict(int)
for x in w:
    grad[x['corner1']] += 1
    grad[x['corner2']] += 1
lose = sum(1 for k in c if grad[k] <= 1)

luecken.append({'abschnitt': 'zusammenfuehrung', 'luecke':
    'Der Aufzugs-Vorsprung noerdlich der Nordfassade (Beschriftung "Aufzug", Leitlinienende rund '
    '2000/-170 cm) ist nur zur HAELFTE erfasst: die Doppelwand x=2155/2185 reicht als Ostflanke bis '
    'y=-90, seine Nordkante und seine Westflanke fehlen. Grob aus hotel_entzerrt.png abgelesen liegt '
    'der Kasten bei x 1835..2170, y -330..25 (Spalten-/Zeilenprofil, NICHT nach der Abschnittsmethode '
    'gemessen) - darum steht er NICHT in der Datei. Er ist die groesste bekannte Luecke.'})

soll = {'Typ 1': 19, 'Typ 2': 8, 'Sonderzimmer': 2, 'gesamt': 29}
ist_typ1 = sum(1 for l in labels if l['text'].startswith('Zimmer') and 'Typ 1 -' in l['zusatz'])
ist_typ2 = sum(1 for l in labels if l['text'].startswith('Zimmer') and 'Typ 2 -' in l['zusatz'])
ist_sonder = sum(1 for l in labels if 'Sonderzimmer' in l['zusatz'])
ist_ges = len(zimmer)

bericht = {
    'quelle': {'pdf': 'data/hotel/Hotel400-Grundriss.pdf', 'datum': '06.05.2026',
               'bezug': 'scratchpad/hotel400/bezug.json (Ursprung Nordfassade x Westgiebel, 28,1777 px/m)',
               'abschnittsdateien': [a[3] for a in ABSCHNITTE]},
    'methode': {
        'besitzgrenzen_cm': GRENZEN,
        'dedup': 'Die Abschnitte ueberlappen absichtlich. In der Ueberlappung entscheidet die '
                 'Besitzgrenze (Mitte der Zone), welcher Abschnitt die Geometrie liefert; die '
                 'Messung des Nachbarn wird NICHT gemittelt, sondern steht unter "konflikte".',
        'toleranzen_cm': {'gleiche_wand': TOL_GLEICH, 'konflikt_partner': TOL_KONFLIKT,
                          'ecken_zusammenfuehren': TOL_ECKE,
                          'querwand_laeuft_auf_laengswand': EXT_QUER,
                          'laengswand_laeuft_auf_querwand': EXT_LAENGS},
        'rundung': 'Eingang 5 cm (Messung). Ausgang ganze cm, weil das Zusammenfuehren von '
                   'Ecken Mittelwerte erzeugt.'},
    'zahlen': {'ecken': len(c), 'waende': len(w), 'labels': len(labels),
               'segmente_vor_dem_schnitt': len(segmente),
               'ecken_verschmolzen': verschmolzen,
               'wandenden_gefangen': len(gefangen),
               'fang_weite_cm': {'max': max(gefangen) if gefangen else 0,
                                 'mittel': round(sum(gefangen) / len(gefangen), 1) if gefangen else 0},
               'segmente_zu_kurz_verworfen': verworfen_kurz,
               'lose_ecken_grad_1': lose,
               'waende_je_art': {a: sum(1 for x in w if x['art'] == a)
                                 for a in ('aussen', 'flur', 'trennwand')}},
    'zimmer_bilanz': {'soll_tabelle_pdf': soll,
                      'ist_gezaehlt': {'gesamt': ist_ges, 'als Typ 1 beschriftet': ist_typ1,
                                       'als Typ 2 beschriftet': ist_typ2,
                                       'als Sonderzimmer beschriftet': ist_sonder,
                                       'Typ unbelegt': ist_ges - ist_typ1 - ist_typ2 - ist_sonder},
                      'verteilung': {'Suedreihe': sum(1 for l in labels
                                                      if l['text'].startswith('Zimmer') and l['seite'] == 'sued'),
                                     'Nordreihe': sum(1 for l in labels
                                                      if l['text'].startswith('Zimmer') and l['seite'] == 'nord')},
                      'befund': f'{ist_ges} Zimmer gezeichnet gefunden, die Tabelle des Plans nennt 29. '
                                f'Differenz {29 - ist_ges} - NICHT von Hand aufgefuellt. Wo sie NICHT liegen: '
                                f'die Nordreihe zwischen x 33 und 59 m ist leer gezeichnet (keine Moeblierung, '
                                f'kein Zimmerraster, Zellenbreiten 180..480 cm) - dort ist kein Zimmer. '
                                f'Offen bleibt, ob die Tabelle mehr als dieses eine Geschoss zaehlt.'},
    'konflikte': konflikte,
    'plan_beschriftungen': beschriftet,
    'raum_dedup': dedup_notizen,
    'raum_randstuecke_verworfen': rand,
    'pruefung': {'json_laedt': True, 'waende_mit_gueltigen_ecken': len(w) - len(fehl),
                 'befunde': befunde or ['keine']},
    'luecken': luecken,
    'notizen': notizen,
    'unklare_zellen_ohne_label': unklar_zellen,
}
with open(ZIEL_BERICHT, 'w', encoding='utf-8') as f:
    json.dump(bericht, f, ensure_ascii=False, indent=1)

print(f'Ecken {len(c)}  Waende {len(w)}  Labels {len(labels)}  Zimmer {ist_ges}')
print('Konflikte', len(konflikte), ' Raum-Dedup', len(dedup_notizen), ' lose Ecken', lose)
print('Befunde:', befunde[:8])
