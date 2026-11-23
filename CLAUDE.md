# Schicht-Navigator – Hinweise für Claude

Mobile App für Kaufland Langenfeld (~70 Mitarbeitende). Kernziel: schnelle Kommunikation zwischen Leitung und Mitarbeitenden in beide Richtungen – jeder Vorgang hat einen sichtbaren Zustand (gesendet → gesehen → quittiert/übernommen → erledigt) und eskaliert automatisch, wenn niemand reagiert.

## Regeln (nicht verhandelbar)
- Oberfläche strikt **Deutsch**. Farben Weiß/Rot (#e10915)/Schwarz, Hell- und Dunkelmodus.
- Mobile first (390 px), ein Daumen: Ziele ≥ 48 px, Icon immer mit Text, Status nie nur über Farbe, max. 5 Ziele in der Bottom-Navigation.
- Dringend = 🔥. Keine Minutenangaben in Formularen für Aufträge (Dauer kommt aus Richtwerten je Tätigkeit). Keine Artikelnummern; Mengen nur als KKP, Paletten, Boxen, Displays, Wagen.
- Limit pro Person = (Std × 60 − Pause) × 0,8; nie darüber zuteilen. Pause: bis 6 Std keine, bis 8 Std 30 Min, darüber 45 Min.
- Betriebsrat-tauglich: keine Ranglisten oder Leistungsvergleiche von Personen; Stimmung nur anonym ab 5 Antworten.
- Nichts nachbauen, was Kaufland schon hat (Preise/ESL, Kasse, K-Scan, Bestellung).

## Aufbau
- `src/core/` Kern ohne UI: `store` (Modi demo / db [Claude-Artifact] / server), `model`, `comm` (Kommunikationsmotor, Eskalation, Chat), `dist` (Verteilung, Limits, Pausen), `ops` (Fotobericht, Lieferung, Wochenplan), `ai`.
- `src/ui/shell.js` Router/Navigation/Banner/Sheets; `src/views/NN-*.js` Ansichten (werden automatisch eingebunden). Aktionen über `data-act` + `SN.ui.on(...)`.
- `design/` Designsystem (Klassen-Präfix `sn-`), App-Ergänzungen in `src/app.css`.
- `server/server.js` Node ohne Abhängigkeiten: REST + SSE, Fotos, `FILIAL_KEY`. Deploy: `Dockerfile`, `render.yaml`.
- `android-app/` Capacitor-Hülle → APK.
- `SPEC.md` Spezifikation, `research/` Recherche.

## Befehle
```bash
node build.js                      # → dist/index.html
node test/core.test.js             # Kernlogik
node test/check.js                 # alle Rollen × Ansichten, hell/dunkel
node test/flows.js                 # End-to-end inkl. zwei Geräte (Mock-db)
node test/server.test.js           # Server: Schlüssel, SSE, Löschfrist
PORT=8090 FILIAL_KEY=langenfeld-test DATA_DIR=/tmp/sn-data node server/server.js &
SN_SERVER=http://localhost:8090 SN_KEY=langenfeld-test node test/server-flows.js
cd android-app && npm run apk      # braucht ANDROID_HOME (Android SDK 35)
```
Vor jedem Commit: Build + alle Tests grün. Neue Funktion = mindestens ein Flow-Test.

## Arbeitsweise
- Zuerst lesen, dann mit exakten Textstellen patchen; keine Dateien blind ersetzen.
- Zeit immer über `SN.clock.now()` (Tests spulen vor). In der Demo spielt die Uhr außerhalb der Ladenzeiten um 10:30.
- db-Regeln: eine Schreiboperation je Dokument gleichzeitig, nie in `render` abonnieren, Dokumente ≤ 256 KiB (Fotos im Server-Modus als Datei, sonst verkleinert als data:-URL).
