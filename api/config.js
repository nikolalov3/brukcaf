// Podaje panelowi publiczny adres i klucz anon Supabase.
// Wartości siedzą w zmiennych środowiskowych Vercela, nie w repozytorium:
//   SUPABASE_URL       — Project URL z panelu Supabase
//   SUPABASE_ANON_KEY  — klucz "anon public" (publiczny, chroni go RLS)
//
// Klucz anon jest z założenia jawny (trafia do przeglądarki), więc to nie
// jest sekret. Trzymamy go w env tylko po to, żeby repo zostało czyste
// i żeby dało się go wymienić bez zmiany kodu.
export default function handler(req, res) {
  const url = process.env.SUPABASE_URL || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || '';

  res.setHeader('Cache-Control', 'no-store');

  if (!url || !anonKey) {
    return res.status(503).json({
      error: 'Brak konfiguracji Supabase. Ustaw SUPABASE_URL i SUPABASE_ANON_KEY w Vercelu.'
    });
  }
  return res.status(200).json({ url, anonKey });
}
