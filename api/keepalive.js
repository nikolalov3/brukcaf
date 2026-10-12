// Keep-alive Supabase: jeden malutki odczyt, odpalany przez Vercel Cron co ~5 dni.
// Darmowy projekt Supabase usypia po 7 dniach bez aktywności — ten ping utrzymuje
// go "żywym" z zapasem. To tylko GET z publicznym kluczem anon (chroni go RLS),
// więc nic wrażliwego tu nie przechodzi. Harmonogram jest w vercel.json ("crons").
export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || '';

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  if (!url || !anonKey) {
    return res.status(503).json({ ok: false, error: 'Brak SUPABASE_URL / SUPABASE_ANON_KEY' });
  }

  try {
    const r = await fetch(`${url}/rest/v1/coffees?select=id&limit=1`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    });
    return res.status(200).json({ ok: r.ok, status: r.status, at: new Date().toISOString() });
  } catch (e) {
    // Nie wywalamy 500 — cron ma tylko wygenerować ruch do bazy; błąd logujemy.
    return res.status(200).json({ ok: false, error: String(e), at: new Date().toISOString() });
  }
}
