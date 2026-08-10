/**
 * DIE NEUN SAEULEN — die fachliche Wahl beim Zusammenlegen (W14)
 * ==============================================================
 *
 * Warum es diese Datei gibt: bis W13 fragte das Zusammenlegen „Wozu soll der
 * neue Raum dienen?" und bot vier TECHNISCHE Belegungen an (Yoga, Kursraum,
 * Training, frei). Das ist die Sprache der Rechnung, nicht die des Betreibers.
 * Der Betreiber denkt in den NEUN SAEULEN seines Hauses — und die stehen im
 * Plan bereits, samt Zuordnung, welcher Raum welche traegt
 * (`src/axo/axo-kontrakt.js`, SAEULEN und SAEULEN_ZUORDNUNG).
 *
 * Diese Datei uebersetzt zwischen beidem:
 *
 *     Saeule (fachlich, was der Nutzer waehlt)  ->  Nutzung (technisch, was
 *                                                   `legeAus` einraeumt)
 *
 * DIE TRENNUNG IST ABSICHT, KEINE UMSTAENDLICHKEIT
 * -----------------------------------------------
 * Zwei Saeulen koennen dieselbe Belegung haben (Massage und Akupunktur
 * arbeiten beide an der Liege) und trotzdem verschiedene Raeume sein. Wer die
 * Saeule mit der Belegung gleichsetzt, kann diese beiden nie auseinander-
 * halten — und im Raumbuch stuende dann zweimal „Behandlung" statt „Massage"
 * und „Akupunktur". Die Saeule ist die AUSSAGE, die Nutzung ist ihre Folge.
 *
 * DIE DOPPELUNG DER NAMEN IST BEWUSST — UND SIE WIRD BEWACHT
 * ----------------------------------------------------------
 * Die neun Namen stehen ein zweites Mal in `src/axo/axo-kontrakt.js`. Sie hier
 * per `import` zu holen ist NICHT moeglich: `buendel-kern.mjs` entfernt beim
 * Buendeln jede Import-Zeile und legt Raum- und Axonometrie-Module in
 * getrennte Abschnitte — ein Verweis darueber hinweg waere in der
 * Doppelklick-Datei still `undefined` (derselbe Fallstrick, den W13 mit
 * `import { x as y }` gefunden hat).
 *
 * Statt die Doppelung zu verstecken, wird sie GEPRUEFT:
 * `tools/pruefe-saeulen.mjs` liest beide Listen und schlaegt fehl, sobald ein
 * Name, eine Rolle oder die Reihenfolge auseinanderlaeuft. Das ist dasselbe
 * Muster, mit dem W9 seine eine bewusste Doppelung baendigt.
 *
 * WOHER DIE BELEGUNGS-ZUORDNUNG KOMMT
 * -----------------------------------
 * Sie ist GESETZT, nicht gemessen — ein Grundriss sagt nicht, worauf ein Gast
 * bei der Akupunktur liegt. Jede Zeile traegt darum ihre Begruendung. Wer eine
 * fuer falsch haelt, aendert sie HIER; es gibt keine zweite Liste.
 */

/**
 * Die neun Saeulen in der Reihenfolge des Hauses (01..09).
 *
 * `nutzung` verweist auf einen Schluessel in `NUTZUNGEN`
 * (`raum-zusammenlegen.js`). `null` heisst: nichts hinstellen — die Flaeche
 * wird gebraucht, aber ihre Einrichtung ist noch offen.
 */
export const SAEULEN_WAHL = [
  {
    n: '01',
    name: 'IHHT',
    rolle: 'Der Reiz',
    // Das Hoehentraining laeuft im Sitzen oder Liegen mit Maske — der Gast
    // bleibt waehrend der ganzen Einheit an einem Platz.
    nutzung: 'behandlung'
  },
  {
    n: '02',
    name: 'Bewegung',
    rolle: 'Die Aktivierung',
    nutzung: 'training'
  },
  {
    n: '03',
    name: 'Massage',
    rolle: 'Die Regeneration',
    nutzung: 'behandlung'
  },
  {
    n: '04',
    name: 'Akupunktur',
    rolle: 'Die Balance',
    nutzung: 'behandlung'
  },
  {
    n: '05',
    name: 'Kurse',
    rolle: 'Das Wissen',
    nutzung: 'kurs'
  },
  {
    n: '06',
    name: 'Ernährung',
    rolle: 'Der Baustoff',
    // Beratung findet im Gespraech statt — bestuhlt wie ein Kursraum, nur
    // kleiner. Die Belegung ist dieselbe, die Saeule eine andere.
    nutzung: 'kurs'
  },
  {
    n: '07',
    name: 'Gewichtsmanagement',
    rolle: 'Der Alltag',
    nutzung: 'kurs'
  },
  {
    n: '08',
    name: 'Prävention & Biohacking',
    rolle: 'Die Vorsorge',
    nutzung: 'training'
  },
  {
    n: '09',
    name: 'Yoga',
    rolle: 'Der Atem',
    nutzung: 'yoga'
  }
]

/**
 * Der zehnte Eintrag der Auswahl, und er ist KEINE Saeule.
 *
 * Warum er trotzdem dazugehoert: nicht jede zusammengelegte Flaeche traegt
 * sofort eine Saeule. Ein Flur, ein Lager, ein Sanitaerbereich sind Teil des
 * Hauses, ohne einer der neun zu dienen. Ohne diesen Ausgang muesste der
 * Nutzer eine Saeule BEHAUPTEN, die er nicht meint — und im Raumbuch stuende
 * danach eine Zuordnung, die niemand getroffen hat.
 */
export const OHNE_SAEULE = {
  n: '—',
  name: 'Noch offen',
  rolle: 'Ohne Säule — nur Fläche',
  nutzung: null
}

/**
 * Die Auswahl, wie sie im Menue erscheint: neun Saeulen, dann der Ausgang.
 *
 * „Noch offen" steht ZULETZT und nicht zuerst: es ist der Ausweg, nicht der
 * Vorschlag. Stuende es oben, waere die bequemste Wahl auch die
 * aussageloseste — dieselbe Ueberlegung, aus der in jeder Rueckfrage dieser
 * Datei „Abbrechen" zuerst steht, nur andersherum, weil hier nichts
 * Folgenreiches passiert.
 */
export function saeulenWahl() {
  return SAEULEN_WAHL.concat([OHNE_SAEULE])
}

/**
 * Findet eine Saeule ueber ihre Nummer ('01'..'09') oder ihren Namen.
 *
 * Beides wird akzeptiert, weil beides vorkommt: die Nummer steht im
 * gespeicherten Stand (kurz und stabil), der Name in einem getippten Wunsch
 * („mach daraus einen Yoga-Raum"). Ein unbekannter Wert gibt `null` zurueck
 * und wird NICHT geraten — eine falsch geratene Saeule waere eine erfundene
 * Aussage ueber das Haus.
 */
export function saeuleNach(kennung) {
  if (kennung == null) return null
  const gesucht = String(kennung).trim().toLowerCase()
  if (!gesucht) return null
  if (gesucht === '—' || gesucht === 'offen' || gesucht === 'noch offen') return OHNE_SAEULE
  for (const s of SAEULEN_WAHL) {
    if (s.n.toLowerCase() === gesucht) return s
    if (s.name.toLowerCase() === gesucht) return s
  }
  return null
}

/**
 * Der Nutzungs-Schluessel zu einer Saeule — das, was `zusammenlegenPlanen`
 * als `wahl.nutzung` erwartet.
 *
 * Gibt `'leer'` zurueck, wo die Saeule keine Belegung mitbringt: `legeAus`
 * kennt `null` nicht, wohl aber `leer`, und beides bedeutet dasselbe —
 * nichts hinstellen.
 */
export function nutzungFuerSaeule(saeule) {
  if (!saeule || saeule.nutzung == null) return 'leer'
  return saeule.nutzung
}

/**
 * Die Zeile, die im Raumbuch und im Blattkopf steht.
 *
 * Beispiel: „09 · Yoga (Der Atem)". Die Nummer steht vorn, weil das Haus in
 * Nummern spricht; die Rolle steht dahinter, weil sie erklaert und nicht
 * benennt.
 */
export function saeulenText(saeule) {
  if (!saeule) return OHNE_SAEULE.name
  if (saeule === OHNE_SAEULE || saeule.nutzung == null) return saeule.name
  return `${saeule.n} · ${saeule.name} (${saeule.rolle})`
}

/** Nur fuer die Pruefwerkzeuge — nicht im Betrieb benutzen. */
export const _saeulenPruefzugang = {
  SAEULEN_WAHL,
  OHNE_SAEULE
}
