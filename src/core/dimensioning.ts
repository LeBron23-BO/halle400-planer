import { Configuration, configDimUnit } from './configuration'

/** Dimensioning in Inch. */
export const dimInch: string = 'inch'

/** Dimensioning in Meter. */
export const dimMeter: string = 'm'

/** Dimensioning in Centi Meter. */
export const dimCentiMeter: string = 'cm'

/** Dimensioning in Milli Meter. */
export const dimMilliMeter: string = 'mm'

/** Dimensioning functions. */
export class Dimensioning {
  /** Converts cm to dimensioning string.
   * @param cm Centi meter value to be converted.
   * @returns String representation.
   */
  public static cmToMeasure(cm: number): string {
    switch (Configuration.getStringValue(configDimUnit)) {
      case dimInch:
        const realFeet = (cm * 0.3937) / 12
        const feet = Math.floor(realFeet)
        const inches = Math.round((realFeet - feet) * 12)
        return feet + "'" + inches + '"'
      case dimMilliMeter:
        return '' + Math.round(10 * cm) + ' mm'
      case dimCentiMeter:
        return (Math.round(10 * cm) / 10).toFixed(1).replace('.', ',') + ' cm'
      case dimMeter:
      default:
        // Auf Zentimeter runden (2 Nachkommastellen), NICHT auf Millimeter:
        // die Halle-400-Geometrie ist aus einem freihaendig GEZEICHNETEN Plan
        // in cm gemessen. Eine dritte Nachkommastelle behauptet eine
        // Millimeter-Praezision, die das Original nicht hergibt (Projekt-DNA).
        //
        // DEUTSCH GESCHRIEBEN und mit FESTER Stellenzahl (G1). Vorher stand auf
        // einem deutschen Bankblatt „5.12 m", daneben „5.8 m" und daneben
        // „5 m": englischer Dezimalpunkt und wechselnde Stellenzahl, weil
        // `'' + zahl` die Null am Ende wegwirft. Zwei Masse untereinander
        // liessen sich so nicht mehr vergleichen. Die Rueckfrage beim Loeschen
        // schreibt seit E1 „diese Wand (3,63 m lang)" — dieselbe Sprache gilt
        // jetzt ueberall.
        return (Math.round(cm) / 100).toFixed(2).replace('.', ',') + ' m'
    }
  }
}
