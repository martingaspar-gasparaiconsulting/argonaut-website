// update-branchen-agenten.js v2 — korrekte Slugs aus branchen.ts
// node update-branchen-agenten.js

const fs = require('fs');
const path = require('path');

// ============================================================
// KURATIERTE MATRIX — echte Slugs, 24 Agenten in Priorität
// Pflicht-Agenten kommen zuerst (Warn-Badge im UI)
// ============================================================
const BRANCHEN_MATRIX = [

  // ── MEDIZIN & GESUNDHEIT
  { slug: 'aerzte',
    agenten: ['Der Empfänger','Der Planer','Der Buchhalter','Der Schreiber','Der Wächter','Der Assistent','Der Personalchef','Der Techniker','Der Schmied','Der Analyst','Der Regisseur','Der Forscher','Der Moderator','Der Verkäufer','Der Trainer','Der Sicherheitschef','Der Netzwerker','Der Einkäufer','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Empfänger','Der Planer','Der Buchhalter'] },

  { slug: 'zahnaerzte',
    agenten: ['Der Empfänger','Der Planer','Der Buchhalter','Der Schreiber','Der Wächter','Der Assistent','Der Personalchef','Der Schmied','Der Analyst','Der Regisseur','Der Techniker','Der Trainer','Der Sicherheitschef','Der Moderator','Der Verkäufer','Der Forscher','Der Netzwerker','Der Einkäufer','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Empfänger','Der Planer','Der Buchhalter'] },

  { slug: 'physiotherapie',
    agenten: ['Der Empfänger','Der Planer','Der Buchhalter','Der Schreiber','Der Wächter','Der Assistent','Der Personalchef','Der Schmied','Der Analyst','Der Moderator','Der Trainer','Der Techniker','Der Regisseur','Der Verkäufer','Der Forscher','Der Sicherheitschef','Der Netzwerker','Der Einkäufer','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Empfänger','Der Planer'] },

  { slug: 'apotheken',
    agenten: ['Der Buchhalter','Der Wächter','Der Empfänger','Der Einkäufer','Der Schreiber','Der Planer','Der Assistent','Der Analyst','Der Techniker','Der Schmied','Der Sicherheitschef','Der Trainer','Der Moderator','Der Verkäufer','Der Forscher','Der Personalchef','Der Netzwerker','Der Übersetzer','Der Regisseur','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Buchhalter','Der Wächter','Der Einkäufer'] },

  { slug: 'optiker',
    agenten: ['Der Empfänger','Der Buchhalter','Der Einkäufer','Der Wächter','Der Planer','Der Verkäufer','Der Schreiber','Der Assistent','Der Analyst','Der Techniker','Der Personalchef','Der Moderator','Der Regisseur','Der Forscher','Der Trainer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Schmied','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Empfänger','Der Buchhalter','Der Einkäufer'] },

  { slug: 'hoergeraete',
    agenten: ['Der Empfänger','Der Buchhalter','Der Einkäufer','Der Planer','Der Wächter','Der Schreiber','Der Verkäufer','Der Assistent','Der Techniker','Der Analyst','Der Personalchef','Der Moderator','Der Regisseur','Der Forscher','Der Trainer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Schmied','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Empfänger','Der Buchhalter'] },

  { slug: 'pflege',
    agenten: ['Der Personalchef','Der Planer','Der Empfänger','Der Buchhalter','Der Wächter','Der Schreiber','Der Assistent','Der Trainer','Der Schmied','Der Analyst','Der Moderator','Der Techniker','Der Sicherheitschef','Der Regisseur','Der Forscher','Der Verkäufer','Der Netzwerker','Der Einkäufer','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Personalchef','Der Planer','Der Buchhalter'] },

  { slug: 'kinderbetreuung',
    agenten: ['Der Empfänger','Der Planer','Der Buchhalter','Der Schreiber','Der Personalchef','Der Wächter','Der Moderator','Der Trainer','Der Assistent','Der Analyst','Der Regisseur','Der Techniker','Der Forscher','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Schmied','Der Stratege','Der Einkäufer','Der Verkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Empfänger','Der Planer','Der Buchhalter'] },

  { slug: 'krankenhauser',
    agenten: ['Der Personalchef','Der Buchhalter','Der Planer','Der Wächter','Der Empfänger','Der Assistent','Der Techniker','Der Analyst','Der Schreiber','Der Trainer','Der Sicherheitschef','Der Schmied','Der Moderator','Der Regisseur','Der Forscher','Der Einkäufer','Der Jurist','Der Netzwerker','Der Übersetzer','Der Stratege','Der Integrator','Der Verkäufer','Der Botschafter','Der Späher'],
    pflicht: ['Der Personalchef','Der Buchhalter','Der Wächter'] },

  { slug: 'medizintechnik',
    agenten: ['Der Techniker','Der Wächter','Der Forscher','Der Buchhalter','Der Analyst','Der Einkäufer','Der Schreiber','Der Schmied','Der Jurist','Der Planer','Der Assistent','Der Sicherheitschef','Der Empfänger','Der Personalchef','Der Regisseur','Der Trainer','Der Moderator','Der Netzwerker','Der Übersetzer','Der Stratege','Der Integrator','Der Verkäufer','Der Botschafter','Der Späher'],
    pflicht: ['Der Techniker','Der Wächter','Der Forscher'] },

  { slug: 'apotheken-grosshandel',
    agenten: ['Der Einkäufer','Der Buchhalter','Der Wächter','Der Planer','Der Analyst','Der Techniker','Der Schreiber','Der Verkäufer','Der Assistent','Der Empfänger','Der Personalchef','Der Schmied','Der Regisseur','Der Forscher','Der Moderator','Der Trainer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Einkäufer','Der Buchhalter','Der Wächter'] },

  { slug: 'tierarzte',
    agenten: ['Der Empfänger','Der Planer','Der Buchhalter','Der Wächter','Der Schreiber','Der Assistent','Der Personalchef','Der Techniker','Der Analyst','Der Schmied','Der Moderator','Der Regisseur','Der Verkäufer','Der Forscher','Der Trainer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Einkäufer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Empfänger','Der Planer','Der Buchhalter'] },

  // ── BERATUNG & RECHT & FINANZEN
  { slug: 'steuerberatung',
    agenten: ['Der Buchhalter','Der Wächter','Der Analyst','Der Schreiber','Der Empfänger','Der Planer','Der Assistent','Der Jurist','Der Techniker','Der Personalchef','Der Schmied','Der Forscher','Der Sicherheitschef','Der Regisseur','Der Moderator','Der Trainer','Der Netzwerker','Der Einkäufer','Der Übersetzer','Der Stratege','Der Integrator','Der Verkäufer','Der Botschafter','Der Späher'],
    pflicht: ['Der Buchhalter','Der Wächter','Der Analyst'] },

  { slug: 'steuerbehoerden',
    agenten: ['Der Buchhalter','Der Wächter','Der Analyst','Der Jurist','Der Schreiber','Der Empfänger','Der Planer','Der Assistent','Der Techniker','Der Sicherheitschef','Der Personalchef','Der Forscher','Der Moderator','Der Regisseur','Der Trainer','Der Netzwerker','Der Übersetzer','Der Schmied','Der Stratege','Der Integrator','Der Einkäufer','Der Verkäufer','Der Botschafter','Der Späher'],
    pflicht: ['Der Buchhalter','Der Wächter','Der Jurist'] },

  { slug: 'rechtsanwaelte',
    agenten: ['Der Jurist','Der Wächter','Der Schreiber','Der Buchhalter','Der Analyst','Der Empfänger','Der Planer','Der Assistent','Der Forscher','Der Techniker','Der Sicherheitschef','Der Personalchef','Der Moderator','Der Regisseur','Der Trainer','Der Netzwerker','Der Übersetzer','Der Schmied','Der Stratege','Der Integrator','Der Einkäufer','Der Verkäufer','Der Botschafter','Der Späher'],
    pflicht: ['Der Jurist','Der Wächter','Der Schreiber'] },

  { slug: 'notare',
    agenten: ['Der Jurist','Der Wächter','Der Schreiber','Der Buchhalter','Der Empfänger','Der Planer','Der Analyst','Der Assistent','Der Forscher','Der Techniker','Der Sicherheitschef','Der Personalchef','Der Moderator','Der Regisseur','Der Trainer','Der Netzwerker','Der Übersetzer','Der Schmied','Der Stratege','Der Integrator','Der Einkäufer','Der Verkäufer','Der Botschafter','Der Späher'],
    pflicht: ['Der Jurist','Der Wächter','Der Schreiber'] },

  { slug: 'finanzberater',
    agenten: ['Der Buchhalter','Der Analyst','Der Verkäufer','Der Wächter','Der Schreiber','Der Empfänger','Der Planer','Der Jurist','Der Forscher','Der Assistent','Der Netzwerker','Der Regisseur','Der Moderator','Der Personalchef','Der Techniker','Der Trainer','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Integrator','Der Einkäufer','Der Botschafter','Der Späher'],
    pflicht: ['Der Buchhalter','Der Analyst','Der Verkäufer'] },

  { slug: 'versicherungen',
    agenten: ['Der Verkäufer','Der Buchhalter','Der Wächter','Der Empfänger','Der Schreiber','Der Analyst','Der Planer','Der Jurist','Der Assistent','Der Netzwerker','Der Forscher','Der Moderator','Der Regisseur','Der Trainer','Der Personalchef','Der Techniker','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Integrator','Der Einkäufer','Der Botschafter','Der Späher'],
    pflicht: ['Der Verkäufer','Der Buchhalter','Der Wächter'] },

  { slug: 'banken',
    agenten: ['Der Buchhalter','Der Wächter','Der Analyst','Der Jurist','Der Sicherheitschef','Der Empfänger','Der Schreiber','Der Planer','Der Verkäufer','Der Assistent','Der Netzwerker','Der Forscher','Der Moderator','Der Personalchef','Der Techniker','Der Regisseur','Der Trainer','Der Übersetzer','Der Schmied','Der Stratege','Der Integrator','Der Einkäufer','Der Botschafter','Der Späher'],
    pflicht: ['Der Buchhalter','Der Wächter','Der Analyst'] },

  { slug: 'unternehmensberater',
    agenten: ['Der Stratege','Der Analyst','Der Schreiber','Der Forscher','Der Buchhalter','Der Verkäufer','Der Planer','Der Empfänger','Der Netzwerker','Der Assistent','Der Regisseur','Der Wächter','Der Trainer','Der Moderator','Der Personalchef','Der Techniker','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Jurist','Der Integrator','Der Einkäufer','Der Botschafter','Der Späher'],
    pflicht: ['Der Stratege','Der Analyst','Der Schreiber'] },

  { slug: 'unternehmensberatung-digital',
    agenten: ['Der Stratege','Der Schmied','Der Analyst','Der Techniker','Der Schreiber','Der Buchhalter','Der Verkäufer','Der Forscher','Der Planer','Der Empfänger','Der Assistent','Der Wächter','Der Regisseur','Der Moderator','Der Personalchef','Der Sicherheitschef','Der Trainer','Der Netzwerker','Der Übersetzer','Der Integrator','Der Jurist','Der Einkäufer','Der Botschafter','Der Späher'],
    pflicht: ['Der Stratege','Der Schmied','Der Analyst'] },

  // ── HANDWERK & BAU
  { slug: 'elektriker',
    agenten: ['Der Techniker','Der Wächter','Der Buchhalter','Der Planer','Der Einkäufer','Der Schmied','Der Schreiber','Der Verkäufer','Der Assistent','Der Personalchef','Der Analyst','Der Empfänger','Der Trainer','Der Regisseur','Der Forscher','Der Moderator','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Techniker','Der Buchhalter','Der Planer'] },

  { slug: 'sanitaer-heizung',
    agenten: ['Der Techniker','Der Planer','Der Buchhalter','Der Einkäufer','Der Wächter','Der Schmied','Der Schreiber','Der Verkäufer','Der Assistent','Der Personalchef','Der Analyst','Der Empfänger','Der Trainer','Der Regisseur','Der Forscher','Der Moderator','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Techniker','Der Planer','Der Buchhalter'] },

  { slug: 'maler',
    agenten: ['Der Buchhalter','Der Verkäufer','Der Planer','Der Schreiber','Der Wächter','Der Einkäufer','Der Schmied','Der Empfänger','Der Assistent','Der Personalchef','Der Analyst','Der Techniker','Der Regisseur','Der Moderator','Der Trainer','Der Forscher','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Buchhalter','Der Verkäufer'] },

  { slug: 'schreiner',
    agenten: ['Der Buchhalter','Der Einkäufer','Der Planer','Der Schreiber','Der Wächter','Der Verkäufer','Der Schmied','Der Techniker','Der Assistent','Der Empfänger','Der Analyst','Der Personalchef','Der Regisseur','Der Trainer','Der Forscher','Der Moderator','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Buchhalter','Der Einkäufer'] },

  { slug: 'bauunternehmen',
    agenten: ['Der Buchhalter','Der Planer','Der Wächter','Der Einkäufer','Der Schreiber','Der Verkäufer','Der Personalchef','Der Schmied','Der Analyst','Der Techniker','Der Empfänger','Der Assistent','Der Regisseur','Der Forscher','Der Trainer','Der Moderator','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Buchhalter','Der Planer','Der Einkäufer'] },

  { slug: 'architekten',
    agenten: ['Der Planer','Der Schreiber','Der Buchhalter','Der Wächter','Der Analyst','Der Techniker','Der Verkäufer','Der Empfänger','Der Assistent','Der Forscher','Der Regisseur','Der Schmied','Der Personalchef','Der Jurist','Der Moderator','Der Trainer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Einkäufer','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Planer','Der Schreiber','Der Buchhalter'] },

  { slug: 'ingenieurbueros',
    agenten: ['Der Techniker','Der Planer','Der Analyst','Der Buchhalter','Der Wächter','Der Schmied','Der Schreiber','Der Forscher','Der Assistent','Der Empfänger','Der Verkäufer','Der Personalchef','Der Regisseur','Der Trainer','Der Moderator','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Einkäufer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Techniker','Der Planer','Der Analyst'] },

  // ── IMMOBILIEN
  { slug: 'immobilien-entwicklung',
    agenten: ['Der Planer','Der Buchhalter','Der Jurist','Der Analyst','Der Verkäufer','Der Wächter','Der Schreiber','Der Stratege','Der Empfänger','Der Assistent','Der Netzwerker','Der Einkäufer','Der Regisseur','Der Forscher','Der Personalchef','Der Techniker','Der Trainer','Der Moderator','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Planer','Der Buchhalter','Der Jurist'] },

  { slug: 'immobilienmakler',
    agenten: ['Der Verkäufer','Der Empfänger','Der Buchhalter','Der Schreiber','Der Planer','Der Wächter','Der Netzwerker','Der Analyst','Der Assistent','Der Regisseur','Der Forscher','Der Jurist','Der Moderator','Der Personalchef','Der Techniker','Der Trainer','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Einkäufer','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Verkäufer','Der Empfänger','Der Buchhalter'] },

  { slug: 'hausverwaltungen',
    agenten: ['Der Buchhalter','Der Empfänger','Der Planer','Der Wächter','Der Schreiber','Der Techniker','Der Jurist','Der Analyst','Der Assistent','Der Personalchef','Der Moderator','Der Schmied','Der Regisseur','Der Forscher','Der Trainer','Der Verkäufer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Integrator','Der Einkäufer','Der Botschafter','Der Späher'],
    pflicht: ['Der Buchhalter','Der Empfänger','Der Planer'] },

  // ── INDUSTRIE & PRODUKTION
  { slug: 'industrie-produktion',
    agenten: ['Der Einkäufer','Der Buchhalter','Der Planer','Der Techniker','Der Wächter','Der Schmied','Der Analyst','Der Personalchef','Der Schreiber','Der Assistent','Der Empfänger','Der Verkäufer','Der Regisseur','Der Forscher','Der Trainer','Der Moderator','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Einkäufer','Der Buchhalter','Der Planer'] },

  { slug: 'maschinenbau',
    agenten: ['Der Techniker','Der Einkäufer','Der Buchhalter','Der Planer','Der Wächter','Der Schmied','Der Analyst','Der Schreiber','Der Verkäufer','Der Assistent','Der Empfänger','Der Personalchef','Der Regisseur','Der Forscher','Der Trainer','Der Moderator','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Techniker','Der Einkäufer','Der Buchhalter'] },

  { slug: 'chemie',
    agenten: ['Der Wächter','Der Einkäufer','Der Buchhalter','Der Techniker','Der Analyst','Der Planer','Der Schmied','Der Sicherheitschef','Der Schreiber','Der Assistent','Der Personalchef','Der Forscher','Der Regisseur','Der Empfänger','Der Trainer','Der Moderator','Der Netzwerker','Der Übersetzer','Der Stratege','Der Verkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Wächter','Der Sicherheitschef','Der Buchhalter'] },

  { slug: 'lebensmittelproduktion',
    agenten: ['Der Wächter','Der Einkäufer','Der Buchhalter','Der Planer','Der Techniker','Der Personalchef','Der Analyst','Der Schreiber','Der Schmied','Der Assistent','Der Empfänger','Der Verkäufer','Der Regisseur','Der Forscher','Der Trainer','Der Moderator','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Wächter','Der Einkäufer','Der Buchhalter'] },

  { slug: 'textilproduktion',
    agenten: ['Der Einkäufer','Der Buchhalter','Der Planer','Der Techniker','Der Wächter','Der Schmied','Der Analyst','Der Schreiber','Der Personalchef','Der Assistent','Der Empfänger','Der Verkäufer','Der Regisseur','Der Forscher','Der Trainer','Der Moderator','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Einkäufer','Der Buchhalter','Der Planer'] },

  { slug: 'moebel',
    agenten: ['Der Buchhalter','Der Einkäufer','Der Planer','Der Verkäufer','Der Wächter','Der Schreiber','Der Schmied','Der Techniker','Der Assistent','Der Empfänger','Der Analyst','Der Personalchef','Der Regisseur','Der Trainer','Der Forscher','Der Moderator','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Buchhalter','Der Einkäufer','Der Verkäufer'] },

  { slug: 'elektronik',
    agenten: ['Der Techniker','Der Einkäufer','Der Buchhalter','Der Wächter','Der Schmied','Der Planer','Der Analyst','Der Schreiber','Der Verkäufer','Der Assistent','Der Empfänger','Der Personalchef','Der Regisseur','Der Forscher','Der Trainer','Der Moderator','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Techniker','Der Einkäufer','Der Buchhalter'] },

  { slug: 'automobilzulieferer',
    agenten: ['Der Einkäufer','Der Techniker','Der Buchhalter','Der Planer','Der Wächter','Der Schmied','Der Analyst','Der Verkäufer','Der Schreiber','Der Assistent','Der Personalchef','Der Empfänger','Der Regisseur','Der Forscher','Der Trainer','Der Moderator','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Einkäufer','Der Techniker','Der Buchhalter'] },

  { slug: 'luft-raumfahrt',
    agenten: ['Der Techniker','Der Wächter','Der Planer','Der Analyst','Der Buchhalter','Der Sicherheitschef','Der Schmied','Der Forscher','Der Schreiber','Der Assistent','Der Einkäufer','Der Personalchef','Der Regisseur','Der Empfänger','Der Trainer','Der Moderator','Der Netzwerker','Der Übersetzer','Der Stratege','Der Integrator','Der Jurist','Der Verkäufer','Der Botschafter','Der Späher'],
    pflicht: ['Der Techniker','Der Wächter','Der Sicherheitschef'] },

  { slug: 'verteidigung-sicherheit',
    agenten: ['Der Sicherheitschef','Der Wächter','Der Techniker','Der Analyst','Der Planer','Der Buchhalter','Der Schmied','Der Forscher','Der Schreiber','Der Assistent','Der Jurist','Der Personalchef','Der Regisseur','Der Empfänger','Der Trainer','Der Moderator','Der Netzwerker','Der Übersetzer','Der Stratege','Der Integrator','Der Einkäufer','Der Verkäufer','Der Botschafter','Der Späher'],
    pflicht: ['Der Sicherheitschef','Der Wächter','Der Analyst'] },

  { slug: 'bergbau',
    agenten: ['Der Techniker','Der Wächter','Der Einkäufer','Der Buchhalter','Der Planer','Der Sicherheitschef','Der Schmied','Der Analyst','Der Personalchef','Der Schreiber','Der Assistent','Der Empfänger','Der Forscher','Der Regisseur','Der Trainer','Der Moderator','Der Netzwerker','Der Übersetzer','Der Stratege','Der Integrator','Der Jurist','Der Verkäufer','Der Botschafter','Der Späher'],
    pflicht: ['Der Techniker','Der Wächter','Der Sicherheitschef'] },

  { slug: 'druckereien',
    agenten: ['Der Einkäufer','Der Buchhalter','Der Techniker','Der Wächter','Der Planer','Der Verkäufer','Der Schreiber','Der Schmied','Der Empfänger','Der Assistent','Der Analyst','Der Personalchef','Der Regisseur','Der Forscher','Der Trainer','Der Moderator','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Einkäufer','Der Buchhalter','Der Techniker'] },

  // ── HANDEL
  { slug: 'einzelhandel',
    agenten: ['Der Verkäufer','Der Buchhalter','Der Einkäufer','Der Empfänger','Der Wächter','Der Schreiber','Der Planer','Der Schmied','Der Analyst','Der Regisseur','Der Assistent','Der Moderator','Der Techniker','Der Personalchef','Der Forscher','Der Trainer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Verkäufer','Der Buchhalter','Der Einkäufer'] },

  { slug: 'grosshandel',
    agenten: ['Der Einkäufer','Der Buchhalter','Der Verkäufer','Der Wächter','Der Planer','Der Schreiber','Der Analyst','Der Schmied','Der Empfänger','Der Assistent','Der Techniker','Der Personalchef','Der Regisseur','Der Forscher','Der Moderator','Der Trainer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Einkäufer','Der Buchhalter','Der Verkäufer'] },

  { slug: 'e-commerce',
    agenten: ['Der Verkäufer','Der Schreiber','Der Buchhalter','Der Einkäufer','Der Regisseur','Der Schmied','Der Analyst','Der Wächter','Der Empfänger','Der Assistent','Der Techniker','Der Planer','Der Moderator','Der Forscher','Der Übersetzer','Der Personalchef','Der Trainer','Der Sicherheitschef','Der Netzwerker','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Verkäufer','Der Schreiber','Der Buchhalter'] },

  { slug: 'kfz-werkstaetten',
    agenten: ['Der Techniker','Der Buchhalter','Der Einkäufer','Der Planer','Der Wächter','Der Schreiber','Der Verkäufer','Der Schmied','Der Empfänger','Der Assistent','Der Analyst','Der Personalchef','Der Regisseur','Der Trainer','Der Forscher','Der Moderator','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Techniker','Der Buchhalter','Der Einkäufer'] },

  { slug: 'kfz-handel',
    agenten: ['Der Verkäufer','Der Buchhalter','Der Einkäufer','Der Empfänger','Der Techniker','Der Planer','Der Wächter','Der Schmied','Der Analyst','Der Schreiber','Der Assistent','Der Regisseur','Der Personalchef','Der Forscher','Der Moderator','Der Trainer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Verkäufer','Der Buchhalter','Der Einkäufer'] },

  { slug: 'franchise',
    agenten: ['Der Stratege','Der Buchhalter','Der Verkäufer','Der Empfänger','Der Planer','Der Wächter','Der Schreiber','Der Analyst','Der Trainer','Der Assistent','Der Personalchef','Der Moderator','Der Regisseur','Der Techniker','Der Forscher','Der Netzwerker','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Stratege','Der Buchhalter','Der Verkäufer'] },

  // ── LOGISTIK & TRANSPORT
  { slug: 'logistik',
    agenten: ['Der Planer','Der Buchhalter','Der Einkäufer','Der Wächter','Der Schmied','Der Techniker','Der Analyst','Der Verkäufer','Der Empfänger','Der Schreiber','Der Assistent','Der Personalchef','Der Regisseur','Der Forscher','Der Moderator','Der Trainer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Planer','Der Buchhalter','Der Einkäufer'] },

  { slug: 'transport',
    agenten: ['Der Planer','Der Buchhalter','Der Empfänger','Der Wächter','Der Schmied','Der Techniker','Der Verkäufer','Der Analyst','Der Schreiber','Der Assistent','Der Personalchef','Der Einkäufer','Der Regisseur','Der Forscher','Der Moderator','Der Trainer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Planer','Der Buchhalter'] },

  { slug: 'postdienste',
    agenten: ['Der Planer','Der Buchhalter','Der Empfänger','Der Wächter','Der Personalchef','Der Techniker','Der Schmied','Der Analyst','Der Schreiber','Der Assistent','Der Verkäufer','Der Einkäufer','Der Regisseur','Der Forscher','Der Moderator','Der Trainer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Planer','Der Buchhalter','Der Personalchef'] },

  // ── IT & TECHNOLOGIE
  { slug: 'it-dienstleister',
    agenten: ['Der Techniker','Der Schmied','Der Wächter','Der Analyst','Der Buchhalter','Der Schreiber','Der Planer','Der Sicherheitschef','Der Assistent','Der Empfänger','Der Verkäufer','Der Integrator','Der Forscher','Der Regisseur','Der Personalchef','Der Trainer','Der Moderator','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Einkäufer','Der Botschafter','Der Späher'],
    pflicht: ['Der Techniker','Der Schmied','Der Sicherheitschef'] },

  { slug: 'softwareentwicklung',
    agenten: ['Der Schmied','Der Techniker','Der Wächter','Der Schreiber','Der Analyst','Der Planer','Der Buchhalter','Der Assistent','Der Verkäufer','Der Regisseur','Der Empfänger','Der Forscher','Der Sicherheitschef','Der Integrator','Der Personalchef','Der Moderator','Der Trainer','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Einkäufer','Der Botschafter','Der Späher'],
    pflicht: ['Der Schmied','Der Techniker','Der Wächter'] },

  { slug: 'telekommunikation',
    agenten: ['Der Techniker','Der Buchhalter','Der Wächter','Der Analyst','Der Schmied','Der Sicherheitschef','Der Empfänger','Der Planer','Der Schreiber','Der Verkäufer','Der Assistent','Der Forscher','Der Integrator','Der Regisseur','Der Personalchef','Der Moderator','Der Trainer','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Einkäufer','Der Botschafter','Der Späher'],
    pflicht: ['Der Techniker','Der Buchhalter','Der Sicherheitschef'] },

  // ── ENERGIE & UMWELT
  { slug: 'wasserwirtschaft',
    agenten: ['Der Techniker','Der Wächter','Der Buchhalter','Der Planer','Der Analyst','Der Sicherheitschef','Der Schmied','Der Schreiber','Der Assistent','Der Empfänger','Der Personalchef','Der Forscher','Der Einkäufer','Der Regisseur','Der Trainer','Der Moderator','Der Netzwerker','Der Übersetzer','Der Stratege','Der Verkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Techniker','Der Wächter','Der Buchhalter'] },

  { slug: 'erneuerbare-energien',
    agenten: ['Der Techniker','Der Planer','Der Buchhalter','Der Wächter','Der Analyst','Der Einkäufer','Der Schmied','Der Schreiber','Der Verkäufer','Der Assistent','Der Forscher','Der Empfänger','Der Regisseur','Der Personalchef','Der Trainer','Der Moderator','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Techniker','Der Planer','Der Buchhalter'] },

  { slug: 'startups',
    agenten: ['Der Schmied','Der Stratege','Der Schreiber','Der Verkäufer','Der Buchhalter','Der Analyst','Der Empfänger','Der Planer','Der Regisseur','Der Assistent','Der Wächter','Der Forscher','Der Techniker','Der Moderator','Der Personalchef','Der Netzwerker','Der Trainer','Der Sicherheitschef','Der Übersetzer','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Schmied','Der Stratege','Der Schreiber'] },

  // ── MARKETING & MEDIEN
  { slug: 'marketing-agenturen',
    agenten: ['Der Regisseur','Der Schreiber','Der Analyst','Der Verkäufer','Der Moderator','Der Empfänger','Der Buchhalter','Der Forscher','Der Planer','Der Assistent','Der Wächter','Der Übersetzer','Der Personalchef','Der Techniker','Der Schmied','Der Trainer','Der Netzwerker','Der Sicherheitschef','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Regisseur','Der Schreiber','Der Analyst'] },

  { slug: 'werbeagenturen',
    agenten: ['Der Regisseur','Der Schreiber','Der Analyst','Der Verkäufer','Der Moderator','Der Empfänger','Der Buchhalter','Der Forscher','Der Assistent','Der Übersetzer','Der Planer','Der Wächter','Der Personalchef','Der Techniker','Der Trainer','Der Netzwerker','Der Sicherheitschef','Der Schmied','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Regisseur','Der Schreiber','Der Analyst'] },

  { slug: 'pr-agenturen',
    agenten: ['Der Schreiber','Der Botschafter','Der Regisseur','Der Moderator','Der Analyst','Der Empfänger','Der Buchhalter','Der Verkäufer','Der Netzwerker','Der Forscher','Der Assistent','Der Planer','Der Übersetzer','Der Wächter','Der Personalchef','Der Techniker','Der Trainer','Der Sicherheitschef','Der Schmied','Der Stratege','Der Jurist','Der Integrator','Der Einkäufer','Der Späher'],
    pflicht: ['Der Schreiber','Der Botschafter','Der Regisseur'] },

  { slug: 'unternehmenskommunikation',
    agenten: ['Der Schreiber','Der Botschafter','Der Moderator','Der Regisseur','Der Empfänger','Der Buchhalter','Der Analyst','Der Planer','Der Assistent','Der Forscher','Der Wächter','Der Übersetzer','Der Personalchef','Der Trainer','Der Verkäufer','Der Netzwerker','Der Sicherheitschef','Der Techniker','Der Schmied','Der Stratege','Der Jurist','Der Integrator','Der Einkäufer','Der Späher'],
    pflicht: ['Der Schreiber','Der Botschafter','Der Moderator'] },

  { slug: 'verlage',
    agenten: ['Der Schreiber','Der Regisseur','Der Analyst','Der Buchhalter','Der Empfänger','Der Übersetzer','Der Moderator','Der Wächter','Der Verkäufer','Der Forscher','Der Assistent','Der Planer','Der Personalchef','Der Techniker','Der Trainer','Der Netzwerker','Der Sicherheitschef','Der Schmied','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Schreiber','Der Regisseur','Der Buchhalter'] },

  { slug: 'fotografen',
    agenten: ['Der Regisseur','Der Schreiber','Der Buchhalter','Der Empfänger','Der Planer','Der Verkäufer','Der Moderator','Der Analyst','Der Assistent','Der Wächter','Der Forscher','Der Personalchef','Der Übersetzer','Der Trainer','Der Netzwerker','Der Sicherheitschef','Der Techniker','Der Schmied','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Regisseur','Der Schreiber','Der Buchhalter'] },

  { slug: 'film-tv',
    agenten: ['Der Regisseur','Der Schreiber','Der Planer','Der Buchhalter','Der Techniker','Der Schmied','Der Empfänger','Der Analyst','Der Verkäufer','Der Assistent','Der Moderator','Der Forscher','Der Wächter','Der Personalchef','Der Übersetzer','Der Trainer','Der Netzwerker','Der Sicherheitschef','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Regisseur','Der Schreiber','Der Planer'] },

  { slug: 'musikbranche',
    agenten: ['Der Regisseur','Der Schreiber','Der Moderator','Der Buchhalter','Der Empfänger','Der Planer','Der Verkäufer','Der Analyst','Der Assistent','Der Techniker','Der Forscher','Der Wächter','Der Personalchef','Der Übersetzer','Der Trainer','Der Netzwerker','Der Sicherheitschef','Der Schmied','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Regisseur','Der Schreiber','Der Moderator'] },

  { slug: 'spieleentwicklung',
    agenten: ['Der Schmied','Der Techniker','Der Regisseur','Der Schreiber','Der Analyst','Der Planer','Der Buchhalter','Der Wächter','Der Assistent','Der Empfänger','Der Forscher','Der Moderator','Der Personalchef','Der Verkäufer','Der Trainer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Schmied','Der Techniker','Der Regisseur'] },

  { slug: 'kuenstler',
    agenten: ['Der Schreiber','Der Empfänger','Der Buchhalter','Der Regisseur','Der Moderator','Der Verkäufer','Der Planer','Der Analyst','Der Assistent','Der Wächter','Der Forscher','Der Netzwerker','Der Personalchef','Der Trainer','Der Techniker','Der Übersetzer','Der Sicherheitschef','Der Schmied','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Schreiber','Der Empfänger','Der Buchhalter'] },

  // ── GASTRONOMIE & HOTELLERIE
  { slug: 'gastronomie',
    agenten: ['Der Empfänger','Der Planer','Der Buchhalter','Der Einkäufer','Der Schreiber','Der Wächter','Der Personalchef','Der Moderator','Der Assistent','Der Verkäufer','Der Regisseur','Der Analyst','Der Schmied','Der Techniker','Der Trainer','Der Forscher','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Empfänger','Der Planer','Der Buchhalter'] },

  { slug: 'hotels',
    agenten: ['Der Empfänger','Der Planer','Der Buchhalter','Der Schreiber','Der Personalchef','Der Wächter','Der Verkäufer','Der Moderator','Der Assistent','Der Regisseur','Der Analyst','Der Einkäufer','Der Techniker','Der Schmied','Der Trainer','Der Forscher','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Empfänger','Der Planer','Der Buchhalter'] },

  { slug: 'catering',
    agenten: ['Der Planer','Der Buchhalter','Der Einkäufer','Der Empfänger','Der Schreiber','Der Wächter','Der Verkäufer','Der Personalchef','Der Assistent','Der Moderator','Der Analyst','Der Schmied','Der Regisseur','Der Techniker','Der Trainer','Der Forscher','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Planer','Der Buchhalter','Der Einkäufer'] },

  { slug: 'reisebueros',
    agenten: ['Der Planer','Der Empfänger','Der Schreiber','Der Buchhalter','Der Verkäufer','Der Wächter','Der Moderator','Der Übersetzer','Der Analyst','Der Assistent','Der Regisseur','Der Forscher','Der Personalchef','Der Techniker','Der Trainer','Der Netzwerker','Der Sicherheitschef','Der Schmied','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Planer','Der Empfänger','Der Schreiber'] },

  { slug: 'eventmanagement',
    agenten: ['Der Planer','Der Empfänger','Der Schreiber','Der Buchhalter','Der Regisseur','Der Moderator','Der Verkäufer','Der Wächter','Der Assistent','Der Personalchef','Der Analyst','Der Techniker','Der Forscher','Der Netzwerker','Der Trainer','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Planer','Der Empfänger','Der Schreiber'] },

  { slug: 'freizeitparks',
    agenten: ['Der Empfänger','Der Planer','Der Buchhalter','Der Schreiber','Der Moderator','Der Personalchef','Der Wächter','Der Regisseur','Der Verkäufer','Der Assistent','Der Analyst','Der Techniker','Der Forscher','Der Trainer','Der Netzwerker','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Empfänger','Der Planer','Der Buchhalter'] },

  // ── GESUNDHEIT & WELLNESS
  { slug: 'fitnessstudios',
    agenten: ['Der Empfänger','Der Buchhalter','Der Verkäufer','Der Planer','Der Schreiber','Der Personalchef','Der Moderator','Der Wächter','Der Assistent','Der Analyst','Der Regisseur','Der Trainer','Der Schmied','Der Techniker','Der Forscher','Der Netzwerker','Der Sicherheitschef','Der Übersetzer','Der Einkäufer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Empfänger','Der Buchhalter','Der Verkäufer'] },

  { slug: 'kosmetik',
    agenten: ['Der Empfänger','Der Buchhalter','Der Schreiber','Der Planer','Der Verkäufer','Der Moderator','Der Wächter','Der Assistent','Der Regisseur','Der Analyst','Der Personalchef','Der Trainer','Der Forscher','Der Techniker','Der Netzwerker','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Empfänger','Der Buchhalter'] },

  { slug: 'friseure',
    agenten: ['Der Empfänger','Der Buchhalter','Der Planer','Der Schreiber','Der Verkäufer','Der Moderator','Der Wächter','Der Assistent','Der Regisseur','Der Analyst','Der Personalchef','Der Trainer','Der Forscher','Der Techniker','Der Netzwerker','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Empfänger','Der Buchhalter'] },

  { slug: 'tattoo-studios',
    agenten: ['Der Empfänger','Der Buchhalter','Der Schreiber','Der Planer','Der Verkäufer','Der Moderator','Der Wächter','Der Regisseur','Der Assistent','Der Analyst','Der Personalchef','Der Forscher','Der Techniker','Der Trainer','Der Netzwerker','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Empfänger','Der Buchhalter'] },

  { slug: 'sportvereine',
    agenten: ['Der Empfänger','Der Buchhalter','Der Moderator','Der Planer','Der Schreiber','Der Personalchef','Der Verkäufer','Der Wächter','Der Assistent','Der Analyst','Der Regisseur','Der Trainer','Der Forscher','Der Techniker','Der Netzwerker','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Empfänger','Der Buchhalter','Der Moderator'] },

  // ── BILDUNG
  { slug: 'bildung-weiterbildung',
    agenten: ['Der Trainer','Der Schreiber','Der Empfänger','Der Planer','Der Buchhalter','Der Moderator','Der Personalchef','Der Analyst','Der Assistent','Der Wächter','Der Regisseur','Der Techniker','Der Forscher','Der Übersetzer','Der Verkäufer','Der Schmied','Der Sicherheitschef','Der Netzwerker','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Trainer','Der Schreiber','Der Planer'] },

  { slug: 'fahrschulen',
    agenten: ['Der Empfänger','Der Buchhalter','Der Planer','Der Schreiber','Der Wächter','Der Trainer','Der Verkäufer','Der Assistent','Der Moderator','Der Analyst','Der Personalchef','Der Techniker','Der Regisseur','Der Forscher','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Schmied','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Empfänger','Der Buchhalter','Der Planer'] },

  { slug: 'schulen',
    agenten: ['Der Trainer','Der Schreiber','Der Empfänger','Der Planer','Der Buchhalter','Der Moderator','Der Personalchef','Der Analyst','Der Assistent','Der Wächter','Der Regisseur','Der Techniker','Der Forscher','Der Übersetzer','Der Verkäufer','Der Schmied','Der Sicherheitschef','Der Netzwerker','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Trainer','Der Schreiber','Der Planer'] },

  { slug: 'universitaeten',
    agenten: ['Der Forscher','Der Trainer','Der Schreiber','Der Buchhalter','Der Analyst','Der Planer','Der Empfänger','Der Moderator','Der Personalchef','Der Assistent','Der Wächter','Der Techniker','Der Regisseur','Der Übersetzer','Der Stratege','Der Netzwerker','Der Sicherheitschef','Der Schmied','Der Jurist','Der Integrator','Der Einkäufer','Der Verkäufer','Der Botschafter','Der Späher'],
    pflicht: ['Der Forscher','Der Trainer','Der Schreiber'] },

  // ── SOZIALES & VERBÄNDE
  { slug: 'wohlfahrtsverbaende',
    agenten: ['Der Personalchef','Der Buchhalter','Der Schreiber','Der Empfänger','Der Wächter','Der Planer','Der Moderator','Der Trainer','Der Assistent','Der Analyst','Der Forscher','Der Techniker','Der Regisseur','Der Netzwerker','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Einkäufer','Der Verkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Personalchef','Der Buchhalter','Der Schreiber'] },

  { slug: 'verbände',
    agenten: ['Der Schreiber','Der Buchhalter','Der Empfänger','Der Moderator','Der Wächter','Der Personalchef','Der Planer','Der Analyst','Der Assistent','Der Trainer','Der Forscher','Der Regisseur','Der Techniker','Der Netzwerker','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Einkäufer','Der Verkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Schreiber','Der Buchhalter','Der Empfänger'] },

  { slug: 'berufsverbände',
    agenten: ['Der Schreiber','Der Buchhalter','Der Empfänger','Der Moderator','Der Planer','Der Wächter','Der Analyst','Der Assistent','Der Trainer','Der Forscher','Der Personalchef','Der Regisseur','Der Techniker','Der Netzwerker','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Einkäufer','Der Verkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Schreiber','Der Buchhalter','Der Moderator'] },

  { slug: 'kirchen-religionsgemeinschaften',
    agenten: ['Der Schreiber','Der Empfänger','Der Buchhalter','Der Moderator','Der Planer','Der Personalchef','Der Wächter','Der Trainer','Der Assistent','Der Analyst','Der Forscher','Der Regisseur','Der Techniker','Der Netzwerker','Der Übersetzer','Der Sicherheitschef','Der Schmied','Der Stratege','Der Einkäufer','Der Verkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Schreiber','Der Empfänger','Der Buchhalter'] },

  { slug: 'stadtverwaltungen',
    agenten: ['Der Buchhalter','Der Wächter','Der Schreiber','Der Empfänger','Der Planer','Der Jurist','Der Personalchef','Der Analyst','Der Assistent','Der Moderator','Der Techniker','Der Forscher','Der Trainer','Der Sicherheitschef','Der Regisseur','Der Netzwerker','Der Übersetzer','Der Schmied','Der Stratege','Der Integrator','Der Einkäufer','Der Verkäufer','Der Botschafter','Der Späher'],
    pflicht: ['Der Buchhalter','Der Wächter','Der Jurist'] },

  // ── KULTUR & FREIZEIT
  { slug: 'museen-kultur',
    agenten: ['Der Schreiber','Der Empfänger','Der Buchhalter','Der Planer','Der Moderator','Der Regisseur','Der Analyst','Der Wächter','Der Assistent','Der Forscher','Der Trainer','Der Personalchef','Der Übersetzer','Der Techniker','Der Netzwerker','Der Sicherheitschef','Der Schmied','Der Stratege','Der Einkäufer','Der Verkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Schreiber','Der Empfänger','Der Buchhalter'] },

  { slug: 'bibliotheken',
    agenten: ['Der Schreiber','Der Buchhalter','Der Empfänger','Der Moderator','Der Planer','Der Wächter','Der Analyst','Der Assistent','Der Forscher','Der Techniker','Der Trainer','Der Personalchef','Der Übersetzer','Der Regisseur','Der Sicherheitschef','Der Netzwerker','Der Schmied','Der Stratege','Der Einkäufer','Der Verkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Schreiber','Der Buchhalter','Der Empfänger'] },

  { slug: 'archiv-dokumentation',
    agenten: ['Der Schreiber','Der Wächter','Der Buchhalter','Der Analyst','Der Empfänger','Der Planer','Der Forscher','Der Techniker','Der Assistent','Der Moderator','Der Personalchef','Der Sicherheitschef','Der Regisseur','Der Trainer','Der Übersetzer','Der Netzwerker','Der Schmied','Der Stratege','Der Einkäufer','Der Verkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Schreiber','Der Wächter','Der Buchhalter'] },

  // ── DIENSTLEISTUNGEN
  { slug: 'reinigungsunternehmen',
    agenten: ['Der Buchhalter','Der Personalchef','Der Planer','Der Wächter','Der Schreiber','Der Verkäufer','Der Einkäufer','Der Schmied','Der Empfänger','Der Assistent','Der Analyst','Der Techniker','Der Regisseur','Der Trainer','Der Moderator','Der Forscher','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Buchhalter','Der Personalchef'] },

  { slug: 'sicherheitsdienste',
    agenten: ['Der Sicherheitschef','Der Wächter','Der Planer','Der Buchhalter','Der Personalchef','Der Techniker','Der Analyst','Der Schreiber','Der Empfänger','Der Assistent','Der Schmied','Der Forscher','Der Regisseur','Der Trainer','Der Moderator','Der Verkäufer','Der Netzwerker','Der Übersetzer','Der Einkäufer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Sicherheitschef','Der Wächter','Der Planer'] },

  { slug: 'personalvermittlung',
    agenten: ['Der Personalchef','Der Verkäufer','Der Empfänger','Der Schreiber','Der Buchhalter','Der Wächter','Der Planer','Der Netzwerker','Der Assistent','Der Moderator','Der Analyst','Der Forscher','Der Regisseur','Der Trainer','Der Techniker','Der Sicherheitschef','Der Übersetzer','Der Schmied','Der Stratege','Der Einkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Personalchef','Der Verkäufer','Der Empfänger'] },

  // ── LANDWIRTSCHAFT
  { slug: 'landwirtschaft',
    agenten: ['Der Planer','Der Buchhalter','Der Einkäufer','Der Wächter','Der Techniker','Der Schmied','Der Analyst','Der Schreiber','Der Personalchef','Der Assistent','Der Empfänger','Der Verkäufer','Der Regisseur','Der Forscher','Der Trainer','Der Moderator','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Planer','Der Buchhalter','Der Einkäufer'] },

  { slug: 'gartenbau',
    agenten: ['Der Planer','Der Buchhalter','Der Einkäufer','Der Verkäufer','Der Wächter','Der Schreiber','Der Schmied','Der Techniker','Der Empfänger','Der Assistent','Der Personalchef','Der Analyst','Der Regisseur','Der Trainer','Der Forscher','Der Moderator','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Planer','Der Buchhalter'] },

  { slug: 'forstwirtschaft',
    agenten: ['Der Planer','Der Buchhalter','Der Einkäufer','Der Wächter','Der Techniker','Der Schmied','Der Analyst','Der Schreiber','Der Personalchef','Der Assistent','Der Empfänger','Der Verkäufer','Der Regisseur','Der Forscher','Der Trainer','Der Moderator','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Stratege','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Planer','Der Buchhalter','Der Einkäufer'] },

  { slug: 'nachhaltigkeit',
    agenten: ['Der Wächter','Der Forscher','Der Schreiber','Der Analyst','Der Buchhalter','Der Planer','Der Techniker','Der Stratege','Der Empfänger','Der Assistent','Der Schmied','Der Moderator','Der Personalchef','Der Regisseur','Der Trainer','Der Sicherheitschef','Der Netzwerker','Der Übersetzer','Der Einkäufer','Der Verkäufer','Der Jurist','Der Integrator','Der Botschafter','Der Späher'],
    pflicht: ['Der Wächter','Der Forscher','Der Schreiber'] },

];

// ============================================================
// PAKET-SCHNITT (zur Info — wird im UI angewendet)
// ============================================================
const PAKET_SCHNITT = { solo:2, start:8, pro:14, business:20, enterprise:24 };

// ============================================================
// MAIN
// ============================================================
const filePath = path.join(__dirname, 'app', 'lib', 'branchen.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Interface erweitern falls pflichtagenten noch nicht vorhanden
if (!content.includes('pflichtagenten')) {
  content = content.replace(
    'agenten: string[]',
    'agenten: string[]\n  pflichtagenten?: string[]'
  );
}

let updatedCount = 0;
let notFoundCount = 0;
const notFound = [];

for (const b of BRANCHEN_MATRIX) {
  // Suche den Block: von "slug: 'X'" bis zum naechsten agenten-Array
  const slugEscaped = b.slug.replace(/[-]/g, '\\-');
  const pattern = new RegExp(
    `(slug:\\s*'${slugEscaped}'[\\s\\S]*?)(agenten:\\s*\\[[^\\]]*\\])`,
    ''
  );

  if (!pattern.test(content)) {
    notFound.push(b.slug);
    notFoundCount++;
    continue;
  }

  const newAgenten = `agenten: [${b.agenten.map(a => `'${a}'`).join(', ')}]`;
  const newPflicht = `pflichtagenten: [${b.pflicht.map(a => `'${a}'`).join(', ')}]`;

  // Agenten ersetzen
  content = content.replace(pattern, `$1${newAgenten}`);

  // pflichtagenten: ersetzen falls vorhanden, sonst nach agenten einfügen
  const pflichPattern = new RegExp(
    `(slug:\\s*'${slugEscaped}'[\\s\\S]*?agenten:\\s*\\[[^\\]]*\\])(,?\\s*pflichtagenten:\\s*\\[[^\\]]*\\])?`
  );

  const hasPflicht = new RegExp(`slug:\\s*'${slugEscaped}'[\\s\\S]*?pflichtagenten:`).test(content);
  if (hasPflicht) {
    content = content.replace(
      new RegExp(`(slug:\\s*'${slugEscaped}'[\\s\\S]*?)(pflichtagenten:\\s*\\[[^\\]]*\\])`),
      `$1${newPflicht}`
    );
  } else {
    content = content.replace(
      new RegExp(`(slug:\\s*'${slugEscaped}'[\\s\\S]*?)(agenten:\\s*\\[[^\\]]*\\])`),
      `$1${newAgenten},\n    ${newPflicht}`
    );
  }

  updatedCount++;
}

fs.writeFileSync(filePath, content, 'utf8');

console.log(`\n✅ FERTIG`);
console.log(`   Branchen aktualisiert: ${updatedCount} / ${BRANCHEN_MATRIX.length}`);
console.log(`   Nicht gefunden: ${notFoundCount}`);
if (notFound.length > 0) console.log(`   Fehlende Slugs: ${notFound.join(', ')}`);
console.log(`\n📋 Paket-Schnitt (wird im UI angewendet):`);
Object.entries(PAKET_SCHNITT).forEach(([p,n]) => console.log(`   ${p.toUpperCase()}: ${n} Agenten`));
