"use client";

import { useEffect, useRef, useState } from "react";

const storyBeats = [
  {
    time: "06:45 Uhr",
    icon: "😰",
    text: "Klaus öffnet seinen Laptop. 47 E-Mails. 3 verpasste Anrufe. Das Angebot von gestern — noch nicht fertig.",
    color: "text-red-400",
    borderColor: "border-red-500/30",
  },
  {
    time: "09:12 Uhr",
    icon: "📞",
    text: "Telefonat mit Kunde Müller. Danach nochmal mit Schreiner. Jede Antwort kostet Zeit — Zeit, die er nicht hat.",
    color: "text-orange-400",
    borderColor: "border-orange-500/30",
  },
  {
    time: "12:30 Uhr",
    icon: "📋",
    text: "Mittagspause? Fehlanzeige. Papierkram wartet nicht. Sein Team braucht Entscheidungen. Er braucht Luft.",
    color: "text-yellow-400",
    borderColor: "border-yellow-500/30",
  },
  {
    time: "17:55 Uhr",
    icon: "😔",
    text: "Das Angebot? Immer noch nicht fertig. Schon wieder. Ein weiterer Tag im Kampf gegen den eigenen Betrieb.",
    color: "text-gray-400",
    borderColor: "border-gray-500/30",
  },
  {
    time: "Dann kam Argonaut.",
    icon: "⚔️",
    text: "Heute erledigt der Architekt die Planung. Der Schmied baut die Werkzeuge. Der Chronist dokumentiert alles. Klaus? Klaus führt sein Unternehmen.",
    color: "text-[#C9A84C]",
    borderColor: "border-[#C9A84C]/50",
    highlight: true,
  },
];

export default function Story() {
  const [visibleBeats, setVisibleBeats] = useState<number[]>([]);
  const beatRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    beatRefs.current.forEach((ref, index) => {
      if (!ref) return;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setVisibleBeats((prev) =>
              prev.includes(index) ? prev : [...prev, index]
            );
          }
        },
        { threshold: 0.3 }
      );
      observer.observe(ref);
      observers.push(observer);
    });

    return () => observers.forEach((o) => o.disconnect());
  }, []);

  return (
    <section className="bg-[#0A1628] py-24 px-6 overflow-hidden" id="story">
      <div className="max-w-4xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-20">
          <p className="text-[#C9A84C] text-sm font-medium tracking-widest uppercase mb-4">
            Die Geschichte
          </p>
          <h2 className="text-4xl md:text-5xl font-bold text-white leading-tight">
            Jeden Morgen kämpft Klaus{" "}
            <span className="text-[#C9A84C]">alleine.</span>
          </h2>
          <p className="text-gray-400 text-lg mt-4 max-w-xl mx-auto">
            Klaus ist Inhaber eines Handwerksbetriebs in Sindelfingen.
            Solide Auftragslage. Gutes Team. Und trotzdem: Er schafft es nicht.
          </p>
        </div>

        {/* Story Timeline */}
        <div className="relative">
          {/* Vertikale Linie */}
          <div className="absolute left-8 top-0 bottom-0 w-px bg-gradient-to-b from-red-500/30 via-yellow-500/20 to-[#C9A84C]/50 hidden sm:block" />

          <div className="space-y-8">
            {storyBeats.map((beat, index) => (
              <div
                key={index}
                ref={(el) => { beatRefs.current[index] = el; }}
                className={`relative flex gap-6 transition-all duration-700 ${
                  visibleBeats.includes(index)
                    ? "opacity-100 translate-x-0"
                    : "opacity-0 translate-x-8"
                }`}
                style={{ transitionDelay: `${index * 100}ms` }}
              >
                {/* Icon-Kreis */}
                <div
                  className={`relative z-10 flex-shrink-0 w-16 h-16 rounded-full flex items-center justify-center text-2xl border ${beat.borderColor} ${
                    beat.highlight
                      ? "bg-[#C9A84C]/10"
                      : "bg-[#0A1628]"
                  }`}
                >
                  {beat.icon}
                </div>

                {/* Content */}
                <div
                  className={`flex-1 rounded-xl p-6 border ${beat.borderColor} ${
                    beat.highlight
                      ? "bg-[#C9A84C]/5"
                      : "bg-white/2"
                  }`}
                >
                  <p
                    className={`text-sm font-bold tracking-wider uppercase mb-2 ${beat.color}`}
                  >
                    {beat.time}
                  </p>
                  <p
                    className={`text-base leading-relaxed ${
                      beat.highlight ? "text-white font-medium" : "text-gray-300"
                    }`}
                  >
                    {beat.text}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Abschluss-CTA */}
        <div className="mt-20 text-center">
          <div className="inline-block bg-[#C9A84C]/10 border border-[#C9A84C]/30 rounded-2xl px-8 py-8 max-w-2xl">
            <p className="text-[#C9A84C] text-lg font-bold mb-2">
              🏆 Das Goldene Vlies wartet.
            </p>
            <p className="text-gray-300 mb-6">
              Deine Crew ist bereit. In 90 Minuten läuft deine erste Mission.
            </p>
            <a
              href="#kontakt"
              className="inline-flex items-center gap-2 bg-[#C9A84C] hover:bg-[#b8973d] text-[#0A1628] font-bold px-6 py-3 rounded-lg transition-all duration-200 hover:scale-105"
            >
              ⚔️ Starte deine Mission
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
