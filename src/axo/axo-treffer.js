/**
 * AXONOMETRIE — TREFFER UND UMKEHRUNG (W7)
 * ========================================
 *
 * Die REINE RECHNUNG hinter dem Bearbeiten im Blatt: ein Bildpunkt zurueck in
 * die Welt, und die Frage „welches Stueck liegt darunter?". Kein Canvas, kein
 * DOM, kein Browser — deshalb ist dieses Modul das einzige Stueck der ganzen
 * Ansicht, das sich in `node` messen laesst.
 *
 * DIE FESTLEGUNG, DIE HIER PRAEZISIERT WIRD
 * `CLAUDE.md` sagte: „In der Axonometrie wird nicht bearbeitet — ein Klick
 * trifft keinen Punkt, sondern einen Sehstrahl; die Zielhoehe waere geraten."
 * Ueber die PROJEKTION war der Satz nie falsch. Ueber den UMFANG war er zu
 * weit: **fuer einen Koerper mit bekannter Ober- und Unterkante ist der
 * Sehstrahl keine unendliche Gerade, sondern eine endliche Strecke.** Jeder
 * Koerper der Szene kennt sein `y0`/`y1` (`bauformFuer`), und die Hoehen kommen
 * aus der Tabelle des Projekts (`src/three/ausstattung.ts`). Es wird also
 * nichts geraten, sondern gegen die EIGENE Hoehe jedes Kandidaten geprueft.
 *
 * Wo der Satz WOERTLICH gilt, gilt er weiter: ein frei in die Luft gesetzter
 * Punkt (eine neue Wand zeichnen, eine Hoehe zeigen) hat keine bekannte Hoehe.
 * Dafuer gibt es hier bewusst keine Funktion.
 *
 * DIE MATHEMATIK, OFFENGELEGT
 * `projiziere` (axo-zeichnen.js) rechnet mit dx = x−mx, dz = z−mz, dy = y−0,6:
 *
 *     xr = dx·cosA − dz·sinA        zr = dx·sinA + dz·cosA
 *     X  = ox + m·xr                Y  = oy + m·(zr·sinE − dy·cosE)
 *     p  = zr·cosE + dy·sinE        (Tiefe, nur zum Sortieren)
 *
 * Auf einer BEKANNTEN Hoehe y = h ist das geschlossen umkehrbar, ohne
 * Iteration:
 *
 *     xr = (X−ox)/m                 zr = ((Y−oy)/m + dy·cosE)/sinE
 *     dx = xr·cosA + zr·sinA        dz = −xr·sinA + zr·cosA
 *
 * Die Jacobi-Determinante von (dx,dz) → (X,Y) ist **m²·sinE — unabhaengig vom
 * Azimut**. Eindeutig umkehrbar fuer jeden Blickwinkel; entartet allein bei
 * sinE → 0. Kein Blickwinkel der Leiste entartet (el 0,50 bis 1,44); entartet
 * ist nur, was der Nutzer selbst herstellen kann, indem er das Blatt flach
 * kippt (`neigeMin` 0,10 → 1 px sind 75 cm Tiefe). Genau dort sperrt die
 * Oberflaeche das Ziehen — und sagt es, statt still zu verweigern.
 */

/**
 * Ab dieser Neigung ist ein Bildpunkt keine Auskunft mehr ueber die Tiefe (W7).
 *
 * GEMESSEN und nicht gewaehlt: bei el = 0,35 bedeutet 1 Bildpunkt rund 22 cm
 * Tiefe — mehr als vier Raster-Schritte (`EINRAST_RASTER_CM = 5`). Ein Zittern
 * der Hand von drei Pixeln legte das Stueck also zwei Drittel Meter weiter
 * hinten ab, ohne dass man es im Bild saehe. Zum Vergleich die Blicke der
 * Leiste: nord/sued 0,62 (13,0 cm/px), west 0,50 (14,7), plan 1,44 (7,7).
 * Alle vier liegen deutlich darueber; die Sperre trifft nur den flach
 * gekippten Sonderfall.
 */
export const NEIGUNG_MIN_ZIEHEN = 0.35

/** Der Tiefenfehler einer GERATENEN Hoehe, in Metern: h · cot(el).
 *
 *  Nicht Zierat, sondern die Begruendung dieses ganzen Moduls in einer Zeile —
 *  und die Gegenprobe des Gates rechnet damit: wer die Hoehe auf 0 raet, liegt
 *  bei einem Tisch (74 cm) um 1,04 m daneben, bei einem Schrank (200 cm) um
 *  2,80 m und bei einer Wandkrone (1,16 m) um 1,63 m. */
export function tiefenFehler(hoehe, el) {
  return hoehe * (Math.cos(el) / Math.sin(el))
}

/**
 * Ein Bildpunkt (X, Y) zurueck in die Welt, auf der bekannten Hoehe `h`.
 *
 * @param {{ox:number,oy:number,massstab:number,sinA:number,cosA:number,sinE:number,cosE:number,mitteX:number,mitteZ:number,mitteY:number}} kamera
 *        Die Groessen aus `erzeugeAxonometrie(...).kamera()` — eine Abschrift,
 *        kein Verweis: sie aendern sich bei jedem Bild.
 * @param {number} X Bildpunkt in CSS-Pixeln (links oben = 0,0)
 * @param {number} Y dito
 * @param {number} h Hoehe in METERN, auf der zurueckgerechnet wird
 * @returns {{x:number,z:number,tiefe:number}|null} Weltpunkt in Metern (x, z)
 *          und der Tiefenwert; `null`, wenn die Kamera entartet ist.
 */
export function umkehreAuf(kamera, X, Y, h) {
  const m = kamera.massstab
  // sinE === 0 hiesse: der Blick liegt exakt in der Grundebene. Dann bildet die
  // Projektion die ganze Tiefe auf EINE Bildzeile ab und ist nicht mehr
  // umkehrbar. `null` statt Unendlich: eine Zahl, die aus einer Division durch
  // (fast) Null faellt, saehe aus wie eine Auskunft.
  if (!(m > 1e-9) || Math.abs(kamera.sinE) < 1e-9) {
    return null
  }
  const dy = h - kamera.mitteY
  const xr = (X - kamera.ox) / m
  const zr = ((Y - kamera.oy) / m + dy * kamera.cosE) / kamera.sinE
  const dx = xr * kamera.cosA + zr * kamera.sinA
  const dz = -xr * kamera.sinA + zr * kamera.cosA
  return {
    x: dx + kamera.mitteX,
    z: dz + kamera.mitteZ,
    tiefe: zr * kamera.cosE + dy * kamera.sinE
  }
}

/** Liegt (x, z) im Vieleck? Strahlverfahren, wie `liegtIn` in `axo-zyklen.js`,
 *  aber auf der (x,z)-Ebene des Renderers statt auf (x,y) des Planers. */
function imVieleck(x, z, punkte) {
  let drin = false
  for (let i = 0, j = punkte.length - 1; i < punkte.length; j = i++) {
    const a = punkte[i]
    const b = punkte[j]
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) drin = !drin
  }
  return drin
}

/**
 * Wie weit OBEN auf der Strecke p0→p1 liegt der letzte Punkt im Vieleck?
 *
 * Rueckgabe ist der groesste Parameter t ∈ [0,1], an dem die Strecke das
 * Vieleck noch beruehrt, oder `null` bei keinem Treffer. Der GROESSTE, weil
 * die Tiefe entlang des Sehstrahls streng mit der Hoehe waechst
 * (p = [cosE·(Y−oy)/m + dy] / sinE, und sinE > 0): der hoechste getroffene
 * Punkt eines Koerpers ist der, der der Kamera am naechsten liegt — und damit
 * der, den man wirklich sieht.
 */
function obersterTreffer(p0, p1, punkte) {
  const dx = p1.x - p0.x
  const dz = p1.z - p0.z
  // Ein flacher Koerper (Matte: 2 cm) macht daraus fast einen Punkt. Dann ist
  // die Streckenrechnung numerisch wertlos und die Punktprobe die richtige.
  if (Math.hypot(dx, dz) < 1e-9) {
    return imVieleck(p1.x, p1.z, punkte) ? 1 : null
  }
  // Das obere Ende ist der beste denkbare Fall — liegt es drin, ist Schluss.
  if (imVieleck(p1.x, p1.z, punkte)) {
    return 1
  }
  let bestes = imVieleck(p0.x, p0.z, punkte) ? 0 : null
  for (let i = 0, j = punkte.length - 1; i < punkte.length; j = i++) {
    const a = punkte[j]
    const b = punkte[i]
    const ex = b.x - a.x
    const ez = b.z - a.z
    const nenner = dx * ez - dz * ex
    if (Math.abs(nenner) < 1e-12) continue // parallel
    const t = ((a.x - p0.x) * ez - (a.z - p0.z) * ex) / nenner
    const s = ((a.x - p0.x) * dz - (a.z - p0.z) * dx) / nenner
    if (t < 0 || t > 1 || s < 0 || s > 1) continue
    if (bestes === null || t > bestes) bestes = t
  }
  return bestes
}

/**
 * Welches AUSSTATTUNGS-Stueck liegt unter dem Bildpunkt (X, Y)?
 *
 * WARUM NICHT `isPointInPath` RUECKWAERTS und warum kein Farb-Puffer: gemessen
 * baut ein Bild 1638 Fuellungen auf (reiner JS-Anteil 1,71 ms). Sie zum Testen
 * noch einmal aufzubauen kostet denselben Preis bei JEDER Zeigerbewegung, auch
 * beim Klick ins Leere. Ein Farb-Puffer im Nebencanvas waere eine ZWEITE
 * Zeichenvorschrift — genau die zweite Wahrheit, die dieses Projekt verbietet.
 * Diese Rueckrechnung braucht 289 Strecke-gegen-Vieleck-Tests, gemessen unter
 * 0,1 ms, und laeuft ohne Canvas.
 *
 * NUR MOEBEL. Boden, Buehne und Wand liefern bewusst `null` — dort dreht der
 * Zug das Blatt, wie bisher. Eine Wand laesst sich rechnerisch ebenso treffen,
 * aber nicht sinnvoll ZIEHEN: der Klick auf ihre Krone liegt 1,63 m neben ihrem
 * Fusspunkt, und eine verschobene gemessene Ecke bricht den Rueckweg ins
 * Projekt (W5) hart ab. Eine Bedienung, die in einen abgelehnten Zustand
 * fuehrt, ist keine.
 *
 * @returns {{id:string, typ:string, tiefe:number, y0:number, y1:number, hoehe:number}|null}
 */
export function koerperUnter(szene, kamera, X, Y) {
  if (!szene || !kamera) return null
  let bester = null
  for (const k of szene.moebel || []) {
    if (!k.id) continue // ohne Rueckverweis kein Bearbeiten — lieber nichts
    const p0 = umkehreAuf(kamera, X, Y, k.y0)
    const p1 = umkehreAuf(kamera, X, Y, k.y1)
    if (!p0 || !p1) return null // entartete Kamera: fuer KEIN Stueck eine Aussage
    const t = obersterTreffer(p0, p1, k.punkte)
    if (t === null) continue
    const hoehe = k.y0 + (k.y1 - k.y0) * t
    const tiefe = p0.tiefe + (p1.tiefe - p0.tiefe) * t
    // Bei Mehrfachtreffern gewinnt der GROESSTE Tiefenwert. Das ist per
    // Konstruktion das, was zuletzt gemalt wurde (`oben.sort` nach `depth`) —
    // also das, was man sieht. Ein Stuhl unter einem Tisch bleibt so greifbar,
    // sobald man auf seine Lehnenseite zeigt statt auf die Platte.
    if (!bester || tiefe > bester.tiefe) {
      bester = { id: k.id, typ: k.typ, tiefe, y0: k.y0, y1: k.y1, hoehe }
    }
  }
  return bester
}
