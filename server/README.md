# Schicht-Navigator Server

Gemeinsame Daten für alle Geräte (APK, Browser): Personal, Aufträge, Meldungen, Fotoberichte, Chat, Lieferungen, Wochenplan. Änderungen kommen in Echtzeit (Server-Sent Events) auf jedem Gerät an; ohne Netz sammelt die App Änderungen und überträgt sie später.

## Lokal starten

```bash
node build.js
FILIAL_KEY=geheim PORT=8080 DATA_DIR=./server/data node server/server.js
```
Dann im Browser `http://localhost:8080` öffnen, Adresse und Filial-Schlüssel eingeben.

## In die Cloud (empfohlen: Render)

1. Repository auf GitHub pushen (ohne `server/data`).
2. Auf render.com: **New → Blueprint** → Repository wählen. `render.yaml` legt Dienst, Festplatte (1 GB) und einen zufälligen `FILIAL_KEY` an.
3. Nach dem Start: Adresse (z. B. `https://schicht-navigator.onrender.com`) und `FILIAL_KEY` (unter Environment) an die Filialleitung geben.
4. In der App beim ersten Start beide Werte eintragen. Fertig.

Alternativen: Railway oder Fly.io (gleicher `Dockerfile`, Volume auf `/data` mounten, `FILIAL_KEY` setzen).

## Sicherheit und Betrieb

- Nur HTTPS verwenden (Render/Railway/Fly liefern das automatisch).
- `FILIAL_KEY` lang und zufällig wählen; bei Verdacht ändern – alle Geräte geben ihn dann neu ein.
- Die Personen-PIN in der App ist eine Bequemlichkeit, keine sichere Anmeldung. Der Schutz der Daten hängt am Filial-Schlüssel.
- Fotos liegen in `/data/media`. Für eine Löschfrist (Datenschutz) z. B. täglich Dateien älter als 30 Tage löschen.
- Backup: Ordner `/data` sichern (JSON-Dateien und Fotos).
- Vor dem Echtbetrieb Betriebsrat (§ 87 Abs. 1 Nr. 6 BetrVG) und Datenschutz einbinden. Keine Rechtsberatung.
