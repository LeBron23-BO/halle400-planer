/**
 * AXONOMETRIE — RENDERER (X2)
 * ===========================
 *
 * Malt eine Szene aus `axo-szene.js` auf ein Canvas-2D. Kein three.js, kein
 * SVG, keine fremde Bibliothek — genau wie die Vorlage `uebersicht.html`. Das
 * ist der Grund, warum die Bank-Datei damit von 2,0 MB auf einen Bruchteil
 * faellt: die 2 MB waren three.js.
 *
 * Der Renderer kennt nur das Canvas. Blattkopf, Saeulen-Tafel und
 * Bedienleiste sind DOM und gehoeren der jeweiligen Huelle — im Planer der
 * React-Ansicht, in der Bank-Datei dem erzeugten HTML. So bleibt EIN Renderer
 * fuer beide Auslieferungen.
 */

import { PALETTE, SCHRIFT, BLICK_START, LICHT, SCHATTEN, DARSTELLUNG, BESCHRIFTUNG, SAEULEN } from './axo-kontrakt.js'
import { CM } from './axo-kontrakt.js'
import { projiziereAuf, umkehreAuf, koerperUnter, NEIGUNG_MIN_ZIEHEN } from './axo-treffer.js'

/** Flaechenhelligkeit aus dem Winkel zum Streiflicht. [uebersicht.html:560] */
/** Hex nach [r,g,b]. */
function zahlen(hex) {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

/**
 * @param {string} hex Grundfarbe des Materials
 * @param {number[]} n Flaechennormale
 * @param {number[]|null} [zurueck] Ton, ZU DEM hin aufgehellt wird — gesetzt
 *        heisst: dieses Stueck tritt zurueck (M1). `null` = unveraendert.
 */
function toenen(hex, n, zurueck) {
  const d = LICHT[0] * n[0] + LICHT[1] * n[1] + LICHT[2] * n[2]
  const k = SCHATTEN.grund + SCHATTEN.streif * Math.max(0, d)
  const rgb = zahlen(hex)
  /**
   * FREI GESETZT wird ZUM BLATTGRUND hin gemischt (M1) — nicht umgefaerbt.
   *
   * Zum Buehnengrund und nicht zu Weiss und schon gar nicht zu einer
   * Signalfarbe: die Farbfamilie des Stuecks bleibt erkennbar (ein Tisch bleibt
   * hoelzern, eine Liege blaugrau), es tritt nur zurueck. Das ist die Sprache
   * dieses Blattes — ein oranger Klecks waere eine Warnung, und gemeint ist
   * keine Warnung, sondern „nicht gesichert". Im dunklen Thema mischt dieselbe
   * Rechnung zum dunklen Grund und hellt also ab; „zurueck" stimmt in beiden
   * Faellen, „heller" nur in einem.
   */
  const c = (v, i) => {
    const gemischt = zurueck ? v + (zurueck[i] - v) * DARSTELLUNG.gesetztRueckzug : v
    return Math.max(0, Math.min(255, Math.round(gemischt * k)))
  }
  return `rgb(${c(rgb[0], 0)},${c(rgb[1], 1)},${c(rgb[2], 2)})`
}

/**
 * Erzeugt eine Axonometrie auf dem uebergebenen Canvas.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {object} szeneEingang Ergebnis von `baueSzene`
 * @param {{dunkel?:boolean, namen?:'alle'|'knapp'|'saeulen'|'aus', randRechts?:number,
 *          randOben?:number, bearbeitung?:{
 *            aktiv:()=>boolean,
 *            greife:(id:string,weltX:number,weltY:number)=>boolean,
 *            ziehe:(weltX:number,weltY:number)=>object|null,
 *            lassLos:()=>void,
 *            zuFlach?:(el:number)=>void
 *          }}} [opt]
 *        `bearbeitung` ist OPTIONAL (W7). Ohne sie ist das Blatt genau das,
 *        was es immer war: ein Fenster. Mit ihr laesst sich ein Moebel darin
 *        greifen — die Huelle sagt, was daraus im Modell wird; der Renderer
 *        sagt nur, WO im Weltmass gegriffen wurde. Masse in ZENTIMETERN, weil
 *        das Modell des Planers so rechnet.
 */
export function erzeugeAxonometrie(canvas, szeneEingang, opt = {}) {
  const ctx = canvas.getContext('2d')
  /* Die Szene ist seit W7 AUSTAUSCHBAR (`setzeSzene`). Vorher war sie der
     Parameter und damit fest: wer ein neues Bild brauchte, musste einen zweiten
     Renderer auf demselben Canvas erzeugen — und weil der seine Zeiger-Abos nie
     abmeldete, stapelten sie sich (B3). Gemessen: nach drei Neubauten drehte
     ein Zug viermal so schnell. */
  let szene = szeneEingang
  const blick = { ...BLICK_START, schiebX: 0, schiebY: 0 }
  /* Ein einziger Abbruch-Griff fuer ALLE Abos dieses Renderers. Ohne ihn gibt
     es keinen Weg, einen Renderer wieder loszuwerden — `removeEventListener`
     braeuchte die Funktionsreferenzen, und die liegen hier drin. */
  const abbruch = new AbortController()
  const amCanvas = (typ, hoerer, weiter) =>
    canvas.addEventListener(typ, hoerer, { ...(weiter || {}), signal: abbruch.signal })
  let breite = 0
  let hoehe = 0
  let dunkel = !!opt.dunkel
  let namenModus = opt.namen || 'alle'
  /* Was aus der Namensschicht des LETZTEN Bildes geworden ist. Ein Name, fuer
     den kein lesbarer Platz blieb, wird weggelassen — und darf dabei nicht
     still verschwinden: wer das Blatt einer Bank vorlegt, muss beantworten
     koennen, ob darauf alle Namen stehen. Darum eine Zahl statt eines Gefuehls. */
  let namenBilanz = { gemalt: 0, ausgelassen: 0 }
  let randRechts = opt.randRechts || 0
  let schnell = false
  let farben = dunkel ? PALETTE.dunkel : PALETTE.hell

  /**
   * ALLE Projektionsgroessen in EINEM Objekt, bei jedem Bild neu befuellt.
   *
   * Vorher waren es sieben einzelne `let` in diesem Verschluss, und die
   * Projektion war hier ausgeschrieben. Beides zusammen war der Grund, warum
   * niemand von aussen einen Bildpunkt zurueckrechnen konnte (B2). Jetzt steht
   * die Rechnung in `axo-treffer.js` — Hin und Zurueck aus einer Quelle — und
   * dieses Objekt ist ihr Zustand. WIEDERVERWENDET und nicht je Aufruf neu:
   * `projiziere` laeuft rund 8000-mal je Bild.
   *
   * `mitteY` ist die Drehachse auf halber Schnitthoehe [uebersicht.html:546].
   */
  const kameraWerte = {
    sinA: 0,
    cosA: 0,
    sinE: 0,
    cosE: 0,
    massstab: 1,
    ox: 0,
    oy: 0,
    mitteX: 0,
    mitteZ: 0,
    mitteY: 0.6
  }
  let silhouette = { y0: 0, y1: 0 }

  function projiziere(x, y, z) {
    return projiziereAuf(kameraWerte, x, y, z)
  }

  function kameraRichtung() {
    return [kameraWerte.cosE * kameraWerte.sinA, kameraWerte.sinE, kameraWerte.cosE * kameraWerte.cosA]
  }

  /**
   * ALLE Groessen, die `projiziere` benutzt — als schlichtes Objekt (W7).
   *
   * WARUM DAS EIN BEFUND WAR: bis hierher blieben `ox/oy/massstab/sinA/sinE`
   * in diesem Verschluss eingesperrt. Eine Huelle konnte damit keinen einzigen
   * Bildpunkt zurueckrechnen — nicht, weil die Rechnung fehlte, sondern weil
   * ihre Zahlen niemand herausgab. Ohne sie gibt es kein Bearbeiten in dieser
   * Ansicht, und mit ihnen ist es eine geschlossene Formel (`umkehreAuf`).
   *
   * Eine ABSCHRIFT und keine Referenz: die Werte werden bei jedem Bild neu
   * gesetzt, ein gehaltenes Objekt waere sonst nach der naechsten Drehung eine
   * Luege ueber die Kamera.
   */
  function kamera() {
    return { ...kameraWerte, richtung: kameraRichtung() }
  }

  /** Massstab so, dass der ganze Baukoerper ins Bild passt — bei jeder Drehung. */
  function setzeKamera() {
    kameraWerte.sinA = Math.sin(blick.az)
    kameraWerte.cosA = Math.cos(blick.az)
    kameraWerte.sinE = Math.sin(blick.el)
    kameraWerte.cosE = Math.cos(blick.el)
    kameraWerte.massstab = 1
    kameraWerte.ox = 0
    kameraWerte.oy = 0
    // Die Szene ist austauschbar (`setzeSzene`) — ihre Mitte gehoert deshalb in
    // jedes Bild neu geschrieben und nicht einmal beim Erzeugen.
    kameraWerte.mitteX = szene.mitte.x
    kameraWerte.mitteZ = szene.mitte.z
    const g = szene.grenzen
    let ux0 = Infinity
    let ux1 = -Infinity
    let uy0 = Infinity
    let uy1 = -Infinity
    for (let i = 0; i < 8; i++) {
      const p = projiziere(i & 1 ? g.x1 : g.x0, i & 2 ? szene.hoechster : 0, i & 4 ? g.z1 : g.z0)
      ux0 = Math.min(ux0, p.x)
      ux1 = Math.max(ux1, p.x)
      uy0 = Math.min(uy0, p.y)
      uy1 = Math.max(uy1, p.y)
    }
    const weit = breite > 900
    const randX = weit ? 62 : 16
    const reihen = namenModus === 'saeulen' ? BESCHRIFTUNG.reihenSaeulen : BESCHRIFTUNG.reihenVoll
    const abstand = weit ? BESCHRIFTUNG.reiheBreit : BESCHRIFTUNG.reiheSchmal
    const randOben = namenModus === 'aus' ? 70 : weit ? 150 : 52 + reihen * abstand
    const randUnten = namenModus === 'aus' ? 96 : weit ? 168 : 86 + reihen * abstand
    const platzB = Math.max(120, breite - 2 * randX - (weit ? randRechts : 0))
    const platzH = Math.max(120, hoehe - randOben - randUnten)
    const grund = Math.min(platzB / Math.max(0.001, ux1 - ux0), platzH / Math.max(0.001, uy1 - uy0))
    const m = grund * blick.zoom
    kameraWerte.massstab = m
    /* ── DIE WEICHE LEINE (H2) ───────────────────────────────────────────
       Hier und nirgends sonst, weil HIER die projizierte Groesse des Modells
       in Bildpunkten bekannt ist — ausserhalb muesste man sie nachrechnen und
       haette eine zweite Wahrheit ueber die Einpassung.

       WARUM UEBERHAUPT: mit der neuen Zoom-Obergrenze ist das Modell bis zu
       9000 Bildpunkte breit. Ein Finger schiebt am Telefon jetzt frei — ohne
       Grenze ist das Blatt nach zwei Wischern aus der Anzeige heraus, und der
       Betrachter sieht leeres Papier ohne zu wissen, wohin. Kein Kaefig: die
       Grenze laesst jeden Rand des Modells erreichen und haelt nur immer
       mindestens `schubRand` Bildpunkte davon im Bild. */
    const modellB = (ux1 - ux0) * m
    const modellH = (uy1 - uy0) * m
    const maxX = Math.max(0, (modellB + breite) / 2 - DARSTELLUNG.schubRand)
    const maxY = Math.max(0, (modellH + hoehe) / 2 - DARSTELLUNG.schubRand)
    blick.schiebX = Math.max(-maxX, Math.min(maxX, blick.schiebX))
    blick.schiebY = Math.max(-maxY, Math.min(maxY, blick.schiebY))
    const cxp = ((ux0 + ux1) / 2) * m
    const cyp = ((uy0 + uy1) / 2) * m
    kameraWerte.ox = (weit ? (breite - randRechts) / 2 : breite / 2) - cxp + blick.schiebX
    kameraWerte.oy = randOben + (hoehe - randOben - randUnten) / 2 - cyp + blick.schiebY
    silhouette = { y0: uy0 * m + kameraWerte.oy, y1: uy1 * m + kameraWerte.oy }
  }

  /**
   * Zerlegt ein Prisma in sichtbare Flaechen: den Deckel und die Seiten, die
   * der Kamera zugewandt sind. Der Boden entfaellt — er ist nie zu sehen.
   */
  function flaechenVon(k, richtung, raus) {
    // Puppenhaus-Schnitt: die kameraseitige Aussenwand faellt weg und gibt den
    // Blick in die Raeume frei.                       [uebersicht.html:573]
    if (k.normale) {
      const d = k.normale[0] * richtung[0] + k.normale[1] * richtung[1] + k.normale[2] * richtung[2]
      if (d > DARSTELLUNG.schnittSchwelle) return
    }
    const farbe = farben[k.material] || farben.wand
    // M1: frei Gesetztes tritt zum Blattgrund hin zurueck und bekommt eine
    // gestrichelte Kontur. Der Ton kommt aus der GELADENEN Palette, nicht aus
    // einer Konstanten — sonst haette das dunkle Thema einen hellen Fleck.
    const zurueck = k.gesetzt ? zahlen(farben.buehneOben) : null
    const p = k.punkte
    const n = p.length

    // Deckel
    const oben = p.map((q) => projiziere(q.x, k.y1, q.z))
    if (richtung[1] > 0.001) {
      let tiefe = 0
      for (const q of oben) tiefe += q.p
      // `id` reicht den Rueckverweis bis in die gemalte Flaeche durch (W7):
      // wer eine Flaechenliste in der Hand hat, kann seither sagen, zu WELCHEM
      // Stueck sie gehoert. Kostet ein Feld je Flaeche und macht den Malvorgang
      // nachpruefbar.
      raus.push({ id: k.id, pts: oben, col: toenen(farbe, [0, 1, 0], zurueck), depth: tiefe / n, gesetzt: !!k.gesetzt })
    }

    if (k.istBoden) return // Boeden sind flach; ihre Kanten lohnen nicht

    // Seitenflaechen
    let sx = 0
    let sz = 0
    for (const q of p) {
      sx += q.x
      sz += q.z
    }
    sx /= n
    sz /= n
    for (let i = 0; i < n; i++) {
      const a = p[i]
      const b = p[(i + 1) % n]
      const ex = b.x - a.x
      const ez = b.z - a.z
      const len = Math.hypot(ex, ez) || 1
      let nx = ez / len
      let nz = -ex / len
      // Normale nach aussen drehen: sie muss vom Schwerpunkt wegzeigen.
      if (nx * ((a.x + b.x) / 2 - sx) + nz * ((a.z + b.z) / 2 - sz) < 0) {
        nx = -nx
        nz = -nz
      }
      if (nx * richtung[0] + nz * richtung[2] <= 0.001) continue
      const q = [
        projiziere(a.x, k.y1, a.z),
        projiziere(b.x, k.y1, b.z),
        projiziere(b.x, k.y0, b.z),
        projiziere(a.x, k.y0, a.z)
      ]
      raus.push({
        id: k.id,
        pts: q,
        col: toenen(farbe, [nx, 0, nz], zurueck),
        depth: (q[0].p + q[1].p + q[2].p + q[3].p) / 4,
        gesetzt: !!k.gesetzt
      })
    }
  }

  function maleFlaechen(liste) {
    const kanten = kameraWerte.massstab > DARSTELLUNG.kanteAbMassstab
    ctx.lineJoin = 'round'
    for (const f of liste) {
      const p = f.pts
      ctx.beginPath()
      ctx.moveTo(p[0].x, p[0].y)
      for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y)
      ctx.closePath()
      ctx.fillStyle = f.col
      ctx.fill()
      /* M1 — die KONTUR sagt es zweimal. Der aufgehellte Ton allein traegt
         nicht: er verschwindet in der Ferne, hinter einer Wand und auf einem
         schwarz-weissen Ausdruck. Gestrichelt heisst in jeder Bauzeichnung
         „nicht gesichert" — dieselbe Sprache wie im Grundriss (dort
         `GESETZT_STRICH`), nur feiner, weil hier viel mehr Kanten liegen.
         Und IMMER, nicht erst ab `kanteAbMassstab`: die Schwelle entscheidet,
         ob Kanten sich LOHNEN — ob eine Herkunft genannt wird, entscheidet
         sie nicht. */
      /* WAS IN DER HAND IST, MUSS MAN SEHEN (Handy-Welle). Diese Kante steht
         VOR der Herkunfts-Strichelung, und das ist Absicht: „gesetzt" ist eine
         Dauer-Aussage ueber das Stueck, „in der Hand" eine ueber den Augenblick
         — und im Augenblick des Greifens ist die zweite die dringendere. Sie
         gilt nur, solange der Finger liegt, danach malt derselbe Zweig wieder
         die Strichelung. Und IMMER, nicht erst ab `kanteAbMassstab`: die
         Schwelle entscheidet, ob Kanten sich LOHNEN — ob eine Hand gemeldet
         wird, entscheidet sie nicht. */
      if (greift && f.id === greift) {
        ctx.setLineDash([])
        ctx.strokeStyle = farben.tinte
        ctx.globalAlpha = 1
        ctx.lineWidth = DARSTELLUNG.griffKanteBreite
        ctx.stroke()
      } else if (f.gesetzt) {
        ctx.setLineDash(DARSTELLUNG.gesetztStrich)
        ctx.strokeStyle = farben.tinteMatt
        ctx.globalAlpha = DARSTELLUNG.gesetztKanteDeckkraft
        ctx.lineWidth = DARSTELLUNG.gesetztKanteBreite
        ctx.stroke()
        ctx.globalAlpha = 1
        ctx.setLineDash([])
      } else if (kanten) {
        ctx.strokeStyle = farben.tinte
        ctx.globalAlpha = DARSTELLUNG.kanteDeckkraft
        ctx.lineWidth = DARSTELLUNG.kanteBreite
        ctx.stroke()
        ctx.globalAlpha = 1
      }
    }
  }

  /**
   * Beschriftung mit Fuehrungslinien, wie auf dem Originalblatt.
   * Die Etiketten stehen AUSSERHALB des Baukoerpers, weichen einander in bis
   * zu drei Reihen aus und greifen mit einer geknickten Linie zum Anker.
   *                                                  [uebersicht.html:648]
   *
   * DREI STUFEN, ZWEI HEBEL. Die Schicht kann auf zwei voneinander
   * unabhaengige Arten schrumpfen, und beide werden gebraucht:
   *   `saeulen` nimmt ETIKETTEN weg (nur die hervorgehobenen Raeume),
   *   `knapp`   nimmt ZEILEN weg (jeder Raum, aber ohne seine Zusatzzeile).
   * Die Zusatzzeile ist die breiteste Zeile des Etiketts — „Typ unbelegt - der
   * Plan beschriftet dieses Zimmer nicht" ist dreimal so lang wie „Zimmer 23".
   * Sie wegzulassen halbiert nicht nur die Textmenge, sondern verschmaelert
   * jedes einzelne Etikett, und erst dadurch passen am dichten Gebaeudeende
   * wieder alle Namen nebeneinander. Auf einem Ausdruck, an dem niemand zoomen
   * kann, ist das der Unterschied zwischen lesbar und nicht.
   */
  function maleNamen() {
    let liste = szene.marken
    if (namenModus === 'saeulen') liste = liste.filter((m) => m.hervor)
    // Zaehlt IMMER neu: die Bilanz gehoert zum aktuellen Bild, nicht zur Sitzung.
    let gemalt = 0
    let ausgelassen = 0
    if (!liste.length) {
      namenBilanz = { gemalt: 0, ausgelassen: 0 }
      return
    }

    const weit = breite > 900
    const fs = weit ? BESCHRIFTUNG.schriftBreit : BESCHRIFTUNG.schriftSchmal
    const ss = weit ? BESCHRIFTUNG.zusatzBreit : BESCHRIFTUNG.zusatzSchmal
    const abstand = weit ? BESCHRIFTUNG.reiheBreit : BESCHRIFTUNG.reiheSchmal
    const anzahl = namenModus === 'saeulen' ? BESCHRIFTUNG.reihenSaeulen : BESCHRIFTUNG.reihenVoll
    const maxX = breite - (weit ? randRechts + 6 : 12)

    const mitZusatz = namenModus !== 'knapp'
    const posten = liste.map((m) => {
      const a = projiziere(m.x, 1.1, m.z)
      // Oben oder unten? Gegen die Gebaeudeachse an DERSELBEN Stelle pruefen,
      // nicht gegen die Bildmitte — der Riegel liegt schraeg im Bild. Die
      // gemessene Seite (nord/sued) hilft hier nicht: bei Blick von Sueden
      // liegt Nord oben, bei Blick von Norden unten. [uebersicht.html:661]
      const achse = projiziere(m.x, 1.1, szene.mitte.z)
      const s = m.saeule != null ? SAEULEN[m.saeule] : null
      return {
        m,
        a,
        oben: a.y < achse.y,
        name: m.hervor && s ? s.rolle.replace(/^(Der|Die|Das)\s+/, '') : m.text,
        // Ein leerer Zusatz ist unten schon der bekannte Fall „dieser Raum hat
        // keine zweite Zeile" — Breite, Linienansatz und Malen pruefen ihn
        // laengst. `knapp` braucht deshalb genau diese eine Stelle und keine
        // zweite Sonderbehandlung weiter unten.
        zusatz: mitZusatz ? (m.hervor && s ? `${s.n} · ${s.name}` : m.zusatz) : ''
      }
    })

    ctx.save()
    for (const richtung of ['oben', 'unten']) {
      const menge = posten.filter((o) => (richtung === 'oben' ? o.oben : !o.oben)).sort((p, q) => p.a.x - q.a.x)
      if (!menge.length) continue
      const reihen = []
      for (let i = 0; i < anzahl; i++) {
        reihen.push(
          richtung === 'oben'
            ? Math.max(weit ? 64 : 34, silhouette.y0 - BESCHRIFTUNG.abstandOben - i * abstand)
            : Math.min(hoehe - (weit ? 74 : 96), silhouette.y1 + BESCHRIFTUNG.abstandUnten + i * abstand)
        )
      }
      // Der Blattkopf sperrt links — aber nur, wenn die Etiketten wirklich auf
      // seiner Hoehe liegen, sonst zerrt es die Linien unnoetig in die Laenge.
      const minX = richtung === 'oben' && weit && Math.min(...reihen) < 118 ? 352 : 14
      const belegt = reihen.map(() => -1e9)
      const gesetzt = []

      for (const o of menge) {
        ctx.font = `500 ${fs}px ${SCHRIFT.serif}`
        const wName = ctx.measureText(o.name).width
        ctx.font = `${ss}px ${SCHRIFT.mono}`
        o.breite = Math.max(wName, o.zusatz ? ctx.measureText(o.zusatz).width : 0)
        const wunsch = Math.max(minX + o.breite / 2, Math.min(maxX - o.breite / 2, o.a.x))
        /* AUSWEICHEN STATT UEBEREINANDER.
           Hier stand frueher am Ende `Math.min(maxX - breite/2, wunsch + schub)`.
           Genau diese Klammer war der unlesbare Klumpen am dichten Ende des
           Riegels: sind alle Reihen bis zum Blattrand voll, hat sie JEDES
           weitere Etikett auf dieselbe Stelle gesetzt — drei Namen und drei
           Zusatzzeilen uebereinander. Sie hat also nicht ausweichen lassen,
           sondern nur so getan.
           Jetzt zaehlt ein Platz erst, wenn er wirklich FREI ist. Gibt es
           keinen, faellt der Name weg und wird gezaehlt: ein fehlender Name
           ist eine Luecke, zwei uebereinander sind eine Falschaussage — und auf
           einem Blatt fuer eine Bank ist die Luecke die ehrlichere. */
        let platz = null
        for (let i = 0; i < reihen.length; i++) {
          const x = Math.max(wunsch, belegt[i] + BESCHRIFTUNG.lueckeMin + o.breite / 2)
          if (x + o.breite / 2 > maxX) continue
          if (x - wunsch > BESCHRIFTUNG.ankerMaxWeg) continue
          if (!platz || x - wunsch < platz.weg) platz = { reihe: i, x, weg: x - wunsch }
          // Die naechstgelegene Reihe ohne jedes Ausweichen schlaegt alles
          // Weitere — genau die Vorliebe, die diese Suche immer schon hatte.
          if (platz.weg === 0) break
        }
        if (!platz) {
          ausgelassen++
          continue
        }
        belegt[platz.reihe] = platz.x + o.breite / 2
        o.tx = platz.x
        o.ty = reihen[platz.reihe]
        o.linieY = richtung === 'oben' ? o.ty + (o.zusatz ? 16 : 6) : o.ty - 16
        gesetzt.push(o)
      }
      gemalt += gesetzt.length

      for (const o of gesetzt) {
        const knick =
          richtung === 'oben'
            ? Math.min(o.a.y - 10, o.linieY + BESCHRIFTUNG.knickWeg)
            : Math.max(o.a.y + 10, o.linieY - BESCHRIFTUNG.knickWeg)
        ctx.beginPath()
        ctx.strokeStyle = o.m.hervor ? farben.akzent : farben.haar
        ctx.lineWidth = o.m.hervor ? 1.1 : 0.85
        ctx.globalAlpha = o.m.hervor ? 0.95 : 0.7
        ctx.moveTo(o.tx, o.linieY)
        ctx.lineTo(o.tx, knick)
        ctx.lineTo(o.a.x, o.a.y)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(o.a.x, o.a.y, o.m.hervor ? BESCHRIFTUNG.punktSaeule : BESCHRIFTUNG.punktNormal, 0, 7)
        ctx.fillStyle = o.m.hervor ? farben.akzent : farben.haar
        ctx.fill()
        ctx.globalAlpha = 1

        ctx.textAlign = 'center'
        ctx.textBaseline = 'alphabetic'
        ctx.font = `500 ${fs}px ${SCHRIFT.serif}`
        ctx.fillStyle = o.m.hervor ? farben.akzent : farben.tinte
        ctx.fillText(o.name, o.tx, o.ty)
        if (o.zusatz) {
          ctx.font = `${ss}px ${SCHRIFT.mono}`
          ctx.fillStyle = o.m.hervor ? farben.akzent : farben.tinteMatt
          ctx.globalAlpha = o.m.hervor ? 0.9 : 0.65
          ctx.fillText(o.zusatz, o.tx, o.ty + 12)
          ctx.globalAlpha = 1
        }
      }
    }
    ctx.restore()
    /* Die einzige Konsolen-Zeile dieses Zeichners, und sie ist ihr Papier wert:
       ohne sie waere „weglassen" ein stiller Datenverlust. Nur bei AENDERUNG
       der Zahl und nicht waehrend eines Zuges — sonst schriebe ein Drehen
       hundert gleiche Zeilen und machte die Konsole unbrauchbar. Wer die Zahl
       jederzeit will, fragt `axo.namenBilanz`. */
    if (!schnell && ausgelassen !== namenBilanz.ausgelassen && ausgelassen > 0) {
      console.info(
        `Raumnamen: ${gemalt} gemalt, ${ausgelassen} ausgelassen — fuer sie blieb kein Platz, an dem sie lesbar stuenden.`
      )
    }
    namenBilanz = { gemalt, ausgelassen }
  }

  /** Amber-Rahmen um die Boeden der Saeulen-Raeume.  [uebersicht.html:635] */
  function maleSaeulenRahmen() {
    const marken = szene.marken.filter((m) => m.hervor)
    if (!marken.length) return
    ctx.save()
    ctx.lineWidth = 1.8
    ctx.strokeStyle = farben.akzent
    ctx.globalAlpha = 0.85
    for (const m of marken) {
      const raum = szene.raeume.find(
        (r, i) => i !== szene.flurIndex && punktInRaum(m.x, m.z, r.punkte)
      )
      if (!raum) continue
      ctx.beginPath()
      raum.punkte.forEach((q, i) => {
        const p = projiziere(q.x, 0.12, q.z)
        if (i === 0) ctx.moveTo(p.x, p.y)
        else ctx.lineTo(p.x, p.y)
      })
      ctx.closePath()
      ctx.stroke()
    }
    ctx.restore()
  }

  function punktInRaum(x, z, punkte) {
    let drin = false
    for (let i = 0, j = punkte.length - 1; i < punkte.length; j = i++) {
      const a = punkte[i]
      const b = punkte[j]
      if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) drin = !drin
    }
    return drin
  }

  function zeichne() {
    setzeKamera()
    const richtung = kameraRichtung()

    const g = ctx.createLinearGradient(0, 0, 0, hoehe)
    g.addColorStop(0, farben.buehneOben)
    g.addColorStop(1, farben.buehneUnten)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, breite, hoehe)

    // Boeden zuerst, in einem eigenen Durchgang. Sie sind grosse, teils
    // vielfach eingebuchtete Flaechen (die Erschliessung hat 46 Ecken) und
    // wuerden im gemeinsamen Tiefensortieren nach EINEM Mittelwert ganze
    // Moebelgruppen verdecken. Da sie flach am Boden liegen, kann nichts
    // hinter ihnen liegen — die Reihenfolge ist damit sachlich richtig.
    const unten = []
    for (const k of szene.boeden) flaechenVon(k, richtung, unten)
    unten.sort((a, b) => a.depth - b.depth)
    maleFlaechen(unten)

    const oben = []
    for (const k of szene.waende) flaechenVon(k, richtung, oben)
    if (!schnell) for (const k of szene.moebel) flaechenVon(k, richtung, oben)
    oben.sort((a, b) => a.depth - b.depth)
    maleFlaechen(oben)

    maleSaeulenRahmen()
    if (namenModus !== 'aus') maleNamen()
    else namenBilanz = { gemalt: 0, ausgelassen: 0 }
  }

  /**
   * Tauscht GENAU EINEN Ausstattungs-Koerper an Ort und Stelle und zeichnet neu
   * (W7).
   *
   * Der ganze Grund, warum ein Zug in dieser Ansicht fluessig sein kann:
   * `baueSzene` leitet Raeume ab, zerlegt Waende in Kacheln, versoehnt
   * Oeffnungen und baut 526 Koerper — gemessen 16,2 ms. Fuer ein verschobenes
   * Moebel ist davon alles ausser einem Vieleck umsonst.
   */
  function tauscheKoerper(id, koerper) {
    if (!id || !koerper || !szene?.moebel) return false
    const i = szene.moebel.findIndex((k) => k.id === id)
    if (i < 0) return false
    szene.moebel[i] = koerper
    zeichne()
    return true
  }

  function passeAn() {
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2)
    const kasten = canvas.getBoundingClientRect()
    breite = Math.max(1, Math.round(kasten.width))
    hoehe = Math.max(1, Math.round(kasten.height))
    canvas.width = Math.round(breite * dpr)
    canvas.height = Math.round(hoehe * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    zeichne()
  }

  /* ── Bedienung ───────────────────────────────────────────────────────
     AM RECHNER (Maus): Ziehen dreht, Umschalt+Ziehen schiebt, Rad zoomt.
     Unveraendert — das ist die Bedienung, mit der die Blaetter gebaut werden.

     AM TELEFON (Finger): EIN Finger SCHIEBT, ZWEI Finger zoomen um ihre Mitte
     und schieben dabei mit, Verdrehen der zwei Finger dreht.

     WARUM DER EINE FINGER SCHIEBT UND NICHT DREHT (H2, begruendet):
     Bis hierher drehte er — und das war am Telefon die falsche Wahl, aus einem
     messbaren Grund: die Grundeinpassung quetscht 78 m auf 358 Bildpunkte,
     also MUSS man weit hineinzoomen, um ein Zimmer zu sehen. Gemessen war das
     Blatt danach unbewegbar: ein Finger drehte, zwei Finger zoomten nur, und
     `schiebX`/`schiebY` blieben ueber jede Geste hinweg auf 0. Zoomen ohne
     Verschieben ist kein halbes Werkzeug, es ist gar keins — man landet in
     einer Zimmerecke und kommt nicht zum naechsten Zimmer.

     Und: Drehen hat am Telefon bereits einen zweiten Weg (die Knoepfe
     Nord/West/Sued/Plan und jetzt das Verdrehen), Schieben hatte KEINEN.
     Umschalt gibt es an keinem Telefon. Wer einen Grundriss ansieht, faehrt
     ausserdem ueber ihn hinweg wie ueber eine Karte; das Drehen ist der
     seltenere, bewusste Akt. Also bekommt der haeufige Akt die einfache
     Geste. */
  let zieht = false
  let lx = 0
  let ly = 0
  /* WOMIT gezogen wird, beim Aufsetzen festgehalten. Nicht bei jeder Bewegung
     neu gefragt: ein Zug, der auf halber Strecke die Bedeutung wechselte, waere
     keine Geste mehr. */
  let ziehArt = 'maus'
  let zeiger = new Map()
  let spanne = 0
  /* Die Fingermitte des letzten Ereignisses, in BILD-Koordinaten der Leinwand
     (nicht in Fenster-Koordinaten) — `projiziere` rechnet in diesen. */
  let mitteBX = 0
  let mitteBY = 0
  let winkelVor = 0
  /* Aufgelaufene Verdrehung, solange sie unter der Schwelle liegt. Sie wird
     bei der Schwelle FESTGEHALTEN und nicht nachgeholt: sonst spraenge das
     Blatt im Augenblick des Ueberschreitens um 12 Grad. */
  let drehStau = 0

  /* ══ MOEBEL GREIFEN (W7) ═══════════════════════════════════════════════
     Der TREFFER entscheidet, keine Zusatztaste: Druck auf einen Koerper
     greift, Druck auf Buehne, Boden oder Wand dreht wie bisher. Der
     Praezedenzfall ist die Schwenk-Sperre im Grundriss
     (`floorplanner.ts:1036`) — ohne sie wanderte das Moebel UND der Plan, und
     der Zug legte das Stueck gemessen doppelt so weit.

     Der Renderer kennt das MODELL nicht und soll es nicht kennen. Er meldet
     nur, WO im Weltmass gegriffen und gezogen wird; was daraus wird,
     entscheidet die Huelle ueber `opt.bearbeitung`. Ohne dieses Objekt
     verhaelt sich das Blatt exakt wie vorher — die Bank-Datei im
     Auslieferungszustand nimmt keinen Griff an. */
  const bearbeitung = opt.bearbeitung || null
  let greift = null // Kennung des Stuecks in der Hand
  let griffHoehe = 0 // Hoehe der ZIEH-EBENE, ueber den ganzen Zug fest
  let unterZeiger = null

  const bearbeitbar = () => !!bearbeitung && bearbeitung.aktiv()

  /** Bildpunkt in CSS-Pixeln, so wie `projiziere` sie liefert. */
  function amBild(e) {
    const r = canvas.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  /** Weltpunkt in ZENTIMETERN auf der Ziehebene — die Sprache des Planers. */
  function weltAuf(X, Y, h) {
    const p = umkehreAuf(kamera(), X, Y, h)
    return p ? { x: p.x / CM, y: p.z / CM } : null
  }

  const klemmeZoom = (z) => Math.max(DARSTELLUNG.zoomMin, Math.min(DARSTELLUNG.zoomMax, z))

  /** Lage der beiden Finger: Mitte in BILD-Koordinaten, Abstand, Winkel. */
  function fingerLage() {
    const v = [...zeiger.values()]
    const r = canvas.getBoundingClientRect()
    return {
      mx: (v[0][0] + v[1][0]) / 2 - r.left,
      my: (v[0][1] + v[1][1]) / 2 - r.top,
      d: Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]),
      w: Math.atan2(v[1][1] - v[0][1], v[1][0] - v[0][0])
    }
  }

  /**
   * ZOOMEN UND DREHEN UM EINEN BILDPUNKT (H2).
   *
   * Der Kern der Karten-Bedienung: was unter den Fingern liegt, bleibt unter
   * den Fingern. Vorher zoomte dieses Blatt um die Mitte seiner EINPASSUNG —
   * gemessen wanderte der angefasste Punkt bei einem einzigen Aufziehen um
   * 152 Bildpunkte weg, also mehr als eine Drittel-Anzeigenbreite. Man zielt
   * auf ein Zimmer und landet in einem anderen.
   *
   * KEINE zweite Projektionsformel, und das ist Absicht: der Punkt wird mit
   * `umkehreAuf` zurueckgerechnet, die Aenderung angewandt, und derselbe
   * Weltpunkt mit `projiziere` wieder vorwaerts gerechnet. Die Differenz ist
   * die noetige Verschiebung. Damit stimmt die Rechnung auch dann noch, wenn
   * sich im selben Augenblick der BLICKWINKEL mitdreht — eine ausgeschriebene
   * Zoom-Formel koennte das nicht, sie kennt nur den Massstab.
   *
   * Die Hoehe ist `mitteY`, die Drehachse des Blattes: auf dieser Ebene steht
   * der Punkt beim Drehen ohnehin am ruhigsten.
   */
  function haltePunkt(bx, by, aendere) {
    setzeKamera()
    const h = kameraWerte.mitteY
    const vorher = umkehreAuf(kamera(), bx, by, h)
    aendere()
    if (!vorher) return
    setzeKamera()
    const p = projiziere(vorher.x, h, vorher.z)
    blick.schiebX += bx - p.x
    blick.schiebY += by - p.y
  }

  /* ══ DIE ZANGE WIRD JE BILD AUSGEWERTET, NICHT JE EREIGNIS (H2) ═══════════
     GEMESSEN und nicht vermutet: der Browser meldet zwei Finger in ZWEI
     getrennten `pointermove`-Ereignissen. Im ersten steht der eine Finger schon
     auf der neuen Stelle und der andere noch auf der alten — der Abstand ist
     dort um den halben Schritt FALSCH. Rechnet man jedes Ereignis einzeln aus,
     zappelt der Zoom bei jedem Bild um rund 6 % hin und her.

     Unsichtbar bleibt das nur, solange nichts klemmt. AN DER ZOOM-GRENZE wird
     aus dem Zappeln eine Einbahnstrasse: der Schritt nach oben wird von
     `klemmeZoom` abgeschnitten, der Schritt nach unten nicht. Gemessen: zwei
     Finger, parallel verschoben, ohne jede Abstandsaenderung — der Zoom fiel
     von 24,00 auf 22,53. Das Blatt zoomte von selbst heraus, waehrend der
     Nutzer nur schob.

     Ein Bild, eine Auswertung: bis der Browser das naechste Bild zeichnet,
     sind BEIDE Finger frisch. Nebenbei halbiert es die Neuzeichnungen. */
  let zangeOffen = false
  const naechstesBild = (f) =>
    globalThis.requestAnimationFrame ? globalThis.requestAnimationFrame(f) : setTimeout(f, 16)

  function zangeAuswerten() {
    zangeOffen = false
    // Ein vorgemerktes Bild kann NACH `zerstoere` eintreffen. Dann zeichnete ein
    // abgemeldeter Renderer noch einmal auf eine Flaeche, die schon einem
    // anderen gehoert — dieselbe Klasse von Fehler wie die gestapelten Abos (B3).
    if (abbruch.signal.aborted) return
    if (zeiger.size !== 2) return
    const f = fingerLage()
    if (spanne) {
      /* ZUERST die Fingermitte: das Blatt faehrt mit der Hand mit, in reinen
         Bildpunkten und ohne Umweg. Das ist die Haelfte, die bisher ganz
         fehlte — gemessen blieb `schiebX` bei zwei parallel geschobenen
         Fingern auf 0,00, das Blatt stand einfach still. */
      blick.schiebX += f.mx - mitteBX
      blick.schiebY += f.my - mitteBY

      /* DANN Massstab und Blickwinkel, beides um genau den Punkt, der jetzt
         unter der Fingermitte liegt. Beides in EINEM `haltePunkt`, damit die
         Korrektur die Summe beider Aenderungen sieht und nicht zweimal
         nacheinander nachfaehrt. */
      let dw = f.w - winkelVor
      // Der Winkel springt bei ±π. Ohne diese zwei Zeilen dreht sich das
      // Blatt einmal um sich selbst, sobald die Finger die Senkrechte kreuzen.
      while (dw > Math.PI) dw -= 2 * Math.PI
      while (dw < -Math.PI) dw += 2 * Math.PI
      haltePunkt(f.mx, f.my, () => {
        blick.zoom = klemmeZoom(blick.zoom * (f.d / spanne))
        drehStau += dw
        const s = DARSTELLUNG.drehSchwelle
        if (Math.abs(drehStau) > s) {
          const ueber = drehStau - Math.sign(drehStau) * s
          blick.az -= ueber
          drehStau = Math.sign(drehStau) * s
        }
      })
      zeichne()
    }
    spanne = f.d
    mitteBX = f.mx
    mitteBY = f.my
    winkelVor = f.w
  }

  function zangeVormerken() {
    if (zangeOffen) return
    zangeOffen = true
    naechstesBild(zangeAuswerten)
  }

  /** Zeiger-Aussage: was liegt unter dem Zeiger, und wie sagt es der Zeiger? */
  function zeigerPflegen(treffer) {
    unterZeiger = treffer ? treffer.id : null
    /* Der Grund-Zeiger des Blattes ist bereits `grab` (Ziehen dreht) — ein
       zweites `grab` waere also keine Auskunft. `move` sagt, was hier anders
       ist: dieses Stueck laesst sich VERSETZEN. Inline gesetzt und beim
       Wegfahren wieder GELEERT, damit die Stilvorlage der Huelle wieder gilt
       (dieselbe Technik wie `zeigerStilSetzen` im Kern). */
    const stil = greift ? 'grabbing' : unterZeiger ? 'move' : ''
    if (canvas.style.cursor !== stil) canvas.style.cursor = stil
  }

  amCanvas('pointerdown', (e) => {
    zeiger.set(e.pointerId, [e.clientX, e.clientY])
    if (zeiger.size > 1) {
      zieht = false
      // Ein zweiter Finger beendet einen laufenden Griff: zwei Finger heissen
      // in diesem Blatt „zoomen", und beides zugleich waere keine Geste.
      if (greift) griffBeenden()
      /* Die Ausgangslage der Zange SOFORT festhalten, nicht erst bei der
         ersten Bewegung. Sonst waere der erste `pointermove` gegen eine
         Spanne von 0 gerechnet und das Blatt spraenge (gemessen als
         Zoom-Sprung beim Aufsetzen des zweiten Fingers). */
      if (zeiger.size === 2) {
        const f = fingerLage()
        spanne = f.d
        mitteBX = f.mx
        mitteBY = f.my
        winkelVor = f.w
        drehStau = 0
        /* Waehrend der Zange nur die grossen Flaechen zeichnen. Ein Aufziehen
           erzeugt 30 bis 60 Bilder; mit allen 289 Ausstattungs-Stuecken je Bild
           ruckelt genau die Geste, die sich fluessig anfuehlen soll. */
        schnell = true
      }
      return
    }
    if (bearbeitbar()) {
      const b = amBild(e)
      const treffer = koerperUnter(szene, kamera(), b.x, b.y)
      if (treffer) {
        /* DIE EHRLICHE GRENZE. Unter `NEIGUNG_MIN_ZIEHEN` bedeutet 1 Bildpunkt
           ueber 22 cm Tiefe — dort wird NICHT gezogen. Gesagt, nicht still
           verweigert: eine Bedienung, die manchmal wortlos nichts tut, ist
           schlimmer als eine, die es gar nicht gibt. */
        if (blick.el < NEIGUNG_MIN_ZIEHEN) {
          bearbeitung.zuFlach?.(blick.el)
        } else {
          const w = weltAuf(b.x, b.y, treffer.hoehe)
          if (w && bearbeitung.greife?.(treffer.id, w.x, w.y)) {
            greift = treffer.id
            // Die Ziehebene bleibt die des GRIFFS. Liefe sie mit der Hoehe des
            // Stuecks mit, veraenderte jedes Einrasten zugleich die Abbildung
            // Bild -> Welt, und das Stueck driftete unter dem Zeiger weg.
            griffHoehe = treffer.hoehe
            zeigerPflegen(treffer)
            /* Die Griff-Kante gehoert in DIESEN Augenblick, nicht erst in die
               erste Bewegung: am Handy will man wissen, dass man etwas hat,
               BEVOR man zieht — sonst wischt man versuchsweise und verschiebt
               dabei ein Stueck, das man nur pruefen wollte. */
            zeichne()
            try {
              canvas.setPointerCapture(e.pointerId)
            } catch (_) {
              /* aelterer Browser: der Zug endet dann am Rand der Flaeche */
            }
            return
          }
        }
      }
    }
    zieht = true
    schnell = true
    ziehArt = e.pointerType === 'touch' ? 'finger' : 'maus'
    lx = e.clientX
    ly = e.clientY
    try {
      canvas.setPointerCapture(e.pointerId)
    } catch (_) {
      /* aelterer Browser: Zeiger bleibt ungebunden, Drehen geht trotzdem */
    }
  })

  function griffBeenden() {
    if (!greift) return
    greift = null
    /* SOFORT neu malen, nicht erst beim naechsten Anlass. Die Griff-Kante ist
       eine Aussage ueber den Augenblick; der volle Neubau aus `lassLos` kommt
       erst nach der Ruhe-Frist (150 ms), und so lange stuende eine Hand im
       Bild, die es nicht mehr gibt. Am Handy ist das der einzige Unterschied
       zwischen „abgelegt" und „haengt noch". */
    zeichne()
    bearbeitung?.lassLos?.()
    zeigerPflegen(null)
  }

  amCanvas('pointermove', (e) => {
    if (zeiger.has(e.pointerId)) zeiger.set(e.pointerId, [e.clientX, e.clientY])
    if (zeiger.size === 2) {
      zangeVormerken()
      return
    }
    // --- Ein Stueck in der Hand: es folgt, das Blatt steht still (W7).
    if (greift) {
      const b = amBild(e)
      const w = weltAuf(b.x, b.y, griffHoehe)
      if (!w) return
      const neu = bearbeitung.ziehe?.(w.x, w.y)
      /* NUR den einen Koerper tauschen und neu zeichnen. `baueSzene` kostet
         gemessen 16,2 ms — bei jeder Zeigerbewegung waere das ein Ruckeln, das
         der Nutzer der Bank zurecht als „hakt" liest. Der volle Neubau kommt
         beim Loslassen. */
      if (neu) tauscheKoerper(greift, neu)
      return
    }
    // --- Nichts in der Hand: sagen, was greifbar waere.
    if (!zieht && bearbeitbar()) {
      const b = amBild(e)
      zeigerPflegen(koerperUnter(szene, kamera(), b.x, b.y))
    }
    if (!zieht) return
    const dx = e.clientX - lx
    const dy = e.clientY - ly
    lx = e.clientX
    ly = e.clientY
    /* EIN FINGER SCHIEBT — Umschalt gibt es am Telefon nicht, und Schieben ist
       dort die Geste, die man dauernd braucht (Begruendung oben am Block).
       Die Maus behaelt ihre alte Bedeutung, Zahl fuer Zahl. */
    if (ziehArt === 'finger' || e.shiftKey) {
      blick.schiebX += dx
      blick.schiebY += dy
    } else {
      blick.az -= dx * DARSTELLUNG.drehProPixel
      blick.el = Math.max(
        DARSTELLUNG.neigeMin,
        Math.min(DARSTELLUNG.neigeMax, blick.el + dy * DARSTELLUNG.neigeProPixel)
      )
    }
    zeichne()
  })

  const beenden = (e) => {
    /* Eine vorgemerkte Zangen-Auswertung NACHHOLEN, bevor der Finger aus der
       Liste faellt: sonst geht der letzte Schritt einer Geste verloren — genau
       der, mit dem der Nutzer sein Ziel eingestellt hat. */
    if (zangeOffen) zangeAuswerten()
    zeiger.delete(e.pointerId)
    if (zeiger.size < 2) {
      spanne = 0
      drehStau = 0
    }
    /* ZWEI FINGER, EINER GEHT HOCH: der verbleibende SCHIEBT weiter (H2).
       Ohne diese Uebergabe steht das Blatt still, bis man neu aufsetzt — und
       genau so hebt man in der Praxis ab: erst den einen Finger, dann den
       anderen. Vorher endete jede Zange in einem toten Augenblick. */
    if (zeiger.size === 1) {
      const rest = [...zeiger.values()][0]
      zieht = true
      ziehArt = 'finger'
      schnell = true
      lx = rest[0]
      ly = rest[1]
      return
    }
    // Das Stueck ist abgelegt. ZUERST, denn `lassLos` baut die Szene voll neu
    // — danach stimmte `zieht` nicht mehr mit dem Bild zusammen.
    if (greift) {
      griffBeenden()
      return
    }
    // `schnell` gehoert auch dann zurueckgenommen, wenn KEIN Zug lief: die
    // Zange setzt es, und ohne diese Zeile blieben die Moebel nach einem
    // Aufziehen einfach weg.
    if (!zieht && !schnell) return
    zieht = false
    schnell = false
    zeichne()
  }
  amCanvas('pointerup', beenden)
  amCanvas('pointercancel', beenden)

  amCanvas(
    'wheel',
    (e) => {
      e.preventDefault()
      const f = e.deltaY < 0 ? DARSTELLUNG.zoomSchritt : 1 / DARSTELLUNG.zoomSchritt
      blick.zoom = Math.max(DARSTELLUNG.zoomMin, Math.min(DARSTELLUNG.zoomMax, blick.zoom * f))
      zeichne()
    },
    { passive: false }
  )

  return {
    zeichne,
    passeAn,
    kamera,
    projiziere,
    /**
     * Ein Bildpunkt zurueck in die Welt — auf einer BEKANNTEN Hoehe (W7).
     *
     * Die Hoehe ist das ganze Geheimnis: ein Klick trifft einen Sehstrahl, aber
     * fuer einen Koerper mit bekannter Ober- und Unterkante ist dieser Strahl
     * eine ENDLICHE Strecke. Nichts wird geraten. Wer keine Hoehe hat, bekommt
     * hier auch keine Antwort, die so tut.
     */
    umkehre(X, Y, h) {
      return umkehreAuf(kamera(), X, Y, h)
    },
    /**
     * Andere Szene, gleicher Renderer (W7) — Blick, Zoom und Verschiebung
     * bleiben stehen. Genau darum geht es: die Doppelklick-Datei tauschte
     * bisher das ganze Canvas aus, um die gestapelten Abos loszuwerden, und
     * verlor dabei jedes Mal die Ansicht des Nutzers.
     */
    setzeSzene(neu) {
      szene = neu
      zeichne()
    },
    tauscheKoerper,
    /** Die aktuelle Szene — der Treffer-Test braucht ihre Koerper. */
    get szene() {
      return szene
    },
    /**
     * KENNUNG des Stuecks unter dem Zeiger (W7) — oder `null`.
     *
     * Dieselbe Regel wie im Grundriss: gedreht und geloescht wird IMMER das
     * Stueck unter dem Zeiger. Es gibt in diesem Planer keine Auswahl, die
     * einen Klick ueberdauert, und eine einzufuehren waere eine zweite
     * Bedienidee fuer eine Drehung um 15°.
     */
    get unterZeiger() {
      return unterZeiger
    },
    /** Laeuft gerade ein Griff? Die Huelle sperrt daran ihr Sichern. */
    get greift() {
      return greift
    },
    /**
     * Ist die Neigung ueberhaupt gutmuetig genug zum Ziehen? Die Huelle
     * schreibt es auf den Bildschirm, statt es den Nutzer erraten zu lassen.
     */
    get ziehbar() {
      return blick.el >= NEIGUNG_MIN_ZIEHEN
    },
    /**
     * Meldet ALLE Abos ab (B3). Ohne diesen Griff war jeder zweite Renderer auf
     * demselben Canvas ein Leck: `erzeugeAxonometrie` haengte fuenf Zuhoerer an
     * und nahm sie nie zurueck — gemessen drehte ein Zug nach drei Neubauten
     * viermal so schnell. Ein AbortController schliesst alle auf einmal; eine
     * Liste von Hand gepflegter Referenzen verlaeuft sich beim ersten neuen
     * Ereignis, das jemand vergisst einzutragen.
     */
    zerstoere() {
      abbruch.abort()
    },
    setzeBlick(az, el) {
      blick.az = az
      blick.el = el
      blick.zoom = 1
      blick.schiebX = 0
      blick.schiebY = 0
      zeichne()
    },
    setzeNamen(modus) {
      namenModus = modus
      zeichne()
    },
    /**
     * Was aus der Namensschicht des letzten Bildes geworden ist:
     * `{gemalt, ausgelassen}`. Die Huelle kann damit sagen, wie viele Namen auf
     * dem Blatt WIRKLICH stehen — eine Angabe, die man weder zaehlen noch
     * schaetzen sollte, wenn das Blatt zu einer Bank geht.
     */
    get namenBilanz() {
      return { ...namenBilanz }
    },
    setzeDunkel(an) {
      dunkel = an
      farben = an ? PALETTE.dunkel : PALETTE.hell
      zeichne()
    },
    setzeRandRechts(px) {
      randRechts = px
      zeichne()
    },
    get blick() {
      return { ...blick }
    }
  }
}
