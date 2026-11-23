# Entscheidungen – Schicht-Navigator

Stand 2026-11-23. Für jede Funktion: welche Möglichkeiten es gab, was gewählt wurde, warum, und womit es geprüft ist. Offene Punkte, die nur die Filiale entscheiden kann, stehen am Ende.

Leitfrage bei jeder Entscheidung: **Wird die Kommunikation zwischen Leitung und Mitarbeitenden schneller und nachvollziehbarer – ohne Mehraufwand auf der Fläche und betriebsratstauglich?**

## 1. Architektur und Betrieb

| Thema | Möglichkeiten | Entscheidung | Begründung | Geprüft durch |
|---|---|---|---|---|
| Datenhaltung | (a) nur im Browser · (b) Claude-Artifact-Datenbank · (c) eigener Server · (d) Firebase/Supabase | **(c) eigener Server**, (b) und Demo bleiben als Modi | Geräte ohne claude.ai-Konto müssen mitmachen; keine Bindung an Dritt-Clouds mit Personaldaten; Server ohne Abhängigkeiten ist leicht zu prüfen | `server.test.js`, `server-flows.js` |
| Live-Übertragung | Polling · WebSocket · Server-Sent Events | **SSE** | Ein Kanal Server→Gerät reicht, Schreiben per REST; läuft durch jeden Proxy, automatische Wiederverbindung | `server-flows.js` (Foto erscheint ohne Neuladen) |
| Gleichzeitige Änderungen | Sperren · Versionsnummern · tiefes Mergen | **Tiefes Mergen pro Feld** (`acks: {person: zeit}`) | Quittungen vieler Personen gleichzeitig gehen nie verloren; Sperren würden die Fläche ausbremsen | `server.test.js` (PATCH-Merge) |
| Ohne Netz | Fehlermeldung · Warteschlange | **Warteschlange** auf dem Gerät, automatisch nachsenden | Lager und Kühlräume haben oft kein Netz | `server-flows.js` (offline melden → kommt an) |
| App-Form | PWA · Capacitor-APK · native Android-App | **Capacitor-APK** + Web | Ein Code für Web und Android; Kamera und Datei-Upload funktionieren; native App wäre doppelter Aufwand | APK gebaut, Inhalt = aktueller Build |
| Hosting | Render · Railway · Fly.io · PC in der Filiale | **Render** (empfohlen), Railway/Fly als Alternative | HTTPS und Festplatte ohne eigene Technik; Filial-PC nur im WLAN erreichbar | `render.yaml`, `railway.json`, `fly.toml`, `docs/DEPLOY.md` |
| Push bei geschlossener App | Web Push · Firebase Cloud Messaging · keine | **Vorerst keine** – Banner, Badges, Eskalation beim Öffnen | FCM braucht ein Firebase-Projekt der Filiale und klare Regeln „keine Benachrichtigung außerhalb der Schicht“ (Betriebsrat) | – (offen, s. Ende) |
| Symbole und Optik | (a) Emojis · (b) fremde Icon-Bibliothek · (c) eigenes SVG-Sprite; flach · Glas | **(c) eigenes Sprite (24-px-Raster, 1,75 px Strich, outline; gefüllt nur für „aktiv“) + Glas-Look** (`.sn-glass`, Bottom-Nav und Sheets als Glas, Fallback deckend ohne `backdrop-filter`) | Emojis sehen je Gerät anders aus und sind schlecht lesbar; ein Satz Icons bleibt einheitlich, offline und in Hell/Dunkel gleich. Dringend = Flammen-Icon **plus** Wort. In Daten stehen nur Texte, Icons entstehen in der Darstellung (Feld `icon` = Sprite-Name). Bewegung nur Transparenz/Position, aus bei `prefers-reduced-motion` | `test/icons.test.js` (Namen im Sprite, kein Emoji im Text), `test/check.js` |

## 2. Anmeldung und Sicherheit

| Thema | Möglichkeiten | Entscheidung | Begründung | Geprüft durch |
|---|---|---|---|---|
| Zugang zum Server | offen · Filial-Schlüssel · Konten je Person | **Filial-Schlüssel** (Pflicht) + PIN je Person | Einfach einzurichten; ohne Schlüssel kein Lesen/Schreiben (401) | `server.test.js` |
| PIN-Speicherung | Klartext · Hash · Server-Prüfung | **SHA-256-Hash; im Server-Modus prüft nur der Server**, Hashes gehen nie an Geräte | Vorher konnte jedes Gerät alle PINs lesen | `server.test.js`, `core.test.js` |
| Raten von PINs | ohne Grenze · Sperre | **Sperre nach 8 Fehlversuchen / 5 Min** | 4-stellige PINs sind sonst in Sekunden erraten | `server.test.js` (429) |
| Grenze (ehrlich) | – | PIN bleibt Bequemlichkeit, keine starke Anmeldung | Für echte Konten (z. B. Firmen-Login) braucht es die IT von Kaufland | – |

## 3. Kommunikation (Kern)

| Thema | Möglichkeiten | Entscheidung | Begründung | Geprüft durch |
|---|---|---|---|---|
| Zustand je Vorgang | nur „gesendet“ · Lesebestätigung · Quittung + Übernahme | **gesendet → gesehen → quittiert/übernommen → erledigt** | Größtes Problem laut kununu: Infos kommen nicht an, niemand weiß, ob gelesen | `flows.js` |
| Wenn niemand reagiert | nichts · Erinnerung · Eskalation | **Automatische Eskalation** Schichtleitung → Teamleitung → Admin vom Dienst → Filialleitung | „Niemand wartet still“; Fristen je Art einstellbar | `flows.js`, `core.test.js` |
| Fristen | fest · je Art · je Fall | **je Art** (z. B. Personalausfall 5, Lücke 15, 🔥 3 Min), in Einstellungen änderbar | Dringendes braucht kurze, Kleinkram lange Fristen | `core.test.js` |
| Schichtübergabe-Frist | ab Versand · ab Schichtbeginn | **ab Beginn der Empfangsschicht** | Sonst „überfällig seit 12 Std“ am Morgen | `core.test.js` |
| Melden von unten | Formular · Kacheln | **9 Kacheln, ≤ 3 Taps**, automatisches Routing | Auf der Fläche zählt jede Sekunde | `flows.js` |
| „Kunde braucht Hilfe“ | als Meldung · als Schnellruf · gar nicht | **entfernt** (Wunsch der Filiale); „Hilfe an Info“ bleibt als Schnellruf | Doppelte Wege verwirren | `core.test.js` |
| Schnellruf | Chat · Ruf mit Zusagen | **Ruf mit „Ich komme“**, schließt bei genug Zusagen (Kasse 2) | Ersetzt Zuruf und Lautsprecher | `flows.js` |
| Fotobericht SL → FL | Chat-Foto · eigener Vorgang | **Eigener Vorgang** mit Status, Ungesehen-Feed, Schnellantworten, Eskalation nach 20 Min | Laufende Lageberichte ohne WhatsApp, nachvollziehbar | `server-flows.js` |
| Übersetzung | Oberfläche mehrsprachig · Inhalte übersetzen | **Oberfläche Deutsch, Inhalte per KI** übersetzbar | Vorgabe „strikt Deutsch“, trotzdem verständlich für alle | `check.js` (keine fremdsprachigen UI-Texte) |

## 4. Ware und Arbeit

| Thema | Möglichkeiten | Entscheidung | Begründung | Geprüft durch |
|---|---|---|---|---|
| Mengenmodell Lieferung | Paletten/KKP/Displays · KKP/Paletten/Boxen · Artikel | **KKP · Paletten · Boxen** (Displays bleiben bei Ware/Werbung) | So kommt die Ware tatsächlich; keine Artikelnummern | `server-flows.js` |
| KKP mit Ware für mehrere Abteilungen | als 1 Einheit · Zuschlag je Abteilung | **4 Min + 3 Min je Abteilung** | Laufwege kosten Zeit; 1 KKP mit 5 Abteilungen ≈ 19 Min | `server-flows.js` |
| Personenzahl | fest · nach Aufwand | **Aufwand ÷ 60 Min Ziel**, höchstens wer frei im Dienst ist | Lieferung soll in ~1 Std weg sein | `server-flows.js` |
| Verteilung auf Touren | zufällig · gleich viele Einheiten · nach Minuten | **Nach Minuten ausgeglichen**, Abteilungen in Laufweg-Reihenfolge | Gleich lange Touren, kurze Wege | `server-flows.js` |
| Abschluss je Einheit | Häkchen · Etikett-Scan | **Etikett-Scan** (Kamera, Eingabe, Demo), Format- und Doppelprüfung; letzte Tour → „Bericht ans System“ | Nachweis ohne Zusatzaufwand, Fehler fallen sofort auf | `flows.js` |
| Restware / Bruch | nur Admin · alle | **alle** über „Melden“ | Jede/r ist Beobachter; Restware wird automatisch zum Auftrag | `flows.js` |
| Verteilung von Aufträgen | manuell · automatisch | **automatisch, nie über das Limit**; Reihenfolge: gleiche Abteilung + Tätigkeit → Abteilung → Tätigkeit → beliebig | Gerecht und gesetzeskonform | `core.test.js`, `flows.js` |
| Wochenplan | nur Anzeige · Prognose + Verteilen | **Prognose je Tag → Bedarf ↔ Kapazität → Verteilen** | Lagerlast vorausplanen statt am Morgen improvisieren | `server-flows.js` |
| Dienstplan einlesen | abtippen · Foto + KI | **Foto + KI mit Vorschau** (gefunden / nicht gefunden / mehrdeutig), nur Bestätigtes | KI kann Namen falsch lesen – Mensch entscheidet | `flows.js` |

## 5. Betriebsrat und Datenschutz

| Thema | Entscheidung | Begründung |
|---|---|---|
| Leistungsdaten | **Keine Ranglisten, keine Vergleiche, keine Auswertung „wer war wie schnell“** | § 87 Abs. 1 Nr. 6 BetrVG: Eignung zur Überwachung reicht |
| Stimmung | **anonym, nur Summe je Schicht, erst ab 5 Antworten** | Rückschlüsse auf Einzelne vermeiden |
| Fotos | **Löschfrist 30 Tage** (`MEDIA_DAYS`), danach „Fotos entfernt“ | Auf Fotos können Personen sein |
| Benachrichtigungen | **nur in der eigenen Schicht** | Keine Erreichbarkeit in der Freizeit |
| Doppelte Systeme | **keine** Preis-, Kassen-, K-Scan- oder Bestellfunktionen | Gibt es bei Kaufland schon |

## 6. Bewusst zurückgestellt

| Funktion | Warum noch nicht | Was nötig wäre |
|---|---|---|
| Einarbeitungs-Checkliste mit Pate/Patin (K2) | Nutzen erst nach Start im Echtbetrieb sichtbar; Vorlagen + Checklisten decken es teilweise ab | Inhalte je Abteilung von der Filialleitung |
| Push bei geschlossener App | s. oben | Firebase-Projekt, Regel „nur in der Schicht“, Betriebsrat |
| Echte Konten statt PIN | Braucht Firmen-Login | IT von Kaufland |

## 7. Offene Entscheidungen für die Filiale

1. **Aufwandswerte prüfen:** KKP 4 + 3 je Abteilung, Palette 8, Box 2, Ziel 60 Min – mit echten Zeiten einer Woche abgleichen (änderbar in den Einstellungen).
2. **Etikett-Format:** derzeit 8–20 Zeichen, Ziffern/Großbuchstaben. Bitte ein echtes Etikett (Foto) geben, dann wird das Format exakt geprüft.
3. **Eskalationsfristen** mit Schichtleitungen durchgehen (Einstellungen → Fristen).
4. **Server:** Render-Dienst anlegen (Plan Starter) oder Alternative wählen.
5. **Betriebsrat und Datenschutz** vor dem Echtbetrieb einbinden (Löschfrist, Zugänge, Fotos). Keine Rechtsberatung.

---

# Erweiterung 2026-11-23: Steuerpult, Übersicht, Design, Kaufland-Prozesse

Ausführliche Tabellen mit Optionen, Begründung und Tests: `docs/entscheidungen-steuerpult.md` (Schichtleitung), `docs/entscheidungen-uebersicht.md` (Filialleitung). Hintergrund: `docs/kaufland-prozesse.md` (Recherche, 37 Quellen, belegt/Annahme je Zeile).

## 8. Rollen-Oberflächen

| Rolle | Möglichkeiten | Entscheidung | Begründung | Geprüft durch |
|---|---|---|---|---|
| Schichtleitung | gleiche Ansicht wie Mitarbeitende · eigenes Steuerpult | **Steuerpult** statt „Start“: Ampel je Prozessbereich aus echten Daten, „Als Nächstes“ (max. 3), Meldung nach oben in 2 Taps, Rundgänge, Team | Soll die Schicht steuern, ohne von der Fläche weggezogen zu werden | `lead.test.js`, `flows-lead.js` |
| Ruhiger Modus | alles melden · nur Kritisches | **Ruhig bis Schichtende**: nur SOS, Eskalation an mich und Rufe unterbrechen; Rest sammelt sich im Steuerpult | Konzentration auf der Fläche; nichts geht verloren | `flows-lead.js` |
| Filialleitung | Einzel-Ansichten · Sammelübersicht | **Übersicht** mit Reitern Meldungen (Kennzahlen als Filter, Stundenverlauf) und Anwesenheit (im Dienst, frei, Pause, abwesend, Soll/Ist je Abteilung) | Ein Blick statt fünf Listen | `overview.test.js`, `flows-overview.js` |
| Personalpflege | Formular in „Mehr“ · eigene Ansicht | **Eigene Ansicht „Personal“**: anlegen, ändern, entfernen, PIN (Hash), Abwesenheit (ohne Diagnose), Umsetzen, Wochenplan, Protokoll | Filialleitung soll Personal selbst pflegen | `flows-overview.js` |
| Rechte bei Personal | alle dürfen alles · Rangprüfung | **Nur gleich- oder höherrangig bearbeiten**, nicht über eigener Stufe vergeben | Admin darf per PIN-Reset nicht als Filialleitung auftreten | `overview.test.js` |
| Abwesenheitsgrund | für alle sichtbar · nur Berechtigte | **Nur Admin-Gruppe in der Oberfläche**; Grenze: steht im Personaldokument (echte Trennung braucht Server-Rollenrechte) | Betriebsrat-Regel; offene Grenze ehrlich benannt | – |

## 9. Design

| Thema | Möglichkeiten | Entscheidung | Begründung | Geprüft durch |
|---|---|---|---|---|
| Emojis | beibehalten · Icon-Set | **Einheitliches Icon-Set (120 Symbole)**, auch je Abteilung ein Icon und vier Stimmungs-Gesichter; Dringend = Flamme **und** Wort | Hochwertiger, auf allen Geräten gleich, Status nie nur über ein Symbol | `icons.test.js` (kein Emoji im UI, jedes Icon vorhanden) |
| Stil | flach · Glas | **Halbtransparente Glas-Panels** (Blur, feine Kante), schwebende Navigation mit gleitendem Indikator, Federkurve bei Sheets; ohne `backdrop-filter` deckender Fallback | Moderner, „teurer“ Eindruck bei ruhiger Bedienung | Screenshots, `check.js` |
| Bewegung | keine · sanft | **Fade/Slide 180–240 ms, gestaffelte Listen, hochzählende Zahlen**, alles aus bei „Bewegung reduzieren“; blockiert nie Eingaben | Barrierefrei und schnell | `check.js` |

## 10. Aus der Kaufland-Recherche übernommen

| Prozess (Quelle: `docs/kaufland-prozesse.md`) | Möglichkeiten | Entscheidung | Begründung | Geprüft durch |
|---|---|---|---|---|
| Ruhezeit nach ArbZG § 5 (Spät bis 22 Uhr → Früh ab 6 Uhr = nur 8 Std) | nur warnen · Anfrage verhindern | **Schichtanfrage wird gar nicht gesendet und Annahme abgelehnt**, wenn weniger als 11 Std Ruhe (gegen Vortag und Folgetag), mit Begründung | Gesetzlich vorgeschrieben; Anfragen, die abgelehnt werden müssen, kosten Zeit | `ops.test.js` |
| Werbewechsel (Angebotswoche beginnt seit 12.10.2026 montags) | Einzelaufträge · Paket | **Paket „Werbewechsel“**: je Abteilung ein Auftrag mit Checkliste (Rückbau, Aufbau, Schilder prüfen) und Foto-Nachweis mit Freigabe, Fortschritt „x von y“; einmal pro Tag | Montags laufen alle Abteilungen parallel; Leitung sieht den Stand | `ops.test.js` |
| Frische-/MHD-/Hygiene-/Temperaturrunden (Kaufland nennt Kontrolle zweimal täglich) | Vorlagen · Steuerpult-Rundgänge | **Rundgänge im Steuerpult** mit „In Ordnung/Mangel“; Mangel erzeugt Auftrag oder Meldung (Kühlung: dringend an Admin). Ersetzt **nicht** die offizielle HACCP-Dokumentation | Abweichungen sofort sichtbar | `lead.test.js` |
| Filial-Tagesübersicht je Prozess | je Person · je Prozess | **Ampel je Prozess**, nie je Person | Betriebsrat-tauglich | `lead.test.js` |
| Pausenregel | 45 Min ab > 9 Std (gesetzlich) · ab > 8 Std (Hausregel) | **Hausregel bleibt (ab > 8 Std 45 Min)**, im Tarifvertrag gegenprüfen | Vorsichtiger als das Gesetz | – |

## 11. Neu offen für die Filiale

1. **Kaufland Connect:** Die Recherche fand eine Mitarbeiter-App mit Chat (Start in Tschechien belegt; Deutschland/Langenfeld nicht belegt). Mit Filialleitung, Betriebsrat und Datenschutz klären, wie der Schicht-Navigator dazu steht – vor dem Echtbetrieb.
2. **Sollwerte:** Kühlung (Temperaturgrenzen), Fälligkeiten der Rundgänge (jetzt Frische 9 und 17 Uhr), Soll-Besetzung je Abteilung und Schicht (jetzt Annahmen: Kasse 4, Wareneingang 2, Obst/Gemüse 2, Backshop 2, sonst 1).
3. **Alte Titel mit Emojis** in einer bestehenden Datenbank werden nicht migriert (neue sind sauber).

## 12. Foto entlang der Hierarchie (ersetzt den Messenger)

| Thema | Möglichkeiten | Entscheidung | Begründung | Geprüft durch |
|---|---|---|---|---|
| Wer darf Fotos nach oben schicken | nur Schichtleitung · alle | **Alle, immer eine Stufe höher**: Mitarbeitende → zuständige Schichtleitung (Abteilung + Schicht), Schichtleitung → Filialleitung (dazu Admin vom Dienst, Teamleitung), Admin → Filialleitung | Jeder Weg, den heute WhatsApp übernimmt, hat einen festen Empfänger mit Status | `flows-photo.js` |
| Empfänger wählen | frei · feste Stufen | **Standard = eine Stufe höher**, eine Zweitwahl als Chip; keine freie Personenauswahl | Verhindert den Umweg „an irgendwen schicken“ und hält Zuständigkeit klar | `flows-photo.js` |
| Wenn niemand reagiert | nichts · Eskalation | **Foto rückt nach 20 Min (🔥 10 Min) eine Stufe höher** (vorher fehlte die Eskalation für Fotos im Modell – behoben) | Gleiches Prinzip wie bei allen Vorgängen: niemand wartet still | `flows-photo.js` |
| Antwort an den Absender | Chat · am Foto | **Schnellantworten am Foto** („Passt so“, „Bitte nachbessern“ …), Absender sieht sie auf dem Start („Antworten auf deine Fotos“) | Ein Tap statt Tippen; Verlauf bleibt am Vorgang | `flows-photo.js` |
| Foto im Chat | nicht erlauben · erlauben | **Erlaubt** (Kamera-Knopf im Chat) | Rückfrage mit Bild ohne Messenger-Wechsel | `flows-photo.js` |
| Foto von oben nach unten | nur Text · Referenzfoto | **Referenzfoto an Anweisung und Auftrag** („So soll es aussehen“, bis 2) | Soll-Zustand zeigen statt beschreiben | `flows-photo.js` |
| Datenschutz | – | Löschfrist 30 Tage gilt für alle Fotos (`MEDIA_DAYS`); keine Personenaufnahmen verlangen | Siehe Abschnitt 5 | `server.test.js` |
| Technische Absicherung | – | **Keine Neuzeichnung, solange Kamera/Dateiauswahl offen ist**, damit ein gewähltes Foto nicht verloren geht | Auf dem Telefon bleibt die Seite im Hintergrund aktiv | `flows-photo.js` |
