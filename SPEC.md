# Schicht-Navigator 2 – Spezifikation

Stand 2026-11-22. Neuaufbau von Grund auf. Grundlage: `research/kaufland-langenfeld.md`, `research/best-practices.md`, Designsystem in `design/`. Die alte Version (`research/alte-version.html`) ist nur Referenz für Fachlogik, kein Code wird übernommen.

## 1. Ziel in einem Satz
Information erreicht in der Filiale Kaufland Langenfeld (Rheindorfer Str., ca. 70 Mitarbeitende) in Sekunden die richtige Person, in beide Richtungen, und jeder sieht, ob sie angekommen ist, wer sie übernommen hat und was passiert, wenn niemand reagiert.

Belegtes Kernproblem: Auf kununu ist „Kommunikation“ der schwächste Faktor bei Kaufland (3,0 von 5); Infos kommen zu spät oder gar nicht, Dienstpläne ändern sich ohne Absprache, Vorgesetzte stimmen sich kaum ab. Bisher: WhatsApp und Zuruf.

## 2. Leitprinzipien
1. **Jede Kommunikation hat einen Zustand**: gesendet → gesehen → quittiert/übernommen → erledigt. Ein Zustand ist immer sichtbar, für Sender und Empfänger.
2. **Niemand wartet still**: Jedes Element mit Reaktionspflicht hat eine Frist und eine **Eskalationskette**. Läuft die Frist ab, rückt es automatisch eine Stufe nach oben, sichtbar für alle Beteiligten („Wartet auf Schichtleitung seit 4 Min“).
3. **Drei Taps maximal** für die häufigsten Wege (Melden, Quittieren, Kassenruf, Antwort).
4. **Ein Daumen, Lärm, Handschuhe**: Ziele ≥ 48 px, Aktionen unten, Icon immer mit Text, Status nie nur über Farbe.
5. **Betriebsrat-tauglich** (keine Rechtsberatung): keine Ranglisten oder Leistungsvergleiche einzelner Personen, keine Auswertung „wer war wie schnell“, Stimmungsbarometer nur anonym und aggregiert (ab 5 Antworten), keine Benachrichtigungen außerhalb der eigenen Schicht.
6. **Nichts nachbauen, was Kaufland schon hat**: keine Preis-/ESL-, Kassen-, K-Scan- oder Bestellfunktionen.
7. Oberfläche **strikt Deutsch**; Inhalte (Nachrichten, Meldungen) lassen sich per KI in die Sprache des Lesers übersetzen und umgekehrt ins Deutsche.

## 3. Rollen und Hierarchie
Stufen (für die Eskalationskette, von unten nach oben):
1. Mitarbeiter/in, Azubi
2. Schichtleiter/in (je Schicht)
3. Teamleiter/in (je Abteilungsgruppe)
4. Admin vom Dienst (Disponent; Admins: Mustafa, Niels, Chiki, Marino, Arek – Marino ist zugleich Schichtleiter, im Demo-Datensatz als Admin geführt)
5. Stellv. Filialleiter/in, Filialleiter/in

Weitere Konten: Reinigung (eigener Account).
- Jeder Mitarbeitende ist Beobachter (Meldungen).
- Nur Mustafa sieht den KI-Sprachassistenten (Diktat → Aufgaben).
- Login: Konto wählen + PIN (Demo-PIN 1234). Im Filialmodus merkt sich die App pro claude.ai-Viewer, welches Konto er zuletzt nutzte.

## 4. Abteilungen, Tätigkeiten, Mengen
Abteilungen (15): Trocken sortiment, Getränkeabteilung, Kasse, Info, MoPro, Moon Food Abteilung, Alkoholische Getränke, Drogerie, Fertige Gerichte, Konserven, Obst und Gemüse, Backshop und Frischetheke, Lager, Wareneinnahme, Leergut.
Tätigkeiten mit Richtwert (Min): Warenverräumung 30, Grundordnung 20, Warenpflege 20, Aktionsregal aufbauen 45, Etikettierung 25, Plakate erstellen 30, Lücken füllen 20, Wareneinnahme 45, Leergut 30, Sonstiges 20.
Mengen nur als Paletten, KKP (Kaufland Klapp Pallets), Displays, Wagen. Keine Artikelnummern. Dringend = 🔥, keine Minutenangaben in Admin-Formularen.
Schichten: Früh 06–14, Spät 14–22 (Markt Mo–Sa 07–22).

## 5. Funktionsumfang

### M – Muss (Kommunikation, Kern)
**M1 Kommunikationsmotor (core/comm.js)** – gemeinsames Modell für alle „Vorgänge“ (Item): `{id, kind, from, to:{type:'person'|'dept'|'shift'|'role'|'all', ids[]}, title, body, lang, u (🔥), createdAt, ackDue, state, acks:{empId:ts}, seen:{empId:ts}, owner, esc:{level, at, history[]}, thread[]}`. Kinds: `post` (Anweisung/Info), `task` (Auftrag), `report` (Meldung von unten), `call` (Schnellruf), `sos`, `handover` (Schichtübergabe), `shiftreq` (Schichtänderung), `absence` (Ausfall). Funktionen: `send`, `markSeen`, `ack`, `take`, `done`, `remind` (Nachfassen an alle, die noch nicht quittiert haben), `escalateDue()` (idempotent, läuft bei jedem Tick in jeder offenen Leitungsansicht; setzt `esc.level` nur einmal pro Stufe), `waitingOn(item)` → Text „Wartet auf …“.
Eskalationsfristen Standard (änderbar im Admin unter Einstellungen): 🔥 Meldung 3 Min, Personalausfall 5, Defekt/Sicherheit 5, Kasse/Info-Ruf 2, Lücke/Preis/Reinigung 15, Sonstiges 20, Anweisung mit Pflicht-Quittung: bis Frist des Senders (Standard 30 Min, 🔥 10 Min). Kette: zuständige/r Schichtleiter/in der Abteilung und Schicht → Teamleiter/in → Admin vom Dienst → Filialleitung.

**M2 Anweisungen / Info-Board (top-down)** – Leitung sendet an Person, Abteilung, Schicht, Rolle oder alle. Optional „Pflicht-Quittung“. Empfänger sieht großen Knopf „Gelesen und verstanden“. Sender sieht Quittungsleiste „12 von 31 quittiert“, Liste der Offenen, Knopf „Nachfassen“. Abgelaufen → Schichtleitung der Offenen bekommt Hinweis. Kurzbriefing-Karte zum Schichtbeginn (die 3 wichtigsten Infos der Schicht, Pflicht-Quittung).

**M3 Aufträge (Aufgaben)** – Zwei Schritte „Gesehen/Starte“ → „Erledigt“, optional Foto-Nachweis, den die Leitung freigibt. Frist mit Countdown, Dringend zuerst. Meine / Frei / Erledigt, Filter Abteilung, „Übernehme ich“, „Zurückgeben“ (mit Grund), Rückfrage-Knopf öffnet Chat mit Auftraggeber. Automatische Verteilung (siehe M9). Vorlagen für wiederkehrende Aufträge, Checklisten-Rundgänge (Frische/MHD, Reinigung, Grundordnung) mit Uhrzeit und Eskalation, wenn nicht abgehakt.

**M4 Melden (bottom-up) in ≤ 3 Taps** – Kacheln: Lücke im Regal, Preis falsch, Reinigung nötig, Defekt (Kühlung/Kasse/Technik), Leergutautomat, Kunde braucht Hilfe, Personalausfall, Lieferung, Sicherheit, Sonstiges. Foto optional (bis 4), Text/Diktat in jeder Sprache (KI übersetzt ins Deutsche, Original bleibt). Abteilung vorbelegt mit eigener. Automatisches Routing an die zuständige Person (Kategorie + Abteilung + Schicht), z. B. Reinigung → Reinigungskonto, Defekt → Admin vom Dienst, Lücke → Schichtleitung der Abteilung. Melder sieht Zeitleiste und bekommt Rückmeldung bei jedem Schritt; Empfänger: Übernehmen, Weitergeben an …, ➕ Auftrag daraus, Erledigt (mit kurzer Antwort an Melder).

**M5 Schnellruf** – Ein Tap: „Kasse öffnen“, „Hilfe an Info“, „Hilfe Wareneingang“, „Alle zur Besprechung“. Geht an passende Personen im Dienst (nicht in Pause). Antwort „Ich komme“ / „Kann nicht“. Sobald genug zugesagt haben (Standard 1, Kasse 2), schließt der Ruf; Rufer sieht Namen. Keine Zusage nach 2 Min → Eskalation.

**M6 Chat** – 1:1 mit jedem Kollegen, Kanal je Abteilung und Kanal „Leitung“ (nur Schichtleitung und höher). Schnellantworten, Lesehaken (✓ gesendet, ✓✓ gelesen), Foto, Übersetzen-Knopf an jeder Nachricht, Banner bei neuer Nachricht. Direkt-Knöpfe zu den Admins.

**M7 SOS** – Diebstahl, Brand, Unfall. Signal an Leitung und Admins im Dienst, Hinweis 112/110 als Telefon-Links. Leitung antwortet „Hilfe kommt, ich gehe hin“; Auslöser sieht Namen. Ersthelfer-Liste mit Status.

**M8 Schichtübergabe** – Zusammenfassung automatisch (offene Aufträge, Meldungen, Restware, Reinigung), Hinweise ergänzen, an nächste Schicht senden; Empfang muss quittiert werden.

**M9 Verteilung und Limits** – Limit pro Person = (Vertragsstunden × 60 − Pause) × 0,8. Nie darüber, auch nicht per Selbstübernahme. Reihenfolge dringend → Frist: 1) gleiche Abteilung + passende Tätigkeit, 2) gleiche Abteilung, 3) passende Tätigkeit, 4) beliebig; geringste Auslastung gewinnt; außerhalb der eigenen Abteilung = „Hilfe“. In Pause bekommt niemand etwas. Pausenregel: bis 6 Std keine, bis 8 Std 30 Min, darüber 45 Min; Erinnerung nach 5,5 Std; überzogene Pause → Hinweis an Schichtleitung (ohne Ranking).

### S – Soll
- **S1 Leitungs-Live (Admin/Schichtleitung)**: oben „Brennpunkte“ (wartende Meldungen mit Eskalationsstufe, unquittierte Pflicht-Infos, unbesetzte 🔥-Aufträge, Rufe ohne Zusage, überlastete Abteilungen) mit Direkt-Aktion; darunter Personen der Schicht mit Status (frei, arbeitet an …, Pause bis …), Suche, Abteilungsfilter, je Person: Auftrag, Chat, Umsetzen (2 Std, 4 Std, dauerhaft). „Mein Team“ für Schichtleiter (eigene Abteilung).
- **S2 Schichtänderungen nur als Anfrage**: Leitung fragt „Kannst du Sa Spät übernehmen?“ → Mitarbeiter nimmt an / lehnt ab; Tauschbörse unter Kollegen mit Freigabe der Leitung; Änderungsprotokoll. Ausfallmeldung (krank, verspätet) → sofort an Schichtleitung + „Wer kann einspringen?“-Anfrage an passende Kollegen.
- **S3 Wareneingang**: LKW mit Paletten, KKP, Displays; Aufwand Palette 8, KKP 4, Display 6 Min; so viele Leute, dass in ca. 60 Min entladen; Ware getrennt Regalware/Werbung mit Palettenart und Lagerbereich; Wagen mit Etikett-Scan abschließen (BarcodeDetector, Handeingabe, Demo-Scan; Format- und Doppelprüfung; Offline-Warteschlange); beim letzten Wagen Bericht ans System.
- **S4 Beobachter-Extras**: Bruchware (als Abschreibung erfasst), Restware (Foto, Datum, Lagerplatz → Auto-Auftrag „einräumen“), Reinigung mit Status an Melder.
- **S5 Mein Plan**: Foto des Wochenplans, KI liest Zeiten/Pausen, Prüfansicht zum Korrigieren, Wochendiagramm. Admin: Dienstplan-Scan mit Vorschau gefunden/nicht gefunden.
- **S6 Kudos**: Leitung und Kollegen schicken Lob („Danke für …“), Kundenlob weitergeben. Keine Zähler pro Person in Ranglisten.
- **S7 Stimmungsbarometer**: am Schichtende 1 Tap (😀 🙂 😐 🙁), anonym, Anzeige für Filialleitung nur aggregiert ab 5 Antworten pro Schicht.

### K – Kann
- **K1** KI-Sprachassistent (nur Mustafa): Diktat → erkannte Aufträge mit Namenszuordnung (unbekannte rot) → bestätigen → verteilen.
- **K2** Einarbeitungs-Checkliste mit Pate/Patin.
- **K3** Admin vom Dienst umschaltbar; Weitergeben an anderen Admin.

## 6. Technik

### 6.1 Auslieferung
Am Ende **eine** HTML-Datei `dist/index.html` (Artifact). Entwicklung in Modulen unter `src/`, zusammengefügt von `build.js` (Node, keine Abhängigkeiten): fügt `design/tokens.css`, `design/components.css`, `src/app.css` und alle JS-Module in fester Reihenfolge (Liste in `build.js`) in `src/shell.html` ein. Kein Bundler, keine Frameworks, Vanilla JS (ES2020), alles in einem globalen Namespace `SN` (`window.SN = {}`), jedes Modul als IIFE, das `SN.<modul>` setzt. Keine externen Skripte; Fonts optional von Google Fonts.

### 6.2 Zwei Datenmodi hinter einer Store-Schnittstelle (`src/core/store.js`)
- **Demo-Modus** (Standard, wenn `claude.use('db')` null liefert oder Nutzer „Demo“ wählt): alles im Speicher, mit Demo-Datensatz (70 Mitarbeitende, Admins, Reinigung, Beispiel-Vorgänge). Ein Konto-Umschalter (Login) simuliert mehrere Geräte.
- **Filial-Modus** (wenn `db` verfügbar und Nutzer „Filialbetrieb“ wählt): gemeinsame Live-Datenbank des Artifacts. Alle mit Zugriff (claude.ai-Konto, Freigabe mindestens Contributor) sehen dieselben Daten live über `onSnapshot`. Startet leer: Einrichtungsassistent für Admin/Owner (Team anlegen, Dienstplan scannen). Keine fest eingebauten Seed-Daten in db.
- API (beide Modi identisch, alles asynchron, Änderungen kommen über Abo):
  `SN.store.init(mode)`, `SN.store.sub(col, cb)` (einmal je Collection beim Start, cb(arrayOfDocs)), `SN.store.get(col,id)`, `SN.store.put(col,id,obj)`, `SN.store.patch(col,id,partial)` (verschachtelte Objekte mergen, z. B. `{acks:{[empId]:ts}}` – so gibt es keine Konflikte bei gleichzeitigen Quittungen), `SN.store.del(col,id)`, `SN.store.mode`, `SN.store.status` (verbunden / lädt / offline).
  Collections (je eine Ebene, Dokument-ID = Element-ID): `staff`, `items` (alle Vorgänge aus M1), `chats` (ein Dokument pro Thread mit Array der letzten 200 Nachrichten, wegen Dokumentlimit 25.000), `templates`, `plans`, `settings` (Dokument `main`: Admin vom Dienst, Fristen), `mood` (Aggregat je Tag+Schicht: `{d:'2026-11-22', sh:'Früh', c:{1:0,2:3,3:1,4:0}}`), `trucks`, `goods`, `rest`, `breakage`, `log` (Änderungsprotokoll, aggregiert pro Tag).
  db-Regeln beim Veröffentlichen: Standard (alle mit Zugriff lesen, Contributor+ schreibt). Kein Personenbezug in `mood`.
- Lokaler UI-Zustand (Tab, Filter, Entwurf) bleibt im Speicher, optional `localStorage` in try/catch.

### 6.3 Zeit und Takt
Alle Zeitfunktionen über `SN.clock.now()` (überschreibbar für Tests). Ein zentraler Takt alle 15 s ruft `SN.comm.escalateDue()`, Erinnerungen, Pausenprüfung und rendert neu, wenn sich etwas geändert hat.

### 6.4 Oberfläche
- Shell aus dem Designsystem (Präfix der Klassen siehe `design/DESIGN.md`): rote Kopfzeile mit Logo, Name, Schicht-Pille, Status-Punkt der Verbindung (Demo / Live / offline); Inhalt; weiße Bottom-Navigation mit Badges; FAB „Melden“ für Mitarbeitende; SOS-Knopf.
- Router: `SN.ui.go(tab, params)`; jede Ansicht ist eine Funktion `(state) => htmlString` plus optional `mount(root)` für Events; Event-Delegation über `data-act` Attribute, registriert per `SN.ui.on('act-name', handler)`.
- Navigation je Rolle:
  - Mitarbeiter: Start (Kurzbriefing, Meine Aufträge, Infos zum Quittieren), Aufträge, Melden, Chat, Ich (Plan, Pause, Schichtanfragen, Profil).
  - Schichtleitung/Teamleitung: Start, Team (Live der Abteilung), Eingang (Meldungen an mich), Chat, Ich. Plus Senden (Anweisung/Auftrag/Ruf) als FAB.
  - Admin/Filialleitung: Live, Senden, Eingang, Chat, Mehr (Wareneingang, Ware, Team, Abteilungen, Vorlagen, Einstellungen, Stimmung, Protokoll) + KI (nur Mustafa).
  - Reinigung: Aufträge Reinigung, Chat.
- Benachrichtigungen in der App: Banner-Leiste oben (max. 2, Rest gesammelt), Toast, Badges, optional Vibration. Hinweis: echte Push-Nachrichten bei geschlossener App gehen hier nicht.

### 6.5 KI (nur in Claude verfügbar)
`SN.ai.sample()` kapselt `claude.use('sample')`: Übersetzen (Inhalte ↔ Deutsch), Plausibilität von Meldungen, Plan- und Dienstplan-Scan (Bilder), Diktat-Auswertung. Ohne KI: klare Hinweise, alles Manuelle funktioniert. Diktat über `claude.use('dictation')`.

### 6.6 Prüfung
`test/check.js` (Playwright, Chromium vorinstalliert): Syntax jedes Moduls, Build, Login jeder Rolle im Demo-Modus, jede Ansicht und jeder Unter-Tab, keine Konsolenfehler, keine horizontale Scrollbar bei 390 px, hell und dunkel. `test/flows.js`: End-to-end-Szenarien mit vorgespulter Uhr (M1–M8). Ein Mock von `claude.use('db')` (In-Memory mit `onSnapshot`) prüft den Filial-Modus mit zwei Seiten gleichzeitig (zwei Konten, live).

## 7. Modul- und Dateiaufteilung
```
src/shell.html            HTML-Gerüst mit Platzhaltern /*CSS*/ und /*JS*/
src/app.css               app-spezifische Ergänzungen zum Designsystem
src/core/util.js          esc, fmt (Zeit, Dauer), id(), clock, dom-Helfer
src/core/model.js         Konstanten (Abteilungen, Tätigkeiten, Rollen, Fristen), Rollenprüfungen, Hierarchie, zuständige Person finden
src/core/store.js         Store (Demo + db), Abos, Status
src/core/demo.js          Demo-Datensatz (nur Demo-Modus)
src/core/comm.js          Kommunikationsmotor M1 inkl. Eskalation, Routing
src/core/dist.js          Verteilung, Limits, Pausen
src/core/ai.js            KI- und Diktat-Hülle
src/ui/shell.js           Router, Navigation, Banner, Toast, Sheet, Takt, Login, Einrichtungsassistent
src/views/emp-*.js        Mitarbeiter-Ansichten
src/views/lead-*.js       Schicht-/Teamleitung
src/views/admin-*.js      Admin/Filialleitung
src/views/comm-*.js       Melden, Senden, Eingang, Chat, Ruf, SOS, Übergabe (rollenübergreifend)
src/views/ops-*.js        Wareneingang, Ware, Scan, Restware, Bruch, Reinigung, Plan
build.js                  baut dist/index.html
test/check.js, test/flows.js, test/db-mock.js
```

## 8. Fertig heißt
- `node build.js && node test/check.js && node test/flows.js` grün.
- Jede Muss-Funktion in mindestens einem Flow-Test.
- Keine englischen Texte in der Oberfläche.
- Dokumentiert in `README.md`: Modi, Freigabe für Filialbetrieb, was nur in Claude geht, Grenzen (keine Push bei geschlossener App, jeder Nutzer braucht ein claude.ai-Konto mit Zugriff).
