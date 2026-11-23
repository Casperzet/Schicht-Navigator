# Schicht-Navigator 2

Mobile App für Kaufland Langenfeld (ca. 70 Mitarbeitende): Information erreicht in Sekunden die richtige Person, in beide Richtungen, mit sichtbarem Zustand (gesendet → gesehen → quittiert/übernommen → erledigt) und automatischer Eskalation, wenn niemand reagiert.

Grundlage: `SPEC.md` (Spezifikation), `research/` (Recherche), `design/` (Designsystem).

## Bauen und prüfen

```bash
node build.js            # → dist/index.html (eine Datei)
node test/core.test.js   # Kernlogik ohne Browser
node test/check.js       # alle Rollen × alle Ansichten, hell/dunkel, 390 px
node test/flows.js       # End-to-end-Abläufe inkl. Live-Sync zweier Geräte
```

## Aufbau

- `src/core/` – Kern ohne Oberfläche: `store` (Demo-Speicher oder gemeinsame Live-Datenbank), `model` (Abteilungen, Rollen, Hierarchie, Zuständigkeit), `comm` (Kommunikationsmotor: Anweisungen, Aufträge, Meldungen, Rufe, SOS, Übergabe, Schichtanfragen, Chat, Eskalation), `dist` (Verteilung, Limits, Pausen), `ai` (KI und Diktat).
- `src/ui/shell.js` – Router, Navigation (max. 5 Ziele je Rolle), Banner, Sheets, Takt (alle 15 s Eskalation prüfen).
- `src/views/` – Ansichten; neue Dateien werden vom Build automatisch eingebunden.

## Zwei Modi

- **Demo**: Beispieldaten, nur in diesem Fenster. Kontowechsel simuliert mehrere Geräte.
- **Filialbetrieb**: gemeinsame Live-Datenbank des veröffentlichten Artifacts. Alle, die das Artifact mit claude.ai-Konto und mindestens Contributor-Freigabe öffnen, sehen dieselben Daten live. Beim ersten Start legt der Owner das erste Admin-Konto an, weitere Personen unter „Mehr → Team“ (mit eigener PIN).

## Grenzen

- Keine Push-Nachrichten bei geschlossener App; Banner und Badges erscheinen, sobald die App offen ist.
- Jede Person braucht ein claude.ai-Konto mit Zugriff auf das Artifact.
- KI (Übersetzen, Plan-Scan, Diktat-Auswertung) und Spracheingabe funktionieren nur in der Claude-Ansicht; alles andere geht auch ohne.
- PIN ist eine Bequemlichkeit, keine sichere Anmeldung.
- Vor dem Echtbetrieb: Betriebsrat (§ 87 Abs. 1 Nr. 6 BetrVG) und Datenschutz einbinden. Die App verzichtet bewusst auf Ranglisten und Einzel-Auswertungen; Stimmung nur anonym ab 5 Antworten. Keine Rechtsberatung.
