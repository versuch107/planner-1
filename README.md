# planner
Planner for clubs like KLJB and Minis -> Goal: Create the timeplan faster and clearer

Reine Webseite (HTML/CSS/JavaScript im Ordner `public/`), gehostet auf **GitHub Pages**.
Login und Daten liegen in **Supabase** – ein eigener Server ist nicht nötig.

## Aufbau

| Pfad | Inhalt |
| --- | --- |
| `public/` | Die Webseite – genau dieser Ordner wird veröffentlicht |
| `public/config.js` | Supabase-URL und öffentlicher Schlüssel |
| `public/backend.js` | Alle Datenbank-Zugriffe (Supabase) |
| `public/lib/` | Plan-Logik (Bardienst-Generator, Miniplan) |
| `supabase/schema.sql` | Tabellen und Zugriffsregeln für Supabase |
| `.github/workflows/pages.yml` | Veröffentlicht `public/` automatisch bei jedem Push |

## 1. Supabase einrichten (einmalig)

1. Auf https://supabase.com ein kostenloses Projekt anlegen (Region z. B. Frankfurt).
2. **SQL Editor** öffnen, den Inhalt von [`supabase/schema.sql`](supabase/schema.sql) einfügen, **Run**.
3. **Project Settings → API**: die **Project URL** und den **anon / publishable** Key kopieren
   und in [`public/config.js`](public/config.js) eintragen.
   Den `service_role`/`secret` Key **niemals** dort eintragen.
4. **Authentication → URL Configuration**:
   - **Site URL**: `https://<github-name>.github.io/<repository>/`
   - **Redirect URLs**: dieselbe Adresse und `http://localhost:3000/` hinzufügen
   (dorthin führt der Link in der Bestätigungs-E-Mail).

Der anon-Key steht öffentlich in der Webseite – das ist so gedacht. Die Tabellen sind mit
Row Level Security geschützt: Jede Person sieht und ändert nur ihre eigenen Daten.

## 2. Lokal testen

Voraussetzung: Node.js 18 oder neuer.

```bash
npm start
```

Dann http://localhost:3000 öffnen. Lokal wird dieselbe Supabase-Datenbank benutzt wie online.

## 3. Veröffentlichen auf GitHub Pages

1. Das Repository muss **öffentlich** sein (GitHub Pages für private Repositories gibt es nur mit bezahltem Plan):
   **Settings → General → Danger Zone → Change visibility**.
2. **Settings → Pages → Build and deployment → Source: „GitHub Actions“**.
3. Änderungen auf `main` pushen. Unter **Actions** läuft „Deploy to GitHub Pages“; danach ist die Seite unter
   `https://<github-name>.github.io/<repository>/` erreichbar.

Jeder weitere Push auf `main` aktualisiert die Seite automatisch.

## Alte lokale Daten übernehmen (optional)

Konten aus der früheren Version (`data/db.json`) gibt es in Supabase nicht – bitte neu registrieren. Danach:

```bash
node scripts/export-sql.js deine@email.de > import.sql
```

Den Inhalt von `import.sql` im Supabase **SQL Editor** ausführen. Namen, Abwesenheiten, Bardienstpläne und Miniplan
werden dann deinem neuen Konto zugeordnet.
