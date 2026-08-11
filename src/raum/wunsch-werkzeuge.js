/**
 * DIE WERKZEUG-SCHICHT DES STIFTS (W17)
 * =====================================
 *
 * Der Nutzer umfährt einen Bereich und schreibt hinein, was daraus werden soll
 * („Badezimmer für 20 Personen"). Ein Sprachmodell übersetzt das in eine KETTE
 * VON WERKZEUGEN. Diese Datei ist die Schleuse dazwischen: sie prüft die Kette,
 * BEVOR irgendetwas den Plan berührt, und sie ist reine Rechnung — kein Netz,
 * kein Canvas, in node prüfbar.
 *
 * DIE EINE REGEL, AUS DER ALLES FOLGT
 * -----------------------------------
 * **Das Modell bekommt Hände, keine Feder.** Es schreibt keine Plandatei und
 * keine Koordinaten „irgendwohin" — es nennt Werkzeuge, die der Nutzer auch von
 * Hand bedienen könnte, mit Werten, die hier gegen die Wirklichkeit geprüft
 * werden. Was ein Mensch über die Bedienung nicht anrichten kann, kann das
 * Modell hier auch nicht anrichten.
 *
 * FAIL-CLOSED, UND ZWAR FÜR DIE GANZE KETTE
 * -----------------------------------------
 * Ein ungültiger Eintrag verwirft die KETTE, nicht nur sich selbst. Der Grund
 * steht in „Die NEUN Stellen einer Typ-Kette" (W3): der 2D-Zeichner ist
 * fail-open und malt für einen unbekannten Typ ein Rechteck, Blatt, 3D und
 * Export sind fail-closed. Ein halb angewandter Wunsch stünde also im Grundriss
 * und fehlte genau in dem Blatt, in dem er geäußert wurde. Halb ist hier
 * schlimmer als gar nicht.
 *
 * WARUM ZAHLEN-GRENZEN KEINE PEDANTERIE SIND
 * ------------------------------------------
 * Gemessen an der ausgelieferten Datei (Adversarial-Befund zu W1-W3):
 * `x = null` oder `'abc'` erzeugt NaN-Geometrie, `x = 1e8` wirft RangeError,
 * `x = 1e12` friert den Tab 68 Sekunden ein. Diese Werte muss kein Angreifer
 * einschleusen — ein Sprachmodell kann sie schlicht halluzinieren. Jede Zahl
 * geht darum durch `zahl()`.
 *
 * DIE TYPEN-LISTE IST EINE BEWACHTE DOPPELUNG
 * -------------------------------------------
 * Sie steht hier ein zweites Mal (Urfassung: `AusstattungTyp` in
 * `src/model/floorplan.ts`). Ein `import` über die Bündel-Grenze wäre in der
 * Doppelklick-Datei still `undefined` — dieselbe Falle wie bei den Säulen.
 * `tools/pruefe-stift.mjs` vergleicht beide Listen und schlägt fehl, sobald
 * eine Art dazukommt oder wegfällt.
 */

/** Die 14 Arten, die der Plan zeichnen kann. Mehr gibt es nicht. */
export const WZ_TYPEN = [
  'tisch', 'rundtisch', 'stuhl', 'schrank', 'treppe', 'wc', 'waschbecken',
  'kochfeld', 'pflanze', 'aufzug', 'flaeche', 'matte', 'geraet', 'liege'
]

/** Die Belegungs-Muster, die `legeAus` kennt. */
export const WZ_NUTZUNGEN = ['yoga', 'kurs', 'training', 'behandlung', 'leer']

/** Die Öffnungsarten aus `OeffnungsArt`. */
export const WZ_OEFFNUNGEN = ['tuer', 'doppeltuer', 'fenster', 'durchgang']

/**
 * Grenzen in cm. Die Halle misst 78 × 15 m; alles jenseits dieser Grenzen ist
 * keine Planungsabsicht, sondern ein Rechenfehler.
 *
 * `MASS_MAX` ist bewusst grosszuegig (500 m) — es soll Unsinn abfangen, nicht
 * Planung einschraenken. Der enge Riegel ist der Ring: jedes Stueck muss IM
 * umfahrenen Bereich liegen, und der ist immer kleiner als die Halle.
 */
export const WZ_GRENZEN = {
  MASS_MIN: -50000,
  MASS_MAX: 50000,
  BREITE_MIN: 1,
  BREITE_MAX: 2000,
  ANZAHL_MAX: 400,
  KETTE_MAX: 60,
  TEXT_MAX: 500
}

/**
 * Eine Zahl, oder `null`.
 *
 * Streng: kein `parseFloat` auf Zeichenketten. `parseFloat('3 Meter')` gibt 3
 * zurueck und macht aus einem Missverstaendnis eine Koordinate. Wer eine Zahl
 * meint, schickt eine Zahl.
 */
export function wzZahl(wert, min = WZ_GRENZEN.MASS_MIN, max = WZ_GRENZEN.MASS_MAX) {
  if (typeof wert !== 'number') return null
  if (!Number.isFinite(wert)) return null
  if (wert < min || wert > max) return null
  return wert
}

/** Ein Text, gekappt und ohne Steuerzeichen. */
export function wzText(wert, max = WZ_GRENZEN.TEXT_MAX) {
  if (typeof wert !== 'string') return ''
  // eslint-disable-next-line no-control-regex
  return wert.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max)
}

/** Punkt-in-Vieleck, Strahlverfahren. Rand zaehlt als drinnen. */
export function wzImRing(p, ring) {
  if (!Array.isArray(ring) || ring.length < 3) return false
  let drin = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (!a || !b) return false
    const schneidet = (a.y > p.y) !== (b.y > p.y)
    if (!schneidet) continue
    const x = ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    if (p.x < x) drin = !drin
  }
  return drin
}

/**
 * Die Werkzeuge, ihre Pflichtfelder und ihre Prüfung.
 *
 * Jeder Eintrag gibt `{ok:true, wirkung:'<Satz>'}` oder `{ok:false,
 * grund:'<Satz>'}` zurueck. Der Satz ist das, was der Nutzer in der Vorschau
 * liest — er wird NICHT anderswo noch einmal formuliert, damit Vorschau und
 * Ausfuehrung nicht auseinanderlaufen koennen (dieselbe Regel wie in W12).
 */
export const WZ_WERKZEUGE = {
  raum_auslegen: {
    pflicht: ['nutzung'],
    pruefe(a, welt) {
      if (!WZ_NUTZUNGEN.includes(a.nutzung)) {
        return { ok: false, grund: `"${a.nutzung}" ist keine bekannte Nutzung.` }
      }
      const anzahl = a.anzahl == null ? null : wzZahl(a.anzahl, 1, WZ_GRENZEN.ANZAHL_MAX)
      if (a.anzahl != null && anzahl === null) {
        return { ok: false, grund: `Die Anzahl "${a.anzahl}" ist keine brauchbare Zahl.` }
      }
      return {
        ok: true,
        wirkung: anzahl
          ? `Bereich als "${a.nutzung}" auslegen, hoechstens ${anzahl} Stueck`
          : `Bereich als "${a.nutzung}" auslegen, so viel wie hineinpasst`
      }
    }
  },

  stueck_setzen: {
    pflicht: ['typ', 'x', 'y'],
    pruefe(a, welt) {
      if (!WZ_TYPEN.includes(a.typ)) {
        return {
          ok: false,
          grund:
            `"${a.typ}" ist keine Art, die dieser Plan zeichnen kann. ` +
            `Es gibt nur: ${WZ_TYPEN.join(', ')}.`
        }
      }
      const x = wzZahl(a.x)
      const y = wzZahl(a.y)
      if (x === null || y === null) {
        return { ok: false, grund: `Die Stelle (${a.x}/${a.y}) ist keine brauchbare Koordinate.` }
      }
      // DER RING IST DER EIGENTLICHE RIEGEL: der Nutzer hat einen Bereich
      // bestimmt, und nur dort darf etwas entstehen. Ein Stueck ausserhalb
      // waere eine Aenderung, um die niemand gebeten hat.
      if (welt && welt.ring && !wzImRing({ x, y }, welt.ring)) {
        return { ok: false, grund: `Diese Stelle liegt ausserhalb des umfahrenen Bereichs.` }
      }
      const drehung = a.drehung == null ? 0 : wzZahl(a.drehung, -360, 360)
      if (a.drehung != null && drehung === null) {
        return { ok: false, grund: `Die Drehung "${a.drehung}" ist kein brauchbarer Winkel.` }
      }
      return { ok: true, wirkung: `${a.typ} bei ${Math.round(x)}/${Math.round(y)} cm hinstellen` }
    }
  },

  wand_zeichnen: {
    pflicht: ['x1', 'y1', 'x2', 'y2'],
    pruefe(a, welt) {
      const p = [wzZahl(a.x1), wzZahl(a.y1), wzZahl(a.x2), wzZahl(a.y2)]
      if (p.some((v) => v === null)) {
        return { ok: false, grund: `Die Wand hat keine brauchbaren Endpunkte.` }
      }
      const [x1, y1, x2, y2] = p
      const laenge = Math.hypot(x2 - x1, y2 - y1)
      if (laenge < 10) {
        return { ok: false, grund: `Diese Wand waere ${Math.round(laenge)} cm lang — das ist keine Wand.` }
      }
      if (welt && welt.ring) {
        const a1 = wzImRing({ x: x1, y: y1 }, welt.ring)
        const a2 = wzImRing({ x: x2, y: y2 }, welt.ring)
        if (!a1 || !a2) {
          return { ok: false, grund: `Die Wand reicht aus dem umfahrenen Bereich heraus.` }
        }
      }
      // DAS AUFMASS. Ein Endpunkt naeher als die Fang-Toleranz an einer
      // gemessenen Ecke loest `combineWithCorner` aus: die gemessene Ecke wird
      // absorbiert und GELOESCHT (src/model/corner.ts:292-307). Ueber das
      // Aufmass entscheidet allein die PDF — deshalb hier, VOR der Ausfuehrung.
      const fang = (welt && welt.fangToleranz) || 20
      for (const e of (welt && welt.gemesseneEcken) || []) {
        for (const [px, py] of [[x1, y1], [x2, y2]]) {
          if (Math.hypot(e.x - px, e.y - py) < fang) {
            return {
              ok: false,
              grund:
                `Diese Wand endet ${Math.round(Math.hypot(e.x - px, e.y - py))} cm neben einer ` +
                `GEMESSENEN Ecke. Sie wuerde das Aufmass veraendern — darueber ` +
                `entscheidet nur die PDF.`
            }
          }
        }
      }
      return {
        ok: true,
        wirkung: `Wand ziehen, ${Math.round(laenge)} cm lang`
      }
    }
  },

  oeffnung_setzen: {
    pflicht: ['wandId', 'art', 'breite', 'lage'],
    pruefe(a, welt) {
      if (!WZ_OEFFNUNGEN.includes(a.art)) {
        return { ok: false, grund: `"${a.art}" ist keine Oeffnungsart.` }
      }
      const wand = ((welt && welt.waende) || []).find((w) => w.id === a.wandId)
      if (!wand) {
        return { ok: false, grund: `Die Wand "${a.wandId}" gibt es nicht (mehr).` }
      }
      const breite = wzZahl(a.breite, WZ_GRENZEN.BREITE_MIN, WZ_GRENZEN.BREITE_MAX)
      const lage = wzZahl(a.lage, 0, WZ_GRENZEN.MASS_MAX)
      if (breite === null || lage === null) {
        return { ok: false, grund: `Breite oder Lage der Oeffnung sind keine brauchbaren Masse.` }
      }
      return { ok: true, wirkung: `${a.art} (${Math.round(breite)} cm) in eine Wand setzen` }
    }
  },

  stueck_entfernen: {
    pflicht: ['id'],
    pruefe(a, welt) {
      const stueck = ((welt && welt.moebel) || []).find((m) => m.id === a.id)
      if (!stueck) {
        return { ok: false, grund: `Das Stueck "${a.id}" gibt es nicht (mehr).` }
      }
      // Ein GEMESSENES Stueck zu entfernen ist eine Aussage ueber das Aufmass.
      if ((stueck.quelle ?? 'gemessen') === 'gemessen') {
        return {
          ok: false,
          grund: `"${a.id}" ist ein gemessenes Stueck — es wird nicht auf Zuruf entfernt.`
        }
      }
      return { ok: true, wirkung: `${stueck.typ ?? 'Stueck'} entfernen` }
    }
  }
}

/**
 * Prüft eine ganze Kette. Gibt IMMER eine Antwort in Alltagssprache zurück —
 * ein „ungültig" ohne Grund wäre für den Nutzer dasselbe wie ein Absturz.
 *
 * @param {{werkzeuge?:Array, annahme?:string, antwort?:string}} kette
 * @param {{ring?:Array, waende?:Array, moebel?:Array, gemesseneEcken?:Array}} welt
 */
export function pruefeKette(kette, welt) {
  if (!kette || typeof kette !== 'object') {
    return { gueltig: false, grund: 'Es kam keine Antwort zurueck.', wirkung: [] }
  }

  const schritte = Array.isArray(kette.werkzeuge) ? kette.werkzeuge : null
  if (!schritte || schritte.length === 0) {
    return {
      gueltig: false,
      grund: wzText(kette.antwort) || 'Dazu ist kein Vorschlag entstanden.',
      wirkung: []
    }
  }
  if (schritte.length > WZ_GRENZEN.KETTE_MAX) {
    return {
      gueltig: false,
      grund: `Der Vorschlag hat ${schritte.length} Schritte — mehr als ${WZ_GRENZEN.KETTE_MAX} ` +
        `sind fuer einen Wunsch nicht plausibel.`,
      wirkung: []
    }
  }

  // Die ANNAHME ist Pflicht, sobald Stueckzahlen im Spiel sind. Sie ist der
  // Satz, der aus einer geratenen Zahl eine offengelegte macht. Es gibt
  // bewusst KEIN Feld fuer eine Norm: eine erfundene DIN-Nummer waere
  // schlimmer als eine offene Annahme, weil sie belegt aussieht.
  const annahme = wzText(kette.annahme)

  const wirkung = []
  for (let i = 0; i < schritte.length; i++) {
    const s = schritte[i]
    if (!s || typeof s !== 'object' || typeof s.werkzeug !== 'string') {
      return { gueltig: false, grund: `Schritt ${i + 1} ist kein Werkzeug-Aufruf.`, wirkung: [] }
    }
    const wz = WZ_WERKZEUGE[s.werkzeug]
    if (!wz) {
      return {
        gueltig: false,
        grund: `Schritt ${i + 1} ruft "${s.werkzeug}" — das ist kein Werkzeug dieses Plans.`,
        wirkung: []
      }
    }
    const args = s.args && typeof s.args === 'object' ? s.args : {}
    for (const feld of wz.pflicht) {
      if (args[feld] === undefined) {
        return {
          gueltig: false,
          grund: `Schritt ${i + 1} ("${s.werkzeug}") fehlt die Angabe "${feld}".`,
          wirkung: []
        }
      }
    }
    const urteil = wz.pruefe(args, welt || {})
    if (!urteil.ok) {
      return { gueltig: false, grund: `Schritt ${i + 1}: ${urteil.grund}`, wirkung: [] }
    }
    wirkung.push(urteil.wirkung)
  }

  // Die GEPRUEFTE Kette geht mit zurueck — und zwar genau hier, am Ende der
  // Pruefung. Sie erst beim Aufrufer wieder anzuhaengen hiesse, dass irgendwo
  // eine ungepruefte Kette neben einer geprueften Beschreibung liegt; wer die
  // beiden verwechselt, wendet Ungeprueftes an. Gemessen: ohne dieses Feld
  // meldete die Bedienung "Uebernommen — 0 Stueck hingestellt".
  return { gueltig: true, grund: null, wirkung, annahme, werkzeuge: schritte }
}

/** Nur fuer die Pruefwerkzeuge. */
export const _wzPruefzugang = { wzImRing, wzZahl, wzText }
