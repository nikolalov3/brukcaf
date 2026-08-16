// Ręczne uruchomienie przebudowy strony ("Aktualizuj stronę" w panelu).
//
// Nie trzymamy adresu Deploy Hooka w przeglądarce — byłby publiczny i każdy
// mógłby spamić deployami. Panel woła ten endpoint z tokenem zalogowanego
// użytkownika Supabase; sprawdzamy token w Supabase i dopiero wtedy pingujemy
// Vercela.
//
// Zmienne środowiskowe (Vercel → Settings → Environment Variables):
//   DEPLOY_HOOK_URL    — adres z Vercel → Settings → Git → Deploy Hooks
//   SUPABASE_URL       — jak w /api/config
//   SUPABASE_ANON_KEY  — jak w /api/config
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Tylko POST.' });
  }

  const hook = process.env.DEPLOY_HOOK_URL || '';
  const url = process.env.SUPABASE_URL || '';
  const anon = process.env.SUPABASE_ANON_KEY || '';
  if (!hook || !url || !anon) {
    return res.status(503).json({ error: 'Brak konfiguracji. Ustaw DEPLOY_HOOK_URL (i klucze Supabase) w Vercelu.' });
  }

  // token zalogowanego użytkownika panelu
  const auth = req.headers.authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'Brak tokenu — zaloguj się w panelu.' });

  // weryfikacja tokenu w Supabase (musi zwrócić usera)
  try {
    const u = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anon, Authorization: `Bearer ${token}` },
    });
    if (!u.ok) return res.status(401).json({ error: 'Sesja wygasła — zaloguj się ponownie.' });
  } catch {
    return res.status(502).json({ error: 'Nie udało się zweryfikować sesji.' });
  }

  // odpal deploy
  try {
    const r = await fetch(hook, { method: 'POST' });
    if (!r.ok) return res.status(502).json({ error: 'Deploy Hook nie odpowiedział.' });
  } catch {
    return res.status(502).json({ error: 'Nie udało się połączyć z Deploy Hookiem.' });
  }

  return res.status(200).json({ ok: true });
}
