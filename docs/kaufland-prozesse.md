# Kaufland-Filiale: Prozesse und Passung zum Schicht-Navigator

Abrufdatum aller Quellen: **2026-11-23**. Zielfiliale: Langenfeld (Rheinland), ca. 70 Mitarbeitende.
Keine Rechtsberatung. Keine Namen von Privatpersonen.

> **Methodenhinweis (bitte zuerst lesen):** Seiten ließen sich in dieser Umgebung nicht direkt öffnen. Alle Angaben stammen aus **Websuche-Ergebnissen und deren Textauszügen**. Das ist ein schwächerer Beleg als eine selbst gelesene Seite. Wörtliche Zitate stehen nur, wo der Auszug den Originaltext lieferte. Kaufland veröffentlicht kaum Interna zu Filialabläufen; vieles ist deshalb nur über Stellenanzeigen, Presse und Bewertungsportale belegt. Was **nicht** belegt ist, steht in Abschnitt (g) und ist in den Tabellen als **Annahme** markiert. Die App-Spalte bezieht sich auf `SPEC.md`, `docs/ENTSCHEIDUNGEN.md` und `CLAUDE.md` (Stand 2026-11-23).

---

## (a) Kurzfazit

1. **Kaufland-Filialen laufen in festen Takten:** Frühverräumung ab ca. 05/06 Uhr, Wareneingang mit KKP (Kaufland Klapp-Palette) aus den Verteilzentren, Frische-/Hygienerunden, wöchentlicher Werbewechsel. **Neu und für die App wichtig:** Seit **12.10.2026** beginnt die Angebotswoche am **Montag** (statt Donnerstag), Angebote gelten Mo–Sa. [Q16, Q17]
2. **Hygiene ist das heikelste Thema:** Nach der Stern/RTL-Recherche 2025 nennt Kaufland selbst eine **zweimal tägliche** Kontrolle von Sauberkeit und Hygiene (Frischebereiche, Kühlmöbel) und unangekündigte externe Prüfungen (TÜV SÜD). [Q12, Q13] Eine App, die Rundgänge **mit Eskalation bei Nichterledigung** sichtbar macht, trifft genau diesen Schmerzpunkt. Sie darf aber keine Ranglisten von Personen bilden.
3. **Kaufland hat eine eigene Mitarbeiter-App, „Kaufland Connect“** (laut Kaufland-Seite: interne Informationen, Wettbewerbe, Rabatt-Infos, **Chatfunktion**; Nutzung freiwillig, zählt nicht als Arbeitszeit; Handysperre Pflicht). Ob und in welchem Umfang sie in Deutschland und in Langenfeld im Einsatz ist, ist **nicht belegt**; die Lebensmittel Zeitung berichtet nur vom Start in Tschechien und davon, dass sie „bald auch nach Deutschland“ kommen könnte. [Q9, Q10] **Das ändert die frühere Annahme „keine App vorhanden“ (research/kaufland-langenfeld.md)** und muss mit der Filialleitung geklärt werden, bevor der Chat der App als Kernfunktion gilt.
4. **Der Kern der App bleibt richtig:** Kaufland digitalisiert Preise (ESL), Kasse/K-Scan und Bestellvorschläge. Die Lücke ist der Informationsfluss Mensch–Mensch mit sichtbarem Zustand (gesendet, gesehen, quittiert, erledigt). Diese Einschätzung stützt kununu („Kommunikation“ schwächster Faktor). [Q18, Q19; Vorrecherche]
5. **Größte Lücken der App gegenüber den Prozessen:** (1) Prozess-Checklisten mit Takt für Frische/MHD, Kühlung, Öffnen/Schließen und **Montags-Werbewechsel**, (2) **Ruhezeit-Prüfung** bei Schichtänderungen (Spät bis 22 Uhr, Früh ab 6 Uhr = nur 8 Std Abstand), (3) **Tagesstatus je Prozess** für die Filialleitung statt je Person, (4) Kassenlage/Pausenplanung für die Schichtleitung.
6. **Rechtlich** sind drei Dinge für die App relevant: Pausen/Ruhezeit (ArbZG), Beschäftigtendatenschutz inklusive dienstlicher Messenger-Nutzung (§ 26 BDSG, DSGVO) und Mitbestimmung (§ 87 BetrVG, insbesondere Nr. 6: „Eignung zur Überwachung“ genügt). Die bisherigen Regeln der App (keine Ranglisten, Stimmung anonym ab 5) passen dazu.

---

## (b) Prozesstabelle

Legende „Beleg“: **B** = in Quelle belegt, **T** = teilweise/indirekt belegt (Stellenanzeige, Presse, andere Handelsunternehmen), **A** = Annahme (nicht belegt, bitte mit Filialleitung klären).
Priorität: **Muss / Soll / Kann**. „Heute“ = Stand der App laut SPEC.

| # | Prozess | Wer | Wann/Takt | Quelle (Beleg) | Schmerzpunkt der Kommunikation | Was die App heute abdeckt | Lücke/Vorschlag (Priorität) |
|---|---|---|---|---|---|---|---|
| 1 | **Wareneingang / Anlieferung** (KKP, Paletten, Rollwagen, Boxen) | Mitarbeiter Wareneingang/Lager, Verräumung; Disposition | Täglich, Lieferung aus Verteilzentrum; KKP wird seit 2020 zwischen Verteilzentren und Filialen eingesetzt (Metall, klappbar, 1,20 m hoch, stapelbar) | Q1, Q2 (B); Anlieferzeit Langenfeld nicht belegt (A) | Wer entlädt wann, wohin kommt welche KKP; Ware steht im Weg, wenn niemand weiß, dass der LKW da ist | M/S: Lieferung mit Personenzahl, Touren in Laufweg-Reihenfolge, Etikett-Scan je Einheit, Bericht ans System (`65-goods`, `66-scan`); Wochenplan Bedarf gegen Kapazität (`75-week`) | **Soll:** „LKW ist da“-Schnellruf mit Zusagen (gibt es als „Hilfe Wareneingang“); **Kann:** Rückführung leerer KKP/Wagen als Aufgabe mit Status |
| 2 | **Warenverräumung in der Frühschicht** | Verräumungs-Teilzeitkräfte, Abteilungen | Früh, laut Anzeigen z. B. 06–10 oder 06–12 Uhr; Frühbetrieb um ca. 5 Uhr (Obst schichten, Brötchen backen, Regale füllen). Paletten werden so zusammengestellt, dass sie in Regalreihenfolge eingeräumt werden können | Q3, Q4, Q5 (B/T) | Zuteilung am Morgen per Zuruf; Zeitdruck bis Ladenöffnung 07:00 | Aufträge mit Richtwert, automatische Verteilung nie über Limit, Warenverräumung 30 Min (`20-tasks`, `dist`) | **Soll:** „Bis 07:00 fertig“-Fortschrittsbalken je Abteilung für die Frühschichtleitung (nicht je Person) |
| 3 | **Frische-/MHD-Kontrollen und Hygienerunden** | Alle Abteilungsmitarbeiter; Frische/Obst & Gemüse/Theke besonders | Laut Kaufland-Aussage **zweimal täglich** Kontrolle Sauberkeit/Hygiene, Fokus Frischebereiche und Kühlmöbel; externe TÜV-SÜD-Prüfungen unangekündigt seit Sommer 2025 | Q12, Q13 (B, Aussage des Unternehmens) | Zeitdruck „auf Kosten der Hygiene“ (Presse); Mängel werden spät oder nicht gemeldet | Checklisten-Aufträge mit Eskalation (`escalate:true`), Melden „Reinigung nötig“ mit Foto, Reinigungskonto (`90-clean`) | **Muss:** feste **Rundgangs-Vorlage 2× täglich** je Zone mit Uhrzeit, Erinnerung, Eskalation und Tagesstatus für Filialleitung (siehe F1) |
| 4 | **Temperaturkontrolle Kühlung (HACCP)** | Abteilungen mit Kühlung (Molkerei, Fleisch/Wurst, Frische), Verantwortliche je Filiale | Rechtlich: Eigenkontrollen nach HACCP-Grundsätzen, Aufzeichnungen müssen Umsetzung belegen; konkrete Intervalle bei Kaufland **nicht belegt** | Q6, Q7, Q8 (B für Rahmen; Takt A). Kaufland tauscht Kühlung in Filialen aus, Kühlmöbel wurden in allen Filialen nachgereinigt (Q13) | Defekte Kühlung fällt spät auf; Meldung läuft über Zuruf | Melden „Defekt (Kühlung/Kasse/Technik)“ mit Eskalation 5 Min (SPEC M4) | **Muss:** Temperaturrunde als Checkliste (Gerät, Sollbereich, „in Ordnung / Abweichung“) mit Abweichung = 🔥-Meldung an Schichtleitung. **Wichtig:** ersetzt nicht die offizielle Dokumentation von Kaufland, bis die Filiale das freigibt (A) |
| 5 | **Preisauszeichnung / elektronische Preisschilder** | Obst & Gemüse und Backshop (ESL), übrige Bereiche je Filiale | Bei Preis-/Aktionswechsel; ESL erspart das Stecken von Etiketten | Q14 (B: ESL in O&G und Filial-Bäckereien), Q15; Entlastung laut älterer Pressemitteilung | Alte/falsche Schilder, vor allem nach Aktionswechsel (Kundenkritik Langenfeld, Vorrecherche) | Melden „Preis falsch“; Aufgabe Etikettierung 25 Min; **kein** ESL-Nachbau (Regel) | **Soll:** Aktion „Schilder-Check nach Werbewechsel“ als Teil der Montags-Vorlage (F2) |
| 6 | **Aktionswechsel / Werbewechsel** | Warenverantwortliche je Abteilung, Aktionsregal-Team, Schichtleitung | **Seit 12.10.2026 Montag** (bisher Donnerstag), Angebote Mo–Sa; Überschneidung der Wochen in den ersten Tagen | Q16, Q17, Q20 (B) | Was gilt noch, was nicht mehr, wo steht die neue Ware; Verwirrung beim Personal erwartet | Aktionsregal aufbauen 45 Min, Plakate 30 Min, Wochenplan (Mo–Sa) | **Muss:** **Montags-Paket** (Vorlage mit Rückbau alt, Aufbau neu, Schilder-Check, Foto-Abnahme je Abteilung) mit Fortschritt für Filialleitung (F2). Wochenplan-Prognose auf Montag-Wechsel prüfen |
| 7 | **Kassenbesetzung / Kassenaufsicht / SB-Kassen** | Kassierer/Info, Kassenaufsicht (Rolle in Stellenanzeigen, Arbeitgeber dort nicht eindeutig); K-Scan-Kontrolle durch Mitarbeiter | Laufend; Spitzen nach Feierabend und Samstag (A) | Q11 (T), Q21 (B: Mitarbeiter prüft K-Scan-Einkauf, Stichproben, Kontrollwaagen; Kaufland: Kassierzeiten werden nicht individuell ausgewertet) | Kassenruf per Zuruf; Schlange wird spät bemerkt | Schnellruf „Kasse öffnen“ mit „Ich komme“, schließt bei 2 Zusagen (M5) | **Soll:** „Kassenlage“-Anzeige (offen/Soll, 1 Tap von der Kassenaufsicht), kein Kunden- oder Leistungsdatenabgriff aus der Kasse (F5) |
| 8 | **Leergutrücknahme** | Mitarbeiter Leergut (eigene Anzeigen), teils Kassierer | Täglich; tägliche Reinigung der Automaten, Verräumen, Bereitstellen zur Abholung | Q11 (B: Anzeigen Kaufland) | Automat voll/defekt, Abholung nicht bereit | Melden „Leergutautomat“; Abteilung „Leergut“; Aufgabe Leergut 30 Min | **Kann:** Status „abholbereit“ als Übergabe-Hinweis |
| 9 | **Reinigung** | Reinigungskonto, Abteilungen, Verkaufsraum | Laufend, Grundreinigung der Filialen 2025 | Q12, Q13 (B) | Wer reinigt wann, Rückmeldung an Melder fehlt | Melden mit Status an Melder; Reinigungskonto (`90-clean`) | In F1 integrieren (Rundgang Hygiene) |
| 10 | **Warenbestellung / Bestellvorschläge** | Abteilungsverantwortliche prüfen und senden Vorschläge | Täglich/je Abteilung (A) | Q22 (B: System erzeugt Bestellvorschläge, Mitarbeitende prüfen und versenden) | Lücke im Regal, die Bestellung betrifft: Rückmeldung fehlt | Meldung „Lücke im Regal“ mit Rückmeldung (bestellt / im Lager / ausgelistet) | **Kann:** keine eigene Bestellfunktion (Regel); Rückmeldeknopf genügt |
| 11 | **Inventur** | Alle Bereiche, nach Zonen (A) | Üblicherweise jährlich, genaue Abläufe bei Kaufland **nicht belegt** | – (A, nichts gefunden) | – | Aufträge, Wochenplan, Verteilung | **Kann:** Zählzonen als Aufgaben verteilen (nur wer welche Zone, keine Zählwerte) |
| 12 | **Diebstahlprävention / Sicherheit** | Alle; Kasse/Kassenaufsicht; Leitung | Laufend; stichprobenartige Re-Scans und Kontrollwaagen bei K-Scan | Q21 (T) | Diskrete Meldung ohne Aufsehen; Leitung muss schnell erfahren | SOS (Diebstahl, Brand, Unfall) mit „Hilfe kommt“ (M7); Melden „Sicherheit“ | **Kann:** Diskrete Meldung „Verdacht“ ohne Personenfotos, mit kurzer Löschfrist (Datenschutz) |
| 13 | **Backshop / Backstation, Frischetheke** | Verkäufer Backshop (Fachverkäufer Nahrungsmittelhandwerk), Verkäufer Bedientheke, Auszubildende Verkäufer Frische | Früh ab ca. 5 Uhr (T); Backstationen laut Fachpresse, Details nicht im Auszug | Q23, Q24, Q25 (T) | Nachlegen/Backplan nach Kundenlage nur per Zuruf (A) | Abteilung „Backshop und Frischetheke“ als eine Einheit im Modell | **Kann:** „Nachbacken/Nachlegen“-Schnellruf an Backshop; keine Backplan-Funktion (Kaufland-Waage/Systeme) |
| 14 | **Schichtübergabe** | Schichtleitungen Früh → Spät | Zum Schichtwechsel (Früh 06–14, Spät 14–22 laut SPEC) | nicht belegt (A) | Infos gehen verloren („Informationen zu spät oder gar nicht“, kununu) | Automatische Zusammenfassung, Pflicht-Quittung der Empfangsschicht (M8) | In F4 um Hinweise aus Prozess-Checklisten ergänzen |
| 15 | **Dienstplanung und Änderungen** | Filialleitung/Abteilungsleitung (Personaleinsatzplanung) | Wochen-/Monatsplan; Kaufland: Mehrarbeit „sollte immer transparent abgesprochen werden“ | Q18, Q19 (B: Anzeige und kununu); verwendete Software **nicht belegt** (g) | Änderungen ohne Absprache; kurzfristige Ausfälle | Schichtänderung nur als Anfrage, Tauschbörse, Ausfall mit „Wer kann einspringen?“ (S2); Dienstplan-Foto mit KI (S5) | **Muss:** Ruhezeit- und Pausenprüfung bei jeder Anfrage (F3) |
| 16 | **Pausenregeln** | Alle; Schichtleitung plant | ArbZG § 4: mehr als 6 Std Arbeit → mindestens 30 Min Pause im Voraus feststehend, teilbar in Abschnitte ≥ 15 Min | Q26 (B); 45-Min-Stufe darüber siehe Hinweis unten | Alle gleichzeitig Pause (Kasse leer) | Limit-Formel mit Pause; Pause in der App („in Pause bis …“); Schnellruf sendet nicht an Pausierende | **Soll:** Pausenplan der Schicht mit Mindestbesetzung Kasse/Info (F6) |
| 17 | **Öffnen und Schließen** | Schichtleitung Früh (Öffnung) und Spät (Schluss); Markt Mo–Sa 07–22 | 07:00 / 22:00 (Öffnungszeiten laut Drittverzeichnissen; Vorrecherche) | Ablauf bei Kaufland **nicht belegt** (A) | Vergessene Punkte (Kühlung, Kassen, Leergut, Wareneingang) | Aufgaben/Checklisten allgemein; Tageszeit-Takt in der Demo | **Soll:** Öffnungs- und Schließ-Checkliste mit Abnahme durch Schichtleitung (F7) |
| 18 | **Interne Meldungen und Eskalation** | Alle; Leitung | Laufend | Q9, Q10 (Kaufland Connect: Chat, T); WhatsApp und Zuruf laut Auftraggeber (A, Vorrecherche) | Kein sichtbarer Zustand; private Messenger vermischen Dienst und Privat (Datenschutz) | Kommunikationsmotor, Eskalationskette, Quittung, Chat, Fotobericht (M1–M6) | **Muss (Klärung):** Verhältnis zu Kaufland Connect und Konzern-Vorgaben zu Messengern mit Filialleitung/Betriebsrat klären (F8) |
| 19 | **Ausbildung / Einarbeitung** | Auszubildende, Paten, Filialleitung | Ausbildung Verkäufer, Verkäufer Frische (2 Jahre), Kaufmann im Einzelhandel | Q24, Vorrecherche Q13 (B) | Einarbeitung wird laut kununu-Einzelstimmen schlecht erklärt | Azubi als unterste Stufe (SPEC); K2 zurückgestellt | **Kann:** K2 Einarbeitungs-Checkliste (je Abteilung) |

**Hinweis zur Pausenstufe:** Im Suchauszug bestätigt ist nur „mehr als 6 Std: 30 Min“ und „Teilung in Abschnitte ≥ 15 Min“ (§ 4 ArbZG). Die Regel der App (bis 6 Std keine, bis 8 Std 30, darüber 45) entspricht der gesetzlichen Grundstruktur, die 45-Min-Stufe ist nach meinem Wissen erst ab mehr als 9 Std gesetzlich; die App rechnet ab mehr als 8 Std also **vorsichtiger**. Das ist unkritisch, sollte aber mit Tarifvertrag und Filialleitung abgeglichen und als **Hausregel** gekennzeichnet bleiben (Kaufland-Tarif und Betriebsvereinbarung nicht recherchiert).

---

## (c) Rollen- und Abteilungsübersicht

### Rollen

| Rolle | Aufgabe (belegt) | Beleg / Hinweis | Entsprechung in der App |
|---|---|---|---|
| Filialleiter/in | Verantwortet sämtliche Abläufe der Filiale, von Warenverfügbarkeit bis Personaleinsatzplanung; Team von etwa 100 Mitarbeitenden (Anzeige, größere Filiale); analysiert betriebswirtschaftliche Daten, sichert Filialbild | Q27 (B) | Stufe 5, Übersicht Filialleitung |
| Stellv. Filialleiter/in | Für Kaufland **nicht belegt**; die gefundenen Anzeigen gehörten laut Suchauszug zu einem anderen Händler | (g) | Stufe 5 (Annahme) |
| Ressort-/Abteilungsleitung | Titel „Leiter Ware“ und „Leiter Frische“ in Anzeigen gefunden, **ohne** Aufgabenbeschreibung im Auszug | Q28 (T) | Stufe 3 „Teamleiter/in je Abteilungsgruppe“ (Annahme: ähnlich) |
| Kassenaufsicht | Stelle „Kassenaufsicht“ (Handel): Leitung des Kassiererteams, Einsatzplanung, Abrechnung Scannerkassen; **Arbeitgeber im Auszug nicht genannt** | Q29 (T) | Schichtleitung-Aufgabe, im Modell keine eigene Rolle |
| Schichtleiter/in | Für Kaufland **nicht belegt**; Begriff aus der App-Spezifikation | (g) | Stufe 2 |
| Mitarbeiter/in Verkauf, Kassierer/Info | Kassiervorgänge, Kundenberatung Info/Kasse, Reklamationen, Warenumtausch, Annahme Post/Paketlieferungen | Q11 (B, Anzeige Kaufland Dienstleistung) | Stufe 1 |
| Mitarbeiter Warenverräumung | Stundenweise tägliche Warenverräumung | Q3 (B) | Stufe 1 |
| Mitarbeiter Leergut | Pfandflaschen annehmen/sortieren, verräumen, Abholung bereitstellen, Automaten täglich reinigen | Q11 (B) | Stufe 1, Abteilung Leergut |
| Verkäufer Backshop, Verkäufer Bedientheke | Fachverkäufer Nahrungsmittelhandwerk bzw. Theke | Q23, Q24 (T) | Stufe 1, Backshop und Frischetheke |
| Auszubildende | Verkäufer/in (2 Jahre), Verkäufer/in Frische (2 Jahre; Fleisch, Wurst, Käse, Fisch; Bestellen, Wareneingang, Lagern, Beraten), Kaufmann/-frau im Einzelhandel; Trainee zur Führungskraft (Filiale) als Führungsweg | Q24, Q30 (B) | Stufe 1 (Azubi); Jugendarbeitsschutz **nicht recherchiert** |

### Abteilungen (Abgleich mit der App-Spezifikation, 15 Abteilungen)

| Abteilung (aus Auftrag) | Beleg Kaufland | In der App |
|---|---|---|
| Obst & Gemüse | ESL seit Jahren (Q14); Frühbetrieb Obst schichten (Q5) | Obst und Gemüse |
| Frische, Fleisch/Wurst-Theke, Käse, Fisch | Theken und Verkäufer Frische (Q24) | Backshop und Frischetheke (zusammengefasst); „MoPro“, „Fertige Gerichte“ |
| Backshop | Verkäufer Backshop, ESL in Filial-Bäckereien (Q14, Q23) | Backshop und Frischetheke |
| Molkerei | **nicht gesondert belegt** | MoPro (Annahme: Molkereiprodukte) |
| Trockensortiment | nicht gesondert belegt | Trockensortiment, Konserven |
| Getränke | Kategorien laut Vorrecherche | Getränkeabteilung, Alkoholische Getränke |
| Non-Food / Drogerie | Kategorie laut Vorrecherche | Drogerie |
| Kasse, Info | Q11 (B) | Kasse, Info |
| Leergut | Q11 (B) | Leergut |
| Wareneingang / Lager | Q1 (T) | Wareneinnahme, Lager |
| Sonstige in der App | – | Moon Food Abteilung (Filialbezeichnung der Auftraggeber, nicht recherchiert) |

---

## (d) Tagesablauf als Zeitleiste

> **Wichtig:** Die Zeiten sind eine **Arbeitshypothese** aus den belegten Eckpunkten (Verräumung 06–10/06–12 Uhr, Frühbetrieb ab ca. 05 Uhr, Markt 07–22 Uhr, Schichten Früh 06–14 und Spät 14–22 laut SPEC, Kontrolle zweimal täglich laut Kaufland). Alles andere ist **Annahme (A)** und mit Schichtleitung und Filialleitung zu bestätigen.

| Uhrzeit | Früh (06–14) | Spät (14–22) | Beleg |
|---|---|---|---|
| ca. 05:00 | Backshop und Obst & Gemüse beginnen (Brötchen backen, Obst schichten) | – | Q5 (T) |
| 06:00 | Schichtbeginn Früh; Übernahme der Schichtübergabe; Öffnungs-Checkliste (A) | – | SPEC (B), Ablauf (A) |
| 06:00–07:00 | Verräumung, Wareneingang, Aktionsaufbau; Ziel: Gänge frei bis Öffnung | – | Q3, Q4 (T) |
| **07:00** | **Markt öffnet**; Kassen und Info besetzen; Leergut öffnet (A) | – | Vorrecherche (Drittverzeichnisse) |
| Vormittag | **Hygiene-/MHD-Runde 1** (A: Uhrzeit); Temperaturrunde (A); Lieferung/KKP verräumen | – | Q12 (zweimal täglich, B) |
| Montag | **Werbewechsel**: Rückbau, Aufbau, Schilder-Check | – | Q16, Q17 (B) |
| 10:30–12:30 | Pausen Früh gestaffelt, Kasse besetzt halten (A) | – | § 4 ArbZG |
| 13:30–14:00 | Schichtübergabe vorbereiten (offene Aufträge, Meldungen, Restware) | – | SPEC M8 |
| **14:00** | Schichtende Früh | Schichtbeginn Spät, Übergabe quittieren | SPEC |
| Nachmittag | – | Kassenspitze (A), Nachverräumung, **Hygiene-/MHD-Runde 2** (A: Uhrzeit) | Q12 (B) |
| Abend | – | Pausen gestaffelt; Verräumung, Leergut abschließen (A) | A |
| 21:00–22:00 | – | **Marktschluss 22:00**, Kassenabrechnung, Schließ-Checkliste (A), Übergabe für Früh | Vorrecherche, A |

**Rechnung (kein Beleg, aber nachvollziehbar):** Spät endet 22:00, Früh beginnt 06:00 → **8 Std Abstand**. ArbZG § 5 verlangt mindestens **11 Std ununterbrochene Ruhezeit**. Ein Wechsel Spät → Früh am Folgetag ist also nur mit späterem Frühbeginn vertretbar. Die App sollte das bei Schichtanfragen und Einspringen prüfen (F3). Ausnahmen (§ 5 Abs. 2 und 3) gelten nur in bestimmten Fällen und müssen von der Filialleitung bewertet werden.

---

## (e) Priorisierte neue Funktionen für Steuerpult Schichtleitung und Übersicht Filialleitung

Priorität nach Nutzen für die Kommunikation und Risiko (Hygiene, Recht). Jede Funktion hält die Projektregeln ein: keine Ranglisten, keine Minutenangaben in Formularen, nichts nachbauen, was Kaufland hat.

| # | Funktion | Priorität | Für wen | Kern | Abgrenzung / Hinweise |
|---|---|---|---|---|---|
| F1 | **Rundgangs-Vorlagen Frische/MHD, Hygiene, Temperatur** (2× täglich, je Zone) | **Muss** | Schichtleitung (Steuerpult: Ampel je Zone), Filialleitung (Tagesstatus) | Vorlage mit Uhrzeit, Erinnerung, Abhaken, Foto optional, bei Abweichung 🔥-Meldung, bei Nichterledigung automatische Eskalation | Zeigt Zonen und Zeiten, **nie** „wer war schnell“; Temperaturwert nur je Gerät. Ersetzt nicht die offizielle HACCP-Dokumentation, solange Filiale und QS das nicht freigeben |
| F2 | **Montags-Werbewechsel-Paket** | **Muss** | Schichtleitung, Warenverantwortliche, Filialleitung | Wochenvorlage: Rückbau alt, Aufbau neu (Aktionsregal), Plakate, Schilder-Check; Foto-Abnahme je Abteilung; Fortschritt „6 von 10 Abteilungen fertig“ | Passt zur Umstellung auf Montag seit 12.10.2026; kein ESL-Nachbau, nur Abnahme |
| F3 | **Ruhezeit- und Pausen-Prüfung** bei Schichtanfragen, Tausch und Einspringen | **Muss** | Schichtleitung, Filialleitung, Mitarbeitende | Warnung „weniger als 11 Std Ruhezeit“ und fehlende Pause; Sperre oder Freigabe nur durch Leitung | Hinweis, keine Rechtsentscheidung; Hausregel der Pausenstufen mit Tarif abgleichen |
| F4 | **Filial-Tagesübersicht je Prozess** (nicht je Person) | **Muss** | Filialleitung | Ampel: Öffnung, Lieferung, Hygiene-Runden, Kühlung, Werbewechsel, Kasse, Leergut, offene 🔥, unquittierte Pflicht-Infos | Aus bestehenden Daten; Betriebsrat-tauglich, weil prozess- und zonenbezogen |
| F5 | **Kassenlage** (1 Tap): Kassen offen / Soll | **Soll** | Kassenaufsicht, Schichtleitung | Ergänzt Schnellruf „Kasse öffnen“, zeigt, ob der Ruf Wirkung hatte | Keine Daten aus der Kasse oder Kundenzählung; manuell |
| F6 | **Pausenplan der Schicht** mit Mindestbesetzung Kasse/Info | **Soll** | Schichtleitung | Wer geht wann; Warnung, wenn Mindestbesetzung unterschritten | Kein Vergleich von Personen; Pausen bleiben freiwillige Angaben |
| F7 | **Öffnungs- und Schließ-Checkliste** mit Abnahme durch Schichtleitung | **Soll** | Schichtleitung Früh/Spät | Punkte aus Filialpraxis (Ablauf nach Absprache), Abnahme als Teil der Übergabe | Inhalte liefert die Filialleitung (nicht recherchierbar) |
| F8 | **Abgrenzung zu Kaufland Connect und WhatsApp** | **Muss (Klärung)** | Filialleitung, Betriebsrat, Datenschutz | Entscheidung: Wird Connect in Langenfeld genutzt? Dann Chat der App überprüfen (Dopplung) oder Fokus auf Vorgänge mit Zustand statt Chat | Datenschutz-Argument für App gegenüber privatem WhatsApp, siehe (f) |
| F9 | **Besetzungsübersicht Soll/Ist je Schicht und Abteilung** | **Soll** | Filialleitung, Schichtleitung | Aus Dienstplan-Foto: wie viele je Abteilung und Stunde, Lücken sichtbar | Nur Köpfe und Stunden, kein Personenvergleich |
| F10 | **Leergut: „abholbereit“-Status**, Backshop: „Nachbacken“-Ruf | **Kann** | Schichtleitung | Zwei Zusatz-Schnellrufe | Keine Backplanung |
| F11 | **Inventur-Zählzonen als Aufgaben** | **Kann** | Filialleitung | Verteilt nur wer welche Zone zählt, keine Werte | Kaufland-Systeme bleiben führend |
| F12 | **Diskrete Meldung „Verdacht“** (Diebstahl) | **Kann** | Alle, Leitung | Schneller Weg zur Leitung, ohne Personenfoto | Kurze Löschfrist; Rechtsprüfung nötig |
| F13 | **Einarbeitungs-Checkliste mit Pate/Patin** (K2) | **Kann** | Auszubildende, neue Kräfte | Wie in SPEC K2; Inhalte je Abteilung | Jugendarbeitsschutz bei Minderjährigen vorher prüfen (nicht recherchiert) |

---

## (f) Rechtliche Rahmenbedingungen mit App-Bezug (knapp, **keine Rechtsberatung**)

| Thema | Kernaussage laut Quelle | Folge für die App | Quelle |
|---|---|---|---|
| **ArbZG § 4 Pausen** | Mehr als 6 Std ohne Pause nicht erlaubt; Mindestpause 30 Min im Voraus feststehend, teilbar in Abschnitte von mindestens 15 Min | Pausenlogik der App ist Planungshilfe; Pausenstufen (45 Min) mit Tarif abgleichen | Q26 |
| **ArbZG § 5 Ruhezeit** | Mindestens 11 Std ununterbrochen nach Arbeitsende; Verkürzung nur in Ausnahmefällen mit Ausgleich | Warnung bei Spät → Früh (F3); Benachrichtigungen nur in der Schicht (bereits Regel) | Q26 |
| **Hygiene/Lebensmittelrecht** | Betriebe müssen HACCP-Grundsätze anwenden und durch Aufzeichnungen belegen; Leitlinie des Handels (HDE) nach Art. 8 VO (EG) Nr. 852/2004 anerkannt; Temperaturgrenzwerte für Kühlung sind festzulegen. Konkrete Grenzwerte und deutsche LMHV-Texte **nicht im Auszug** | F1: Checklisten als Hilfe; offizielle Dokumentation bleibt beim Filialsystem | Q6, Q7, Q8 |
| **Datenschutz Beschäftigte** | § 26 BDSG als Grundlage der Verarbeitung; Einwilligung im Arbeitsverhältnis nur bei Freiwilligkeit; laut Quelle Zweifel, ob § 26 BDSG zu Art. 88 DSGVO passt; private Nummern von Kollegen weitergeben braucht Einwilligung; Betriebsvereinbarung als Grundlage empfohlen | Keine privaten Nummern nötig (App-Konten); Löschfristen (Fotos 30 Tage); Verzeichnis der Verarbeitungstätigkeiten und Datenschutzbeauftragte/r der Filiale einbinden | Q31, Q32, Q33 |
| **Messenger / WhatsApp dienstlich** | Mischung aus Privat und Dienst, Kontaktabgleich der Apps und Privatnummern sind datenschutzkritisch; klare Richtlinie empfohlen | Argument für dienstlichen Kanal (App), aber Konzernvorgaben und Kaufland Connect klären (F8) | Q32, Q34 |
| **Mitbestimmung § 87 Abs. 1 Nr. 6 BetrVG** | Technische Einrichtung, die zur Überwachung von Verhalten oder Leistung **geeignet** ist; Eignung genügt; Auswertung von Gruppendaten kann genügen, wenn der Druck auf Einzelne durchschlägt; BAG 1 ABR 16/23 (Headset-System) bejahte Nr. 6, zuständig war der Gesamtbetriebsrat | Keine Ranglisten (bereits Regel); Betriebsrat vor Echtbetrieb beteiligen; Zuständigkeit (örtlicher Betriebsrat oder Gesamtbetriebsrat) klären | Q35, Q36, Q37 |
| **Mitbestimmung bei Arbeitszeit (§ 87 Abs. 1 Nr. 2)** | In der Suche **nicht bestätigt**; bekannt als Mitbestimmung bei Beginn/Ende der Arbeitszeit und Pausen | Schichtänderungs- und Pausenfunktionen (S2, F3, F6) mit Betriebsrat abstimmen | – (g) |
| **Konzern-App Präzedenzfall** | Laut Überschrift der Lebensmittel Zeitung: „Kaufland App ist arbeitsrechtlich okay“ (Entscheid zur Mitarbeiterüberwachung); nach Suchauszug ging es um die Kundenfeedback-Funktion der Konzern-App, keine Überwachung, kein Mitbestimmungsrecht (Arbeitsgericht Heilbronn). Nicht auf andere Apps übertragbar | Kein Freibrief für die Schicht-App | Q10 |

---

## (g) Was nicht auffindbar war

- **Interne Filialabläufe von Kaufland** (Öffnungs-/Schließprozess, Schichtübergabe, Inventur, Temperaturrunden-Takt, Kassenabrechnung): nichts Belastbares gefunden. Tabellen und Zeitleiste sind dort **Annahmen**.
- **Rollen:** Stellv. Filialleitung, Abteilungsleitung und Schichtleitung bei Kaufland ohne Aufgabenbeschreibung; nur Stellentitel („Leiter Ware“, „Leiter Frische“) und eine „Kassenaufsicht“-Anzeige mit unklarem Arbeitgeber.
- **Dienstplan-Software** und ob Beschäftigte sie auf dem Smartphone sehen: nicht gefunden. Kaufland Connect nennt laut Auszug **keinen** Dienstplan.
- **Kaufland Connect in Deutschland:** Einführungsstand und Funktionsumfang nicht belegt (nur Tschechien-Start, Chatfunktion laut Kaufland-Seite).
- **Mitarbeiter-Handhelds/Scanner in der Filiale:** nur Nutzerkommentar (nicht offiziell) über einen Scanner mit Nachkontrollliste; Datenbrillen nur Logistik (Vorrecherche).
- **Nutzung von WhatsApp/Telefon in Langenfeld:** nur durch Auftraggeber belegt, nicht durch öffentliche Quellen.
- **Anlieferzeiten, Größe, Kassenzahl der Filiale Langenfeld:** nicht auffindbar.
- **Tarifvertrag Einzelhandel NRW** (Pausen, Zuschläge, Spät-/Früh-Regeln), **Betriebsvereinbarungen** bei Kaufland, **Jugendarbeitsschutz** bei Azubis: nicht recherchiert.
- **Deutsche Gesetzestexte** zu Lebensmittelhygiene (LMHV) und konkrete Kühltemperaturen: nicht im Auszug.
- **Erfahrungsberichte von Beschäftigten** zu Werbewechsel, Wareneingang, Frühschicht: keine direkten Berichte gefunden; nur Stellenanzeigen und Presse.

---

## Quellenliste (alle Abrufdatum 2026-11-23, über Websuche, Seiten nicht direkt geöffnet)

Bereits in `research/kaufland-langenfeld.md` geführte Quellen (kununu, ESL, Bestellunterstützung, K-Scan usw.) sind dort nachzulesen.

- Q1 Kaufland-Klapp-Palette, Lebensmittel Zeitung: https://www.lebensmittelzeitung.net/tech-logistik/nachrichten/Statt-Europalette-Kaufland-kommt-mit-eigener-Klapppalette-149045
- Q2 Eurotransport – Kaufland führt Klapp-Palette ein: https://www.eurotransport.de/logistik/spedition-und-logistik/ersatz-fuer-europalette-kaufland-fuehrt-klapp-palette-ein/
- Q3 Arbeitsagentur – Mitarbeiter Warenverräumung 06–12 Uhr: https://www.arbeitsagentur.de/jobsuche/jobdetail/19220-96b770c10db51aef-S
- Q4 Kaufland Unternehmenspresse (Paletten in Regalreihenfolge, Logistik): https://unternehmen.kaufland.de/presse/content/download/17053/196413?version=1
- Q5 echo24 – Kaufland-Radio vor Ladenöffnung (Frühbetrieb): https://www.echo24.de/verbraucher/geheimes-kaufland-radio-mitarbeiter-vor-ladenoeffnung-hoeren-wunsch-musik-filiale-94449759.html
- Q6 IHK Dortmund – HACCP in der Praxis: https://www.ihk.de/dortmund/menue/branchen/dienstleistungen/gaststaettengewerbe/haccp-in-der-praxis-303694
- Q7 IHK Potsdam – Lebensmittelhygiene: https://www.ihk.de/potsdam/ihk-service-und-beratung/brancheninfos2/handel/lebensmittelhygiene-2329890
- Q8 Lebensmittelverband – Leitlinie Temperaturanforderungen: https://www.lebensmittelverband.de/fileadmin/Seiten/Lebensmittel/Sicherheit_und_Recht/Hygiene/leitlinie-temperaturanforderungen-2006.pdf
- Q9 Kaufland – Kaufland Connect App (englisch): https://filiale.kaufland.de/service/kaufland-connect-app/kaufland-connect-app-en.html
- Q10 Lebensmittel Zeitung – Mitarbeiter-App Kaufland Connect geht in Tschechien live: https://www.lebensmittelzeitung.net/tech-logistik/nachrichten/mitarbeiter-app-kaufland-connect-geht-in-tschechien-live-160948 ; „Kaufland App ist arbeitsrechtlich okay“: https://www.lebensmittelzeitung.net/handel/karriere/Neuer-Entscheid-zur-Mitarbeiterueberwachung-Kaufland-App-ist-arbeitsrechtlich-okay-130936 ; App-Store-Eintrag: https://apps.apple.com/us/app/-/id1515906948
- Q11 Arbeitsagentur – Kassierer/Mitarbeiter Information, Kaufland Dienstleistung: https://www.arbeitsagentur.de/jobsuche/jobdetail/19220-9b78fdbb2eab43ee-S ; Mitarbeiter Leergut: https://www.arbeitsagentur.de/jobsuche/jobdetail/19220-7aedd22b4584a2d8-S
- Q12 Mobiflip – Kaufland lässt Filialen vom TÜV SÜD auf Hygiene prüfen: https://www.mobiflip.de/kaufland-laesst-filialen-vom-tuev-sued-auf-hygiene-pruefen/ ; Lebensmittelpraxis: https://lebensmittelpraxis.de/handel-aktuell/45371-sauberkeit-und-hygiene-kaufland-laesst-filialen-vom-tuev-sued-pruefen.html
- Q13 web.de – Kaufland-Chef zum Hygieneskandal: https://web.de/magazine/ratgeber/finanzen-verbraucher/kaufland-chef-aeussert-hygieneskandal-40842652 ; t-online – Hygiene-Neustart: https://www.t-online.de/leben/aktuelles/id_100666250/kaufland-skandal-klappt-der-hygiene-neustart-beim-supermarkt-.html
- Q14 t-online – Digitale Preisschilder in Filial-Bäckereien: https://www.t-online.de/digital/aktuelles/id_100726094/kaufland-digitale-preisschilder-jetzt-auch-in-filial-baeckereien.html
- Q15 Retail Optimiser – ESL Bäckereien (SoluM, Hanshow): https://retail-optimiser.de/en/kaufland-introduces-digital-labels-in-the-store-bakeries-with-solum-and-hanshow/
- Q16 Lebensmittelpraxis – Kaufland verlegt Angebotsstart auf den Montag: https://lebensmittelpraxis.de/handel-aktuell/50023-werbung-kaufland-verlegt-angebotsstart-auf-den-montag.html
- Q17 ms-aktuell – Kaufland ändert den Wochenrhythmus: https://ms-aktuell.de/welt/kaufland-angebote-montag-05-10-2026/ ; echo24: https://www.echo24.de/verbraucher/kaufland-aendert-angebots-rhythmus-was-in-der-erstem-woche-kompliziert-wird-94528982.html
- Q18 kununu – Kaufland Kommentare (Dienstplan, Kommunikation): https://www.kununu.com/de/kaufland/kommentare
- Q19 Arbeitsagentur – Filialleiter (Großraum Köln): https://www.arbeitsagentur.de/jobsuche/jobdetail/19220-39cd07bcc364f5d6-S
- Q20 Techbook – Kaufland Angebote Umstellung: https://www.techbook.de/shop-pay/shops-marktplaetze/kaufland-angebote-umstellung
- Q21 Berliner Kurier – Kaufland baut SB-Kassen aus (Re-Scans, Kontrollwaagen): https://www.berliner-kurier.de/panorama/kaufland-baut-sb-kassen-aus-verschwinden-normale-kassen-li.10030984 ; t-online – strengere Regel an der Kasse: https://www.t-online.de/leben/aktuelles/id_100928022/kaufland-supermarkt-kette-testet-strengere-regel-an-der-kasse.html
- Q22 Kaufland Corporate Blog – Digitale Bestellunterstützung: https://unternehmen.kaufland.de/presse/kaufland-corporate-blog/wie-funktioniert-eine-digitale-bestellunterstuetzung
- Q23 Arbeitsagentur – Verkäufer Backshop: https://www.arbeitsagentur.de/jobsuche/jobdetail/19220-092d954c1322e385-S
- Q24 ausbildung.de – Verkäufer Frische 2026 (Beispiel Neuss): https://www.ausbildung.de/stellen/ausbildung-zum-verkaeufer-frische-m-w-d-2026-bei-kaufland-in-neuss-c30defda-5f18-45bb-9fe4-03199698e609/ ; Arbeitsagentur Verkäufer Bedientheke: https://www.arbeitsagentur.de/jobsuche/jobdetail/19220-fd890dff9ee3ced2-S
- Q25 Lebensmittel Zeitung – Kaufland rollt Backstationen aus: https://www.lebensmittelzeitung.net/handel/nachrichten/Kaufland-Rollt-Backstationen-aus-98759
- Q26 Gesetze im Internet – ArbZG: https://www.gesetze-im-internet.de/arbzg/BJNR117100994.html ; § 5: https://www.gesetze-im-internet.de/arbzg/__5.html
- Q27 Arbeitsagentur – Filialleiter: siehe Q19; Kaufland Trainee-Broschüre: https://unternehmen.kaufland.de/presse/content/download/10588/107393?version=1
- Q28 Stellentitel „Leiter Ware“ und „Leiter Frische“ (Jobbörse): https://mynejo.com/en-at/job/leiter-ware~1321bbcd-a182-4e45-9bdd-dcded13ab672 ; https://mynejo.com/job/leiter-frische~1f5cdb90-ecb1-42ae-90eb-3cc57c7d9790
- Q29 Arbeitsagentur – Kassenaufsicht (Arbeitgeber nicht genannt): https://www.arbeitsagentur.de/jobsuche/jobdetail/12608-1421449-58841-1-S
- Q30 jobteaser – Trainee zur Führungskraft Filiale (Kaufland): https://www.jobteaser.com/fr/job-offers/e119aba6-d413-4404-b47e-8999b1c33fe5-kaufland-trainee-zur-fuhrungskraft-filiale-m-w-d-2026-grossraum-krefeld-krefeld
- Q31 Dr. Datenschutz – Einsichtnahme in E-Mail- und WhatsApp-Verläufe: https://www.dr-datenschutz.de/grenzen-der-einsichtnahme-in-e-mail-und-whatsapp-verlaeufe/
- Q32 Dr. Datenschutz – Private und dienstliche Absprachen über Messenger: https://www.dr-datenschutz.de/private-und-dienstliche-absprachen-ueber-messenger-dienste/
- Q33 LfD Niedersachsen – Hinweise Beschäftigtendatenschutz: https://lfd.niedersachsen.de/download/127627
- Q34 LTO – Beruflicher Einsatz von Messengerdiensten: https://www.lto.de/karriere/im-job/stories/detail/messenger-apps-smartphone-arbeitsplatz-berufliche-nutzung-datenschutz
- Q35 Bundesarbeitsgericht – 1 ABR 16/23: https://www.bundesarbeitsgericht.de/wp-content/uploads/2024/11/1-ABR-16-23.pdf
- Q36 Haufe – Kommentar § 87 BetrVG, Verhaltens- und Leistungskontrolle: https://www.haufe.de/id/kommentar/tillmannsheiseua-betrvg-87-mitbestimmungsrechte-83-verhaltens-und-leistungskontrolle-HI612677.html
- Q37 Weka – Mitarbeiter-Apps, so bestimmt der Betriebsrat mit: https://www.weka.de/betriebsrat-personalrat/mitarbeiter-apps-so-bestimmt-der-betriebsrat-mit/ ; betriebsrat.de – technische Kontrolleinrichtungen: https://www.betriebsrat.de/betriebsratslexikon/br/technische-kontrolleinrichtungen
