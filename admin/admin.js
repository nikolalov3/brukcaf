// Panel Bruk Cafe — logika. Supabase ładujemy z CDN, bo panel jest za
// loginem i nie podlega restrykcjom strony publicznej.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const $ = (id) => document.getElementById(id);

let sb = null;            // klient Supabase
let wpisy = [];          // wczytana lista
let edytowany = null;    // id wpisu w edytorze albo null przy nowym
let okladkaUrl = '';     // aktualna okładka w edytorze

// ── konfiguracja ────────────────────────────────────────────
async function polaczSupabase() {
  try {
    const r = await fetch('/api/config');
    if (!r.ok) throw new Error('config');
    const { url, anonKey } = await r.json();
    sb = createClient(url, anonKey);
    return true;
  } catch (e) {
    return false;
  }
}

// ── narzędzia ───────────────────────────────────────────────
function pokazInfo(el, tekst, typ) {
  el.textContent = tekst;
  el.className = 'info ' + (typ || '');
  el.hidden = !tekst;
}

function slugify(s) {
  const mapa = { ą:'a', ć:'c', ę:'e', ł:'l', ń:'n', ó:'o', ś:'s', ź:'z', ż:'z' };
  return (s || '').toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (z) => mapa[z] || z)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function dataPl(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('pl-PL', { day:'numeric', month:'long', year:'numeric' });
}

// ── logowanie ───────────────────────────────────────────────
$('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!sb) { pokazInfo($('login-blad'), 'Panel nie jest jeszcze połączony z Supabase.', 'zle'); return; }
  const btn = $('btn-login');
  btn.disabled = true; btn.textContent = 'Logowanie…';
  const { error } = await sb.auth.signInWithPassword({
    email: $('mail').value.trim(),
    password: $('haslo').value
  });
  btn.disabled = false; btn.textContent = 'Zaloguj';
  if (error) { pokazInfo($('login-blad'), 'Błędny e-mail lub hasło.', 'zle'); return; }
  pokazInfo($('login-blad'), '', '');
  await wejdz();
});

$('btn-wyloguj').addEventListener('click', async () => {
  await sb.auth.signOut();
  location.reload();
});

async function wejdz() {
  const { data } = await sb.auth.getUser();
  if (!data.user) return;
  $('ekran-login').hidden = true;
  $('aplikacja').hidden = false;
  $('kto').textContent = data.user.email;
  await wczytajListe();
}

// ── lista wpisów ────────────────────────────────────────────
async function wczytajListe() {
  pokazInfo($('lista-info'), '', '');
  const { data, error } = await sb.from('posts')
    .select('id, slug, status, title_pl, cover_url, published_at, updated_at')
    .order('updated_at', { ascending: false });
  if (error) { pokazInfo($('lista-info'), 'Nie udało się wczytać wpisów.', 'zle'); return; }
  wpisy = data || [];
  renderListe();
}

function renderListe() {
  const box = $('lista');
  if (!wpisy.length) {
    box.innerHTML = '<div class="pusto">Nie ma jeszcze żadnych wpisów. Kliknij „Nowy wpis”.</div>';
    return;
  }
  box.innerHTML = '';
  for (const w of wpisy) {
    const el = document.createElement('div');
    el.className = 'wpis';
    const opub = w.status === 'published';
    el.innerHTML = `
      <img class="mini" src="${w.cover_url || ''}" alt="" ${w.cover_url ? '' : 'style="visibility:hidden"'}>
      <div class="tresc">
        <div class="tyt"></div>
        <div class="meta">
          <span class="znak ${opub ? 'pub' : ''}">${opub ? 'Opublikowany' : 'Szkic'}</span>
          &nbsp; ${opub && w.published_at ? dataPl(w.published_at) : 'zmieniono ' + dataPl(w.updated_at)}
          &nbsp; · /blog/${w.slug}
        </div>
      </div>
      <div class="akcje">
        <button class="btn pusty mały" data-edytuj="${w.id}">Edytuj</button>
      </div>`;
    el.querySelector('.tyt').textContent = w.title_pl || '(bez tytułu)';
    el.querySelector('[data-edytuj]').addEventListener('click', () => otworzEdytor(w.id));
    box.appendChild(el);
  }
}

$('btn-nowy').addEventListener('click', () => otworzEdytor(null));

// ── edytor ──────────────────────────────────────────────────
function pokazWidok(ktory) {
  $('widok-lista').hidden = ktory !== 'lista';
  $('widok-edytor').hidden = ktory !== 'edytor';
  window.scrollTo(0, 0);
}

async function otworzEdytor(id) {
  edytowany = id;
  pokazInfo($('edytor-info'), '', '');
  ustawOkladke('');
  $('btn-usun').hidden = !id;

  if (!id) {
    $('edytor-tytul').textContent = 'Nowy wpis';
    $('pole-slug').value = '';
    $('pole-status').value = 'draft';
    ['pl-tytul','pl-lead','en-tytul','en-lead'].forEach((f) => $(f).value = '');
    $('pl-body').innerHTML = '';
    $('en-body').innerHTML = '';
  } else {
    const { data, error } = await sb.from('posts').select('*').eq('id', id).single();
    if (error || !data) { pokazInfo($('edytor-info'), 'Nie udało się wczytać wpisu.', 'zle'); return; }
    $('edytor-tytul').textContent = 'Edycja wpisu';
    $('pole-slug').value = data.slug || '';
    $('pole-status').value = data.status || 'draft';
    $('pl-tytul').value = data.title_pl || '';
    $('pl-lead').value = data.excerpt_pl || '';
    $('pl-body').innerHTML = data.body_pl || '';
    $('en-tytul').value = data.title_en || '';
    $('en-lead').value = data.excerpt_en || '';
    $('en-body').innerHTML = data.body_en || '';
    ustawOkladke(data.cover_url || '');
  }
  pokazWidok('edytor');
}

$('btn-wroc').addEventListener('click', () => pokazWidok('lista'));
$('btn-anuluj').addEventListener('click', () => pokazWidok('lista'));

// slug podpowiadany z tytułu, dopóki użytkownik go sam nie ruszy
let slugRuszony = false;
$('pole-slug').addEventListener('input', () => { slugRuszony = true; });
$('pl-tytul').addEventListener('input', () => {
  if (!slugRuszony && !edytowany) $('pole-slug').value = slugify($('pl-tytul').value);
});

// ── pasek formatowania (contenteditable) ────────────────────
document.querySelectorAll('.narz').forEach((pasek) => {
  const cel = $(pasek.dataset.cel);
  pasek.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      cel.focus();
      const c = b.dataset.cmd;
      if (c === 'bold') document.execCommand('bold');
      else if (c === 'italic') document.execCommand('italic');
      else if (c === 'h2') document.execCommand('formatBlock', false, 'h2');
      else if (c === 'h3') document.execCommand('formatBlock', false, 'h3');
      else if (c === 'ul') document.execCommand('insertUnorderedList');
      else if (c === 'clear') document.execCommand('formatBlock', false, 'p');
      else if (c === 'link') {
        const url = prompt('Adres linku (https://…):');
        if (url) document.execCommand('createLink', false, url);
      }
    });
  });
});

// ── okładka ─────────────────────────────────────────────────
function ustawOkladke(url) {
  okladkaUrl = url || '';
  const img = $('okladka-podglad');
  if (okladkaUrl) { img.src = okladkaUrl; img.hidden = false; $('btn-okladka-usun').hidden = false; }
  else { img.hidden = true; $('btn-okladka-usun').hidden = true; }
}
$('btn-okladka').addEventListener('click', () => $('pole-okladka').click());
$('btn-okladka-usun').addEventListener('click', () => ustawOkladke(''));
$('pole-okladka').addEventListener('change', async (e) => {
  const plik = e.target.files[0];
  if (!plik) return;
  pokazInfo($('edytor-info'), 'Wgrywam zdjęcie…', '');
  const nazwa = Date.now() + '-' + slugify(plik.name.replace(/\.[^.]+$/, '')) + '.' +
                (plik.name.split('.').pop() || 'jpg');
  const { error } = await sb.storage.from('blog').upload(nazwa, plik, { upsert: false });
  if (error) { pokazInfo($('edytor-info'), 'Nie udało się wgrać zdjęcia.', 'zle'); return; }
  const { data } = sb.storage.from('blog').getPublicUrl(nazwa);
  ustawOkladke(data.publicUrl);
  pokazInfo($('edytor-info'), '', '');
});

// ── zapis ───────────────────────────────────────────────────
$('btn-zapisz').addEventListener('click', async () => {
  const tytulPl = $('pl-tytul').value.trim();
  const bodyPl = $('pl-body').innerHTML.trim();
  let slug = $('pole-slug').value.trim() || slugify(tytulPl);

  if (!tytulPl) { pokazInfo($('edytor-info'), 'Tytuł po polsku jest wymagany.', 'zle'); return; }
  if (!bodyPl)  { pokazInfo($('edytor-info'), 'Treść po polsku jest wymagana.', 'zle'); return; }
  if (!slug)    { pokazInfo($('edytor-info'), 'Adres wpisu (slug) jest wymagany.', 'zle'); return; }

  const status = $('pole-status').value;
  const teraz = new Date().toISOString();

  const rekord = {
    slug, status,
    title_pl: tytulPl,
    excerpt_pl: $('pl-lead').value.trim() || null,
    body_pl: bodyPl,
    title_en: $('en-tytul').value.trim() || null,
    excerpt_en: $('en-lead').value.trim() || null,
    body_en: $('en-body').innerHTML.trim() || null,
    cover_url: okladkaUrl || null
  };

  const btn = $('btn-zapisz');
  btn.disabled = true; btn.textContent = 'Zapisywanie…';

  let odp;
  if (edytowany) {
    // datę publikacji ustawiamy tylko przy pierwszym opublikowaniu
    const stary = wpisy.find((w) => w.id === edytowany);
    if (status === 'published' && (!stary || !stary.published_at)) rekord.published_at = teraz;
    odp = await sb.from('posts').update(rekord).eq('id', edytowany);
  } else {
    if (status === 'published') rekord.published_at = teraz;
    odp = await sb.from('posts').insert(rekord);
  }

  btn.disabled = false; btn.textContent = 'Zapisz';

  if (odp.error) {
    const dubel = (odp.error.message || '').includes('duplicate');
    pokazInfo($('edytor-info'), dubel
      ? 'Wpis o takim adresie (slug) już istnieje. Zmień slug.'
      : 'Nie udało się zapisać wpisu.', 'zle');
    return;
  }
  await wczytajListe();
  pokazWidok('lista');
  pokazInfo($('lista-info'), status === 'published'
    ? 'Wpis zapisany i opublikowany. Pojawi się na stronie za chwilę.'
    : 'Szkic zapisany.', 'ok');
});

// ── usuwanie ────────────────────────────────────────────────
$('btn-usun').addEventListener('click', async () => {
  if (!edytowany) return;
  if (!confirm('Na pewno usunąć ten wpis? Tej operacji nie da się cofnąć.')) return;
  const { error } = await sb.from('posts').delete().eq('id', edytowany);
  if (error) { pokazInfo($('edytor-info'), 'Nie udało się usunąć wpisu.', 'zle'); return; }
  await wczytajListe();
  pokazWidok('lista');
  pokazInfo($('lista-info'), 'Wpis usunięty.', 'ok');
});

// ── start ───────────────────────────────────────────────────
(async function start() {
  const ok = await polaczSupabase();
  if (!ok) {
    pokazInfo($('login-blad'),
      'Panel nie jest połączony z Supabase. Uzupełnij SUPABASE_URL i SUPABASE_ANON_KEY w Vercelu.', 'zle');
    return;
  }
  const { data } = await sb.auth.getSession();
  if (data.session) await wejdz();
})();
