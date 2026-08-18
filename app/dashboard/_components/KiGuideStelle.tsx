"use client";
import { useEffect, useState } from "react";
import KiGuide from "./KiGuide";
import { istVorlesenMoeglich, sprich, stoppeVorlesen, baueVorleseText } from "@/lib/vorlesen";
import type { GuideInhalt } from "@/lib/kiGuideTexte";

// ---------------------------------------------------------------------
// ARGONAUT OS · KiGuideStelle — der fertig verdrahtete Guide
//
// ▄▄▄ WARUM ES DIESE DATEI GIBT UND NICHT NUR KiGuide ▄▄▄
// KiGuide erwartet `onVorlesen` als FUNKTION. Funktionen lassen sich in Next.js
// nicht von einer Server-Seite an eine Client-Komponente durchreichen — das ist
// keine Geschmacksfrage, sondern eine harte Grenze des Frameworks. Diese
// Zwischenstelle nimmt deshalb nur einfache Daten entgegen und baut die
// Funktion selbst, hier im Browser.
//
// Der 🔊-Knopf erscheint NUR, wenn der Browser wirklich vorlesen kann. Auf
// einem Geraet ohne Sprachausgabe gibt es keinen toten Knopf, der nichts tut.
// ---------------------------------------------------------------------

export default function KiGuideStelle({ inhalt, name }: { inhalt: GuideInhalt; name?: string }) {
  const [kannVorlesen, setKannVorlesen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);

  // Erst nach dem ersten Zeichnen pruefen: auf dem Server gibt es kein window,
  // und ein Unterschied zwischen Server- und Browser-Ausgabe wuerde React
  // als Fehler melden.
  useEffect(() => {
    setKannVorlesen(istVorlesenMoeglich());
    return () => stoppeVorlesen();
  }, []);

  function vorlesen() {
    if (laeuft) {
      stoppeVorlesen();
      setLaeuft(false);
      return;
    }
    const text = baueVorleseText({
      begruessung: inhalt.begruessung,
      nachricht: inhalt.nachricht,
      schritte: inhalt.schritte,
    });
    setLaeuft(sprich(text));
  }

  return (
    <KiGuide
      begruessung={inhalt.begruessung}
      nachricht={inhalt.nachricht}
      schritte={inhalt.schritte}
      aktionText={inhalt.aktionText}
      aktionHref={inhalt.aktionHref}
      stimmung={inhalt.stimmung}
      fortschritt={inhalt.fortschritt}
      onVorlesen={kannVorlesen ? vorlesen : undefined}
      name={name}
    />
  );
}
