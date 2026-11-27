// Verbindung zu Supabase. Beide Werte findest du im Supabase-Dashboard unter
// Project Settings → API (bzw. "API Keys").
//
// Der "anon"/"publishable" Schlüssel ist für die Webseite gedacht und darf öffentlich sein –
// die Daten sind durch Row Level Security geschützt (siehe supabase/schema.sql).
// NIEMALS den "service_role"/"secret" Schlüssel hier eintragen!

window.PLANNER_CONFIG = {
  supabaseUrl: "https://epzjgynsjfzganceyrev.supabase.co",  // z. B. "https://abcdefgh.supabase.co"
  supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwempneW5zamZ6Z2FuY2V5cmV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU4MDc4MDAsImV4cCI6MjExMTM4MzgwMH0.7n2eyizxbzP6JMJd7ITfVgPtyGZ9EwvHhVelhFiiipk",  // anon / publishable key
};
