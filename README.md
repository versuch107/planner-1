# planner
Planner for clubs like KLJB and Minis -> Goal: Create the timeplan faster and clearer

## Lokal starten

Voraussetzung: Node.js 20.6 oder neuer.

```bash
npm install
npm start        # Daten in data/db.json
npm run dev      # Daten in Supabase (liest .env)
```

Dann im Browser http://localhost:3000 öffnen.

## Datenbank: Supabase einrichten

1. Auf https://supabase.com ein kostenloses Projekt anlegen (Region z. B. Frankfurt).
2. Im Dashboard **SQL Editor** öffnen, den Inhalt von [`supabase/schema.sql`](supabase/schema.sql) einfügen und **Run** klicken.
3. Unter **Project Settings → API** die **Project URL** und den **service_role**-Schlüssel kopieren.
4. `.env.example` nach `.env` kopieren und beide Werte eintragen.
5. Bestehende lokale Daten übertragen (optional, einmalig):
   ```bash
   npm run import
   ```

Der `service_role`-Schlüssel hat vollen Zugriff auf die Datenbank. Er gehört nur auf den Server bzw. in die Einstellungen des Hosters, nie ins Git-Repository (`.env` ist in `.gitignore`).

## Veröffentlichen (Render.com)

1. Projekt auf GitHub hochladen (ohne `.env` und `data/`).
2. Auf https://render.com **New → Blueprint** wählen und das Repository verbinden – `render.yaml` wird erkannt.
3. Bei den Umgebungsvariablen `SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` eintragen.
4. Nach dem Deploy ist die Seite unter `https://<name>.onrender.com` erreichbar (HTTPS inklusive).

Hinweise:
- Es darf nur **eine** Server-Instanz laufen (die Daten werden beim Start geladen und im Speicher gehalten).
- Im kostenlosen Render-Plan schläft der Server nach 15 Minuten ohne Besuch ein; der erste Aufruf danach dauert ca. 30–60 Sekunden.
- Andere Hoster (Railway, Fly.io, eigener Server) funktionieren genauso: `npm ci`, `npm start`, die zwei Umgebungsvariablen setzen.
