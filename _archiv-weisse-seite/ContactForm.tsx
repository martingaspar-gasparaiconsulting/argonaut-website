"use client";

import { useState } from "react";

const WEBHOOK_URL = "https://n8n.srv1133627.hstgr.cloud/webhook/kontaktformular";

type FormState = {
  name: string;
  email: string;
  phone: string;
  company: string;
  employees: string;
  message: string;
};

const initialState: FormState = {
  name: "",
  email: "",
  phone: "",
  company: "",
  employees: "",
  message: "",
};

export default function ContactForm() {
  const [form, setForm] = useState<FormState>(initialState);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();

    if (!form.name || !form.email || !form.company || !form.message) {
      setErrorMsg("Bitte fülle alle Pflichtfelder aus.");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          source: "argonaut-website",
          submitted_at: new Date().toISOString(),
        }),
      });

      if (!res.ok) throw new Error("Webhook Fehler");

      setStatus("success");
      setForm(initialState);
    } catch {
      setStatus("error");
      setErrorMsg("Es ist ein Fehler aufgetreten. Bitte versuche es erneut.");
    }
  };

  return (
    <section
      id="kontakt"
      className="relative py-24 px-4"
      style={{ background: "linear-gradient(180deg, #0d0d1a 0%, #1A1A2E 100%)" }}
    >
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 h-px w-32"
        style={{ background: "#C9A84C" }}
      />

      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-12">
          <p
            className="text-xs uppercase tracking-[0.3em] mb-4"
            style={{ color: "#C9A84C", fontFamily: "DM Sans, sans-serif" }}
          >
            Kontakt
          </p>
          <h2
            className="text-4xl md:text-5xl font-bold mb-4"
            style={{ fontFamily: "Syne, sans-serif", color: "#FFFFFF" }}
          >
            Jetzt ARGONAUT OS
            <br />
            <span style={{ color: "#C9A84C" }}>testen</span>
          </h2>
          <p
            className="text-base max-w-lg mx-auto"
            style={{ color: "rgba(255,255,255,0.55)", fontFamily: "DM Sans, sans-serif" }}
          >
            Kein Risiko. Keine Bindung. Wir analysieren dein Unternehmen kostenlos
            und zeigen dir, welche Prozesse ARGONAUT OS sofort automatisiert.
          </p>
        </div>

        <div
          className="rounded-2xl p-8 md:p-10"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(201,168,76,0.2)",
            backdropFilter: "blur(12px)",
          }}
        >
          {status === "success" ? (
            <div className="text-center py-12">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
                style={{ background: "rgba(201,168,76,0.15)", border: "1px solid #C9A84C" }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M5 13l4 4L19 7"
                    stroke="#C9A84C"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <h3
                className="text-2xl font-bold mb-3"
                style={{ fontFamily: "Syne, sans-serif", color: "#FFFFFF" }}
              >
                Anfrage erhalten
              </h3>
              <p style={{ color: "rgba(255,255,255,0.55)", fontFamily: "DM Sans, sans-serif" }}>
                Wir melden uns innerhalb von 24 Stunden bei dir. Danke für dein Interesse.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <FormField
                  label="Name *"
                  name="name"
                  type="text"
                  placeholder="Max Mustermann"
                  value={form.name}
                  onChange={handleChange}
                />
                <FormField
                  label="E-Mail *"
                  name="email"
                  type="email"
                  placeholder="max@musterfirma.de"
                  value={form.email}
                  onChange={handleChange}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <FormField
                  label="Telefon"
                  name="phone"
                  type="tel"
                  placeholder="+49 711 000000"
                  value={form.phone}
                  onChange={handleChange}
                />
                <FormField
                  label="Unternehmen *"
                  name="company"
                  type="text"
                  placeholder="Musterfirma GmbH"
                  value={form.company}
                  onChange={handleChange}
                />
              </div>

              <div>
                <label
                  className="block text-xs uppercase tracking-widest mb-2"
                  style={{ color: "rgba(255,255,255,0.4)", fontFamily: "DM Sans, sans-serif" }}
                >
                  Mitarbeiterzahl
                </label>
                <select
                  name="employees"
                  value={form.employees}
                  onChange={handleChange}
                  className="w-full rounded-lg px-4 py-3 text-sm outline-none transition-all"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: form.employees ? "#FFFFFF" : "rgba(255,255,255,0.3)",
                    fontFamily: "DM Sans, sans-serif",
                  }}
                >
                  <option value="" disabled>Bitte wählen</option>
                  <option value="1-10">1–10 Mitarbeiter</option>
                  <option value="11-50">11–50 Mitarbeiter</option>
                  <option value="51-200">51–200 Mitarbeiter</option>
                  <option value="201-500">201–500 Mitarbeiter</option>
                  <option value="500+">500+ Mitarbeiter</option>
                </select>
              </div>

              <div>
                <label
                  className="block text-xs uppercase tracking-widest mb-2"
                  style={{ color: "rgba(255,255,255,0.4)", fontFamily: "DM Sans, sans-serif" }}
                >
                  Nachricht *
                </label>
                <textarea
                  name="message"
                  value={form.message}
                  onChange={handleChange}
                  rows={4}
                  placeholder="Was möchtest du automatisieren?"
                  className="w-full rounded-lg px-4 py-3 text-sm outline-none resize-none transition-all"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#FFFFFF",
                    fontFamily: "DM Sans, sans-serif",
                  }}
                />
              </div>

              {status === "error" && errorMsg && (
                <p
                  className="text-sm"
                  style={{ color: "#ff6b6b", fontFamily: "DM Sans, sans-serif" }}
                >
                  {errorMsg}
                </p>
              )}

              <button
                onClick={handleSubmit}
                disabled={status === "loading"}
                className="w-full py-4 rounded-lg font-semibold text-sm uppercase tracking-widest transition-all duration-200"
                style={{
                  background: status === "loading" ? "rgba(201,168,76,0.5)" : "#C9A84C",
                  color: "#1A1A2E",
                  fontFamily: "DM Sans, sans-serif",
                  cursor: status === "loading" ? "not-allowed" : "pointer",
                }}
              >
                {status === "loading" ? "Wird gesendet …" : "Kostenlose Analyse anfragen →"}
              </button>

              <p
                className="text-xs text-center"
                style={{ color: "rgba(255,255,255,0.25)", fontFamily: "DM Sans, sans-serif" }}
              >
                Keine Weitergabe deiner Daten. Kein Spam. Abmeldung jederzeit möglich.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function FormField({
  label,
  name,
  type,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  name: string;
  type: string;
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div>
      <label
        className="block text-xs uppercase tracking-widest mb-2"
        style={{ color: "rgba(255,255,255,0.4)", fontFamily: "DM Sans, sans-serif" }}
      >
        {label}
      </label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full rounded-lg px-4 py-3 text-sm outline-none transition-all"
        style={{
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.1)",
          color: "#FFFFFF",
          fontFamily: "DM Sans, sans-serif",
        }}
      />
    </div>
  );
}
