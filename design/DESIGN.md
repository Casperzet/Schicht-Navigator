# Schicht-Navigator v2 – Designregeln

Dateien: `tokens.css` (Variablen) → `components.css` (Klassen) → `showcase.html` (alle Beispiele, beide CSS-Dateien inline).
Wer `tokens.css` oder `components.css` ändert, muss die beiden `<style id="sn-tokens">` / `<style id="sn-components">`-Blöcke in `showcase.html` mit aktualisieren.

## Prinzipien

1. **Wichtigstes zuerst.** Reihenfolge auf jeder Seite: SOS → Eskalation → Quittierpflicht → eigene Aufgaben → Rest.
2. **Ein Daumen, Handschuhe.** Jedes Bedienelement ≥ 48 px (`--sn-touch`), Primäraktionen 56 px, „Quittieren“/SOS 64 px. Aktionen unten (`.sn-actionbar`, Sheet-Fuß, FAB) statt oben.
3. **Nie nur Farbe.** Dringend = 🔥 + Wort + dicker Balken. Eskaliert = Warnstreifen + „Eskaliert · Stufe n“. Lesestatus = Haken-Form + Wort. Präsenz = Kreis / Quadrat / Ring.
4. **Ruhe.** Weiß/Grau als Fläche, Rot nur für Marke, Primäraktion und Dringlichkeit. Maximal **eine** rote Primäraktion pro Karte bzw. Bildschirmbereich.
5. **Immer Text am Icon.** Auch in Kopfzeile, Bottom-Nav und Icon-Buttons (`.sn-btn--icon`).
6. **Deutsch, kurz, konkret.** Verben auf Buttons („Quittieren“, „Weitergeben“), Uhrzeiten statt „bald“ („bis 10:30 · noch 43 Min“).

## Namenskonventionen

| Muster | Bedeutung | Beispiel |
|---|---|---|
| `--sn-*` | Token (CSS-Variable) | `--sn-accent`, `--sn-space-4` |
| `.sn-block` | Komponente | `.sn-card`, `.sn-btn` |
| `.sn-block__element` | Teil einer Komponente | `.sn-card__title` |
| `.sn-block--modifier` | Variante | `.sn-card--urgent`, `.sn-btn--ack` |
| `.is-*` | Laufzeit-Zustand (per JS) | `.is-open`, `.is-done`, `.is-active`, `.is-invalid`, `.is-acked` |
| ARIA | Zustand, der auch vorgelesen wird – wird direkt gestylt | `aria-current="page"`, `aria-selected`, `aria-pressed` |

Komponenten verwenden nur **semantische** Tokens (`--sn-surface`, `--sn-urgent-fg` …), nie Rohfarben – nur so funktioniert der Dunkelmodus.
Theme: automatisch über `prefers-color-scheme`; Override mit `<html data-theme="light">` bzw. `"dark"`.
Icons: inline SVG-Sprite (`<svg class="sn-icon"><use href="#i-check"/></svg>`), Strich 2 px, 24 px – Sprite steht oben in `showcase.html`.

## Tokens (Kurzüberblick)

- Farben: `--sn-bg | surface | surface-2 | surface-3 | text | text-muted | border | border-strong | accent | accent-text | on-accent | header-bg | nav-*`, Status je `-bg / -fg / -line` für `urgent | warn | ok | info | neutral`, Eskalation `--sn-escalate-stripe-a/b`, `--sn-focus` (blau, damit auf Rot sichtbar).
- Abstände 4-px-Raster `--sn-space-1…9`, Rand `--sn-gutter` 16 px.
- Größen `--sn-touch 48`, `--sn-touch-lg 56`, `--sn-touch-xl 64`, `--sn-header-h 64`, `--sn-nav-h 68`, `--sn-app-max 480`.
- Radien `xs 4 · sm 8 · md 12 · lg 16 · xl 24 · pill`. Schatten `--sn-shadow-1/2/3/fab`.
- Typo: Barlow (Text) + Barlow Condensed (Titel, Zahlen). Skala 13 · 14 · 16 · 18 · 22 · 28 · 36 px. Nichts unter 13 px.
- Z-Ebenen: sticky 10 · header 20 · nav 30 · fab 40 · banner 50 · sheet 60 · toast 70 · **sos 90**.
- Bewegung: `--sn-dur-instant 80 / fast 140 / base 220 / slow 320 / pulse 1400 ms`; bei `prefers-reduced-motion` alle 0, SOS-Puls und Skeleton-Schimmer aus.

## Komponenten – wann und wie

### App-Shell
Immer: rote Kopfzeile mit weißem Logo, Inhalt scrollt, weiße Bottom-Nav (4–5 Ziele). Detailseiten: „Zurück“ statt Logo, Bottom-Nav darf durch `.sn-composer` oder `.sn-actionbar` ersetzt/ergänzt werden.
```html
<div class="sn-app">
  <header class="sn-header">
    <span class="sn-header__logo" aria-hidden="true"><svg><use href="#i-logo"/></svg></span>
    <div class="sn-header__text"><h1 class="sn-header__title">Guten Morgen, Anna</h1>
      <p class="sn-header__sub">Drogerie · Frühschicht 06:00–14:30</p></div>
    <button class="sn-header__action"><svg class="sn-icon"><use href="#i-user"/></svg>Profil</button>
  </header>
  <main class="sn-main">…</main>
  <nav class="sn-nav" aria-label="Hauptnavigation">
    <a class="sn-nav__item" href="#" aria-current="page"><span class="sn-nav__icon"><svg class="sn-icon"><use href="#i-home"/></svg></span>Start</a>
    <a class="sn-nav__item" href="#"><span class="sn-nav__icon"><svg class="sn-icon"><use href="#i-chat"/></svg><span class="sn-badge">2</span></span>Chat</a>
  </nav>
</div>
```
Badge: nur Zahl ungelesener/offener Dinge, ab 100 „99+“. `.sn-badge--urgent` (mit 🔥) nur bei dringenden.

### Karten
- **Aufgabe** `.sn-card.sn-task` – Titel, Status-Chip, `.sn-meta` (Frist, Ort, Von/Zuständig), max. 2 Aktionen.
- **Nachricht/Rundruf** `.sn-card.sn-message` – Absender, Text, Frist, großer Quittieren-Button. Nach Quittierung `.is-acked`.
- **Meldung** `.sn-card.sn-report` – Kategorie, Foto, Gemeldet/Zuständig, Lesestatus; bei Eskalation `--escalated` + `.sn-steps`.
- **Person** `.sn-card` + `.sn-person` – Avatar mit Präsenz, Name, Bereich, *ein* Status-Chip.
- Modifier: `--urgent` (🔥, roter Balken), `--escalated` (Warnstreifen), `.is-done` (grau, durchgestrichen).
```html
<article class="sn-card sn-card--urgent sn-task">
  <div class="sn-card__flag">🔥 Dringend</div>
  <div class="sn-card__head"><h3 class="sn-card__title">Aktionsware Gang 7 auffüllen</h3><span class="sn-chip">Offen</span></div>
  <dl class="sn-meta">
    <div class="sn-meta__item"><svg class="sn-icon"><use href="#i-clock"/></svg><dt class="sn-sr-only">Frist</dt><dd class="sn-deadline">bis 10:30 · noch 43 Min</dd></div>
    <div class="sn-meta__item"><dt>Von</dt><dd>Sandra P.</dd></div>
  </dl>
  <div class="sn-card__actions">
    <button class="sn-btn sn-btn--primary"><svg class="sn-icon"><use href="#i-play"/></svg>Starten</button>
    <button class="sn-btn sn-btn--secondary"><svg class="sn-icon"><use href="#i-chat"/></svg>Nachfragen</button>
  </div>
</article>
```

### Status-Chips, Frist, Lesestatus
- Chips: `--urgent` 🔥 · `--escalated` · `--warn` · `--ok` · `--info` · neutral · `--outline` (Abteilung) · `--solid` („Neu“). Immer Icon/Emoji **oder** eindeutiges Wort.
- Frist: `.sn-deadline` (normal) · `--soon` (≤ 15 Min, ⏳) · `--overdue` („überfällig seit …“).
- Lesestatus: `.sn-receipt--sent` ✓ „gesendet“ · `--read` ✓✓ „gelesen“ · `--ack` ✓✓ grün hinterlegt „quittiert“.
```html
<span class="sn-chip sn-chip--urgent">🔥 Dringend</span>
<span class="sn-receipt sn-receipt--ack">quittiert 09:15</span>
<span class="sn-deadline sn-deadline--overdue">überfällig seit 12 Min</span>
```

### Fortschritt / Timer-Ring
`.sn-ring` mit `--p` (0–100). Farbe: `--ok` (läuft gut), `--warn` (Frist naht), `--danger` (abgelaufen). `--lg` für Hero, `--on-accent` auf Rot. Für Timer `role="timer"`, sonst `role="img"` mit `aria-label`.
```html
<div class="sn-ring sn-ring--warn" style="--p:56" role="timer" aria-label="Reaktionsfrist">
  <span><span class="sn-ring__value">08:24</span><span class="sn-ring__label">bis Stufe 4</span></span>
</div>
```
Lineare Variante: `.sn-progress > .sn-progress__bar` mit `--p`.

### Buttons
| Klasse | Wann |
|---|---|
| `--primary` | die *eine* Hauptaktion |
| `--secondary` | Alternative (schwarzer Rahmen) |
| `--ghost` | Abbrechen, Schließen, „Wer fehlt?“ |
| `--danger` | beendende/zerstörende Aktion (schwarz, im Dunkelmodus weiß) |
| `--ack` | Quittieren, SOS – 64 px, volle Breite; nach Klick `.is-done` + Uhrzeit |
| `--hold` | Auslösen nur per 2 s Halten (SOS), Füllstand über `--hold` |
| `--icon` | Icon über Kurztext (Foto, Sprechen, Senden) |
| `--lg`, `--block` | 56 px / volle Breite |
```html
<button class="sn-btn sn-btn--ack"><svg class="sn-icon"><use href="#i-check"/></svg><span>Quittieren</span></button>
```

### Segment-Tabs
2–3 Filter derselben Liste (Offen/Erledigt). Nicht für Navigation zwischen Bereichen (dafür Bottom-Nav).
```html
<div class="sn-segment" role="tablist">
  <button class="sn-segment__tab" role="tab" aria-selected="true" aria-controls="p-open">Offen <span class="sn-badge">3</span></button>
  <button class="sn-segment__tab" role="tab" aria-selected="false" aria-controls="p-done" tabindex="-1">Erledigt</button>
</div>
```

### Bottom-Sheet
Kurze Entscheidungen im Kontext (Weitergeben, Pause starten, Frist wählen). Max. 1 Sheet gleichzeitig, kein Sheet über SOS. Schließen per Button mit Text, Hintergrund-Tipp und Esc.
```html
<div class="sn-sheet is-open" role="dialog" aria-modal="true" aria-labelledby="s-t">
  <div class="sn-sheet__backdrop" data-sheet-close></div>
  <div class="sn-sheet__panel">
    <div class="sn-sheet__handle"></div>
    <div class="sn-sheet__head"><h2 class="sn-sheet__title" id="s-t">Weitergeben an …</h2>
      <button class="sn-btn sn-btn--ghost" data-sheet-close>Schließen</button></div>
    <div class="sn-sheet__body">…</div>
    <div class="sn-sheet__foot"><button class="sn-btn sn-btn--primary sn-btn--lg">Weitergeben</button></div>
  </div>
</div>
```

### Toast
Bestätigung nach Aktion (≤ 4 s), optional „Rückgängig“. Nie für Fehler, die eine Entscheidung verlangen (dann Banner/Sheet). Region `.sn-toast-region` mit `aria-live`.
```html
<div class="sn-toast sn-toast--ok" role="status"><span class="sn-toast__icon"><svg class="sn-icon"><use href="#i-check"/></svg></span>
  <span class="sn-toast__text">Quittiert – Leitung sieht es sofort</span><button class="sn-toast__action">Rückgängig</button></div>
```

### Alarm-Banner
- `--sos`: Notfall, Vollrot, pulsiert, `role="alert"`, oberste Ebene, Aktionen „Ich komme“ / „112 anrufen“.
- `--escalation`: etwas ist bei dir gelandet, weil andere nicht reagiert haben (schwarz + Warnstreifen).
- `--warn` / `--info`: Hinweise ohne Zwang. `--sticky` klebt unter der Kopfzeile, `--card` mit Radius im Inhalt.
```html
<div class="sn-alert sn-alert--escalation sn-alert--sticky" role="alert">
  <span class="sn-alert__icon"><svg class="sn-icon"><use href="#i-escalate"/></svg></span>
  <p class="sn-alert__title">Eskaliert an dich: Kühlregal 3</p>
  <p class="sn-alert__text">Abteilungsleitung hat 15 Min nicht reagiert</p>
  <div class="sn-alert__actions"><button class="sn-btn sn-btn--on-accent">Übernehmen</button></div>
</div>
```

### Formular
Label immer sichtbar über dem Feld, Schrift 17 px (kein iOS-Zoom), Rand 2 px. Fehler: `.sn-field.is-invalid` + `.sn-field__error` mit Icon und Satz. Auswahl mit wenigen Optionen als `.sn-choice`-Kacheln statt Select.
```html
<div class="sn-field is-invalid">
  <label class="sn-label" for="w">Zuständig</label>
  <input class="sn-input" id="w" aria-invalid="true" aria-describedby="w-e">
  <p class="sn-field__error" id="w-e">Bitte eine Person oder Abteilung wählen.</p>
</div>
<fieldset class="sn-choices"><legend class="sn-label">Frist</legend>
  <label class="sn-choice"><input type="radio" name="f" checked><span>15 Min</span></label>
  <label class="sn-choice"><input type="radio" name="f"><span>Schichtende</span></label>
</fieldset>
<label class="sn-check"><input type="checkbox" checked>Quittierung verlangen</label>
<label class="sn-switch">Foto als Nachweis<input type="checkbox" role="switch"></label>
```

### Leerer Zustand / Skeleton
`.sn-empty` (positiv: `--ok` „Alles erledigt“) mit genau einer Folgeaktion. Skeleton (`.sn-skel--title/--line/--avatar/--btn`) ab 300 ms Ladezeit, Container mit `aria-busy="true"`.
```html
<div class="sn-empty sn-empty--ok"><span class="sn-empty__icon"><svg class="sn-icon"><use href="#i-check"/></svg></span>
  <p class="sn-empty__title">Alles erledigt</p><p class="sn-empty__text">Neue Aufgaben erscheinen hier sofort.</p></div>
```

### Chat
`.sn-bubble` (eingehend), `--out` (eigene, mit Lesestatus), `--urgent` (mit `.sn-bubble__tag` und Quittier-Button in der Blase). Systemereignisse als `.sn-chat__system`. Eingabe: `.sn-composer` mit „Sprechen“ + „Senden“.
```html
<div class="sn-bubble sn-bubble--out"><p class="sn-bubble__text">Ja, mach ich.</p>
  <div class="sn-bubble__meta">09:03 <span class="sn-receipt sn-receipt--read">gelesen</span></div></div>
```

### Empfangsbestätigungs-Leiste
Für jeden Rundruf mit Quittierpflicht in der Leitungsansicht. Segmente über `--n` (Anzahl), Muster: quittiert = voll, gelesen = Schraffur, gesendet = Punkte. „Erinnern“ geht nur an die Fehlenden.
```html
<section class="sn-ackbar">
  <div class="sn-ackbar__head"><p class="sn-ackbar__count">12 <small>von 31 quittiert</small></p><span class="sn-ackbar__pct">39 %</span></div>
  <div class="sn-ackbar__bar" role="img" aria-label="12 quittiert, 9 gelesen, 10 nur gesendet">
    <span class="sn-ackbar__seg sn-ackbar__seg--ack" style="--n:12"></span>
    <span class="sn-ackbar__seg sn-ackbar__seg--read" style="--n:9"></span>
    <span class="sn-ackbar__seg sn-ackbar__seg--sent" style="--n:10"></span>
  </div>
  <div class="sn-ackbar__actions"><button class="sn-btn sn-btn--secondary"><span>Erinnern · 19</span></button></div>
</section>
```

### Schnellaktions-Kacheln & FAB
Kacheln (`.sn-tiles`, 2 Spalten, ≥ 96 px): max. 4–6 häufigste Aktionen auf der Startseite, SOS als `--sos`. FAB (`.sn-fab`, immer mit Text): genau eine Erstell-Aktion pro Bildschirm, nur wenn keine `.sn-actionbar` sichtbar ist.
```html
<div class="sn-tiles">
  <button class="sn-tile"><svg class="sn-icon sn-icon--lg sn-tile__icon"><use href="#i-camera"/></svg>
    <span><span class="sn-tile__label">Problem melden</span><span class="sn-tile__sub">Foto + Ort</span></span></button>
</div>
<button class="sn-fab"><svg class="sn-icon"><use href="#i-plus"/></svg>Aufgabe</button>
```

## Do / Don't

| Do | Don't |
|---|---|
| 🔥 + „Dringend“ + roter Balken | nur roter Text oder nur 🔥 |
| Fristen als Uhrzeit + Restzeit („bis 10:30 · noch 43 Min“) | „bald“, „asap“, reine Countdowns ohne Uhrzeit |
| Eine rote Primäraktion pro Karte | zwei rote Buttons nebeneinander |
| Aktionen unten (Actionbar, Sheet-Fuß) | wichtige Buttons in der Kopfzeile |
| Icon **mit** Text, auch in der Nav | Icon-only-Buttons (Ausnahme: keine) |
| Zuständigkeit immer namentlich („Thomas K. (Marktleitung)“) | „wird bearbeitet“ ohne Namen |
| Lesestatus als Haken **und** Wort | nur graue/blaue Haken |
| SOS nur per Halten auslösen | SOS mit einfachem Tipp oder in Menüs versteckt |
| Rot sparsam: Marke, Primär, Dringend | rote Flächen als Deko (Hero-Kästen, Abschnittsbalken) |
| Tokens verwenden | Hex-Werte in Komponenten |

## Kontraste (WCAG 2.1, gemessen in showcase.html via Playwright)

Ziel: Text ≥ 4,5 : 1, Bedienelement-Kanten/Fokus ≥ 3 : 1. Alle Paare bestehen.

| Paar | Tokens | Hell | Dunkel |
|---|---|---|---|
| Haupttext auf Hintergrund | `text` / `bg` | 16,47 | 17,42 |
| Haupttext auf Karte | `text` / `surface` | 18,42 | 15,62 |
| Sekundärtext auf Hintergrund | `text-muted` / `bg` | 6,72 | 9,43 |
| Sekundärtext auf Karte | `text-muted` / `surface` | 7,51 | 8,46 |
| Kopfzeile Weiß auf Rot | `header-text` / `header-bg` | 4,94 | 5,64 |
| Primär-Button Weiß auf Rot | `on-accent` / `accent` | 4,94 | 4,94 |
| Roter Akzenttext auf Karte | `accent-text` / `surface` | 6,39 | 6,21 |
| Nav aktiv | `nav-active` / `nav-bg` | 6,39 | 6,21 |
| Nav inaktiv | `nav-text` / `nav-bg` | 7,51 | 8,46 |
| Dringend (Chip) | `urgent-fg` / `urgent-bg` | 7,10 | 9,60 |
| Warnung (Chip) | `warn-fg` / `warn-bg` | 7,78 | 9,75 |
| OK / quittiert | `ok-fg` / `ok-bg` | 7,25 | 9,34 |
| Info / gelesen | `info-fg` / `info-bg` | 7,65 | 8,76 |
| Neutral | `neutral-fg` / `neutral-bg` | 8,98 | 9,90 |
| Formular-Rand (≥ 3) | `border-strong` / `surface` | 3,86 | 5,02 |
| Fokusring (≥ 3) | `focus` / `bg` | 5,71 | 9,17 |

Hinweis: Markenrot `#e10915` mit Weiß liegt bei 4,94 : 1 – reicht für AA, aber nicht für AAA. Rot deshalb nie als Text auf hellem Grau verwenden; dafür gibt es `--sn-accent-text` (#c00812). Die Tabelle wird in `showcase.html` (Abschnitt 7) live aus den Tokens neu berechnet.
