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
      className="py-20 px-4"
      style={{ background: "#FFFFFF" }}
    >
      <div className="max-w-xl mx-auto">

        {/* Label */}
        <p
          className="text-xs uppercase tracking-[0.3em] text-center mb-3"
          style={{ color: "#C9A84C", fontFamily: "DM Sans, sans-serif" }}
        >
          Kontakt
        </p>

        {/* Headline */}
        <h2
          className="text-3xl md:text-4xl font-bold text-center mb-2"
          style={{ fontFamily: "Syne, sans-serif", color: "#1A1A2E" }}
        >
          Jetzt ARGONAUT OS{" "}
          <span style={{ color: "#C9A84C" }}>testen</span>
        </h2>

        {/* Subtext */}
        <p
          className="text-sm text-center mb-8"
          style={{ color: "#6b7280", fontFamily: "DM Sans, sans-serif" }}
        >
          Kostenlose Analyse. Keine Bindung. Antwort innerhalb von 24 Stunden.
        </p>

        {/* Card */}
        <div
          className="rounded-2xl p-8"
          style={{
            background: "#FFFFFF",
            border: "1px solid rgba(201,168,76,0.3)",
            boxShadow: "0 4px 32px rgba(26,26,46,0.08)",
          }}
        >
          {status === "success" ? (
            <div className="text-center py-8">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5"
                style={{ background: "rgba(201,168,76,0.1)", border: "1px solid #C9A84C" }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M5 13l4 4L19 7" stroke="#C9A84C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h3
                className="text-xl font-bold mb-2"
                style={{ fontFamily: "Syne, sans-serif", color: "#1A1A2E" }}
              >
                Anfrage erhalten
              </h3>
              <p style={{ color: "#6b7280", fontFamily: "DM Sans, sans-serif", fontSize: "14px" }}>
                Wir melden uns innerhalb von 24 Stunden bei dir.
              </p>
            </div>
          ) : (
            <div className="space-y-4">

              {/* Name + Email */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Name *" name="name" type="text" placeholder="Max Mustermann" value={form.name} onChange={handleChange} />
                <Field label="E-Mail *" name="email" type="email" placeholder="max@firma.de" value={form.email} onChange={handleChange} />
              </div>

              {/* Telefon + Unternehmen */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Telefon" name="phone" type="tel" placeholder="+49 711 000000" value={form.phone} onChange={handleChange} />
                <Field label="Unternehmen *" name="company" type="text" placeholder="Musterfirma GmbH" value={form.company} onChange={handleChange} />
              </div>

              {/* Mitarbeiterzahl */}
              <div>
                <label
                  className="block text-xs font-semibold uppercase tracking-widest mb-1.5"
                  style={{ color: "#1A1A2E", fontFamily: "DM Sans, sans-serif" }}
                >
                  Mitarbeiterzahl
                </label>
                <select
                  name="employees"
                  value={form.employees}
                  onChange={handleChange}
                  className="w-full rounded-lg px-4 py-2.5 text-sm outline-none"
                  style={{
                    background: "#F9F9FB",
                    border: "1px solid #e5e7eb",
                    color: form.employees ? "#1A1A2E" : "#9ca3af",
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

              {/* Nachricht */}
              <div>
                <label
                  className="block text-xs font-semibold uppercase tracking-widest mb-1.5"
                  style={{ color: "#1A1A2E", fontFamily: "DM Sans, sans-serif" }}
                >
                  Nachricht *
                </label>
                <textarea
                  name="message"
                  value={form.message}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Was möchtest du automatisieren?"
                  className="w-full rounded-lg px-4 py-2.5 text-sm outline-none resize-none"
                  style={{
                    background: "#F9F9FB",
                    border: "1px solid #e5e7eb",
                    color: "#1A1A2E",
                    fontFamily: "DM Sans, sans-serif",
                  }}
                />
              </div>

              {/* Fehler */}
              {status === "error" && errorMsg && (
                <p className="text-xs" style={{ color: "#ef4444", fontFamily: "DM Sans, sans-serif" }}>
                  {errorMsg}
                </p>
              )}

              {/* Button */}
              <button
                onClick={handleSubmit}
                disabled={status === "loading"}
                className="w-full py-3.5 rounded-lg font-semibold text-sm uppercase tracking-widest transition-all duration-200"
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
                style={{ color: "#9ca3af", fontFamily: "DM Sans, sans-serif" }}
              >
                Keine Weitergabe deiner Daten. Kein Spam.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Field({
  label, name, type, placeholder, value, onChange,
}: {
  label: string; name: string; type: string; placeholder: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div>
      <label
        className="block text-xs font-semibold uppercase tracking-widest mb-1.5"
        style={{ color: "#1A1A2E", fontFamily: "DM Sans, sans-serif" }}
      >
        {label}
      </label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full rounded-lg px-4 py-2.5 text-sm outline-none"
        style={{
          background: "#F9F9FB",
          border: "1px solid #e5e7eb",
          color: "#1A1A2E",
          fontFamily: "DM Sans, sans-serif",
        }}
      />
    </div>
  );
}
