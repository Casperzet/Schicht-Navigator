# Server in Betrieb nehmen

Der Server hält die gemeinsamen Daten aller Geräte (Aufträge, Meldungen, Fotoberichte, Chat, Lieferungen, Wochenplan) und verteilt jede Änderung sofort. Er braucht: Docker-Hosting mit HTTPS, eine dauerhafte Festplatte für `/data` und die Variable `FILIAL_KEY`.

**Immer genau eine Instanz** betreiben (Daten liegen auf der Festplatte der Instanz).

## Variante A: Render (am einfachsten)

1. Auf https://render.com mit GitHub anmelden und Zugriff auf das Repository `schicht-navigator` erlauben.
2. **New → Blueprint** → Repository `schicht-navigator` → Branch `main` → **Apply**.
   Render liest `render.yaml`: Docker-Dienst, Festplatte 1 GB unter `/data`, zufälliger `FILIAL_KEY`, Löschfrist 30 Tage.
3. Plan **Starter** wählen (nur bezahlte Pläne haben eine dauerhafte Festplatte).
4. Warten, bis der Dienst **Live** ist. Prüfen: `https://<dienst>.onrender.com/api/health` zeigt `{"ok":true,…}`.
5. Unter **Environment** den Wert von `FILIAL_KEY` ansehen (Augen-Symbol).
6. Adresse und Schlüssel an die Filialleitung geben – **nicht** in Chats oder E-Mails an viele Personen.

## Variante B: Railway

1. https://railway.com → **New Project → Deploy from GitHub repo** → `schicht-navigator`.
2. `railway.json` sorgt für Docker-Build und Health-Check.
3. Im Dienst: **Variables** → `FILIAL_KEY` (lang, zufällig), `DATA_DIR=/data`, `MEDIA_DAYS=30`.
4. **Add Volume** → Mount-Pfad `/data`.
5. **Settings → Networking → Generate Domain** → Adresse notieren.

## Variante C: Fly.io (Region Frankfurt)

```bash
fly launch --copy-config --no-deploy
fly volumes create daten --size 1 --region fra
fly secrets set FILIAL_KEY=<langer-zufälliger-schlüssel>
fly deploy
```
Adresse: `https://schicht-navigator.fly.dev` (oder der vergebene Name).

## Geräte verbinden

- **APK:** beim ersten Start Server-Adresse und Filial-Schlüssel eingeben.
- **Browser:** `https://<adresse>/` öffnen, gleiche Eingabe.
- Später ändern: in der App abmelden, Daten löschen oder neu installieren.

## Schlüssel erzeugen

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

## Betrieb

| Thema | Was tun |
|---|---|
| Backup | Ordner `/data` regelmäßig sichern (JSON-Dateien + `media/`) |
| Löschfrist | `MEDIA_DAYS` (Standard 30): ältere Fotos werden gelöscht, Vorgänge zeigen „Fotos entfernt“ |
| Schlüssel geändert | Alle Geräte geben ihn neu ein |
| Health-Check | `GET /api/health` (ohne Schlüssel) |

Vor dem Echtbetrieb: Betriebsrat (§ 87 Abs. 1 Nr. 6 BetrVG) und Datenschutz einbinden. Keine Rechtsberatung.
