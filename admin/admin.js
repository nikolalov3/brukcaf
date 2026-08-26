// Panel Bruk Cafe — logika. Supabase ładujemy z CDN, bo panel jest za
// loginem i nie podlega restrykcjom strony publicznej.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const $ = (id) => document.getElementById(id);

// Ile pozycji pokazuje strona (reszta czeka w panelu, wyszarzona).
// MUSI być zgodne z build.mjs (LIMIT_KAWY / LIMIT_CIASTA).
const LIMIT_KAWY = 6;
const LIMIT_CIASTA = 6;

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
  if (error) {
    const m = /confirm/i.test(error.message)
      ? 'Konto istnieje, ale e-mail nie jest potwierdzony. Potwierdź użytkownika w Supabase (Auto Confirm User).'
      : /provider|disabled/i.test(error.message)
        ? 'Logowanie e-mailem jest wyłączone w Supabase (Authentication → Providers → Email).'
        : 'Błędny e-mail lub hasło.';
    pokazInfo($('login-blad'), m, 'zle');
    return;
  }
  pokazInfo($('login-blad'), '', '');
  await wejdz();
});

$('btn-wyloguj').addEventListener('click', async () => {
  await sb.auth.signOut();
  location.reload();
});

// ── „Aktualizuj stronę” — ręczne odpalenie przebudowy ──────────
document.querySelectorAll('[data-rebuild]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const info = btn.closest('main').querySelector('.info');
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { pokazInfo(info, 'Zaloguj się ponownie.', 'zle'); return; }
    const ety = btn.textContent; btn.disabled = true; btn.textContent = 'Aktualizuję…';
    try {
      const r = await fetch('/api/rebuild', {
        method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const j = await r.json().catch(() => ({}));
      pokazInfo(info, r.ok ? 'Strona się przebudowuje — zmiany będą za około minutę.'
                          : (j.error || 'Nie udało się uruchomić aktualizacji.'), r.ok ? 'ok' : 'zle');
    } catch {
      pokazInfo(info, 'Błąd połączenia.', 'zle');
    }
    btn.disabled = false; btn.textContent = ety;
  });
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
// uploader okładki bloga podpinany niżej przez podepnijFoto()

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

// ══════════════════════════════════════════════════════════════
//  ZAKŁADKI
// ══════════════════════════════════════════════════════════════
let kawyZaladowane = false, stanZaladowany = false, menuZaladowane = false;

function pokazZakladke(nazwa) {
  document.querySelectorAll('.zakl').forEach((b) =>
    b.classList.toggle('aktywna', b.dataset.tab === nazwa));
  ['grupa-wpisy', 'grupa-kawy', 'grupa-stan', 'grupa-menu'].forEach((kl) =>
    document.querySelectorAll('.' + kl).forEach((el) => (el.hidden = true)));

  if (nazwa === 'wpisy') $('widok-lista').hidden = false;
  if (nazwa === 'kawy')  { $('widok-kawy').hidden = false; if (!kawyZaladowane) wczytajKawy(); }
  if (nazwa === 'stan')  { $('widok-stan').hidden = false; if (!stanZaladowany) wczytajStan(); }
  if (nazwa === 'menu')  { $('widok-menu').hidden = false; if (!menuZaladowane) wczytajMenu(); }
  window.scrollTo(0, 0);
}
document.querySelectorAll('.zakl').forEach((b) =>
  b.addEventListener('click', () => pokazZakladke(b.dataset.tab)));

// wspólne wgrywanie zdjęcia do magazynu 'blog'
async function wgrajZdjecie(plik) {
  const surowa = (plik.name || 'zdjecie').replace(/\.[^.]+$/, '');
  const rozsz = (plik.name && plik.name.includes('.')) ? plik.name.split('.').pop()
              : (plik.type && plik.type.split('/')[1]) || 'png';
  const nazwa = Date.now() + '-' + (slugify(surowa) || 'zdjecie') + '.' + rozsz;
  const { error } = await sb.storage.from('blog').upload(nazwa, plik, { upsert: false, contentType: plik.type || undefined });
  if (error) return null;
  return sb.storage.from('blog').getPublicUrl(nazwa).data.publicUrl;
}

// wczytuje plik do obiektu Image
function wczytajObraz(plik) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = URL.createObjectURL(plik);
  });
}

// Normalizacja zdjęcia kawy: przycina przezroczyste marginesy wokół opakowania
// i wcentrowuje je na jednym płótnie 4:3 (1000x750). Efekt: wszystkie kawy tej
// samej wielkości i na środku. Działa, bo opakowania wpadają jako PNG bez tła.
async function normalizujKawe(plik) {
  const img = await wczytajObraz(plik);
  const src = document.createElement('canvas');
  src.width = img.naturalWidth; src.height = img.naturalHeight;
  const sc = src.getContext('2d');
  sc.drawImage(img, 0, 0);
  const dane = sc.getImageData(0, 0, src.width, src.height).data;

  // bounding box nieprzezroczystych pikseli
  let minX = src.width, minY = src.height, maxX = -1, maxY = -1;
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      if (dane[(y * src.width + x) * 4 + 3] > 12) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  // brak przezroczystości (zwykłe zdjęcie) — bierzemy całość
  if (maxX < minX || maxY < minY) { minX = 0; minY = 0; maxX = src.width - 1; maxY = src.height - 1; }
  const bw = maxX - minX + 1, bh = maxY - minY + 1;

  const TW = 1000, TH = 750, WYPELNIENIE = 0.86;
  const out = document.createElement('canvas'); out.width = TW; out.height = TH;
  const oc = out.getContext('2d');
  const skala = Math.min((TW * WYPELNIENIE) / bw, (TH * WYPELNIENIE) / bh);
  const dw = bw * skala, dh = bh * skala;
  oc.drawImage(src, minX, minY, bw, bh, (TW - dw) / 2, (TH - dh) / 2, dw, dh);

  const blob = await new Promise((r) => out.toBlob(r, 'image/png'));
  return new File([blob], (plik.name || 'kawa').replace(/\.[^.]+$/, '') + '.png', { type: 'image/png' });
}

// ── wspólny uploader zdjęć: klik, przeciągnięcie pliku, wklejenie zrzutu ──
const fotoUploadery = {};  // przechowuje { wgraj, widokId } do routingu wklejania
function podepnijFoto({ strefaId, inputId, btnId, usunId, infoId, widokId, ustaw, przetworz }) {
  const strefa = $(strefaId), input = $(inputId), info = $(infoId);
  const wgraj = async (plik) => {
    if (!plik) return;
    if (!(plik.type || '').startsWith('image/')) { pokazInfo(info, 'To nie jest obrazek.', 'zle'); return; }
    pokazInfo(info, 'Przetwarzam zdjęcie…', '');
    let doWyslania = plik;
    if (przetworz) { try { doWyslania = await przetworz(plik); } catch { doWyslania = plik; } }
    const url = await wgrajZdjecie(doWyslania);
    if (!url) { pokazInfo(info, 'Nie udało się wgrać zdjęcia.', 'zle'); return; }
    ustaw(url); pokazInfo(info, '', '');
  };
  $(btnId).addEventListener('click', () => input.click());
  $(usunId).addEventListener('click', () => ustaw(''));
  input.addEventListener('change', (e) => wgraj(e.target.files[0]));
  ['dragenter', 'dragover'].forEach((ev) =>
    strefa.addEventListener(ev, (e) => { e.preventDefault(); strefa.classList.add('nad'); }));
  ['dragleave', 'dragend'].forEach((ev) =>
    strefa.addEventListener(ev, () => strefa.classList.remove('nad')));
  strefa.addEventListener('drop', (e) => {
    e.preventDefault(); strefa.classList.remove('nad');
    wgraj([...(e.dataTransfer?.files || [])].find((f) => f.type.startsWith('image/')));
  });
  fotoUploadery[strefaId] = { wgraj, widokId };
}

// wklejenie zrzutu ekranu (Cmd/Ctrl+V) trafia do otwartego edytora zdjęć
document.addEventListener('paste', (e) => {
  const a = document.activeElement;
  if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return;
  const it = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
  if (!it) return;
  const otwarty = Object.values(fotoUploadery).find((u) => !$(u.widokId).hidden);
  if (otwarty) { e.preventDefault(); otwarty.wgraj(it.getAsFile()); }
});

// ══════════════════════════════════════════════════════════════
//  KAWY — „Dziś w młynku"
// ══════════════════════════════════════════════════════════════
let kawy = [], edytowanaKawa = null, kawaFoto = '', kawaFoto2 = '';

async function wczytajKawy() {
  const { data, error } = await sb.from('coffees')
    .select('*').order('sort', { ascending: true }).order('created_at', { ascending: false });
  if (error) { pokazInfo($('kawy-info'), 'Nie udało się wczytać kaw.', 'zle'); return; }
  kawy = data || []; kawyZaladowane = true; renderKawy();
}

function renderKawy() {
  const box = $('kawy-lista');
  if (!kawy.length) { box.innerHTML = '<div class="pusto">Brak kaw. Kliknij „Dodaj kawę”.</div>'; return; }
  box.innerHTML = '';
  kawy.forEach((k, i) => {
    const poza = i >= LIMIT_KAWY;
    const el = document.createElement('div');
    el.className = 'wpis' + (k.available ? '' : ' niedostepna') + (poza ? ' poza-strona' : '');
    el.innerHTML = `
      <div class="kolejnosc">
        <button class="strzal" data-gora title="W górę" ${i === 0 ? 'disabled' : ''} aria-label="W górę">↑</button>
        <button class="strzal" data-dol title="W dół" ${i === kawy.length - 1 ? 'disabled' : ''} aria-label="W dół">↓</button>
      </div>
      <img class="mini" src="${k.photo_url || ''}" alt="" ${k.photo_url ? '' : 'style="visibility:hidden"'}>
      <div class="tresc">
        <div class="tyt"></div>
        <div class="meta">
          <span class="znak ${k.available ? 'pub' : ''}">${k.available ? 'Dostępna' : 'Niedostępna'}</span>
          ${poza ? '<span class="poza-znak">poza stroną</span>' : ''}
          <span class="detale"></span>
        </div>
      </div>
      <div class="akcje">
        <button class="btn pusty mały" data-dost>${k.available ? 'Zdejmij' : 'Wystaw'}</button>
        <button class="btn pusty mały" data-edit>Edytuj</button>
      </div>`;
    el.querySelector('.tyt').textContent = k.name;
    el.querySelector('.detale').textContent = [k.method, k.obrobka, k.origin].filter(Boolean).join(' · ');
    el.querySelector('[data-edit]').addEventListener('click', () => otworzKawe(k.id));
    el.querySelector('[data-gora]').addEventListener('click', () => przesunKawe(i, -1));
    el.querySelector('[data-dol]').addEventListener('click', () => przesunKawe(i, 1));
    el.querySelector('[data-dost]').addEventListener('click', async () => {
      await sb.from('coffees').update({ available: !k.available }).eq('id', k.id);
      await wczytajKawy();
    });
    box.appendChild(el);
  });
}

// zamiana miejscami z sąsiadem i zapis nowej kolejności (sort = pozycja na liście)
async function przesunKawe(i, kierunek) {
  const j = i + kierunek;
  if (j < 0 || j >= kawy.length) return;
  [kawy[i], kawy[j]] = [kawy[j], kawy[i]];
  renderKawy(); // natychmiastowy ruch w UI
  await Promise.all(kawy.map((k, idx) => sb.from('coffees').update({ sort: idx }).eq('id', k.id)));
  await wczytajKawy();
}

$('btn-nowa-kawa').addEventListener('click', () => otworzKawe(null));
$('btn-kawa-wroc').addEventListener('click', () => { $('widok-kawy-edytor').hidden = true; $('widok-kawy').hidden = false; });
$('btn-kawa-anuluj').addEventListener('click', () => { $('widok-kawy-edytor').hidden = true; $('widok-kawy').hidden = false; });

function ustawKawaFoto(url) {
  kawaFoto = url || '';
  const img = $('kawa-foto-podglad');
  if (kawaFoto) { img.src = kawaFoto; img.hidden = false; $('btn-kawa-foto-usun').hidden = false; }
  else { img.hidden = true; $('btn-kawa-foto-usun').hidden = true; }
}
function ustawKawaFoto2(url) {
  kawaFoto2 = url || '';
  const img = $('kawa-foto2-podglad');
  if (kawaFoto2) { img.src = kawaFoto2; img.hidden = false; $('btn-kawa-foto2-usun').hidden = false; }
  else { img.hidden = true; $('btn-kawa-foto2-usun').hidden = true; }
}
// uploadery zdjęć kawy podpinane niżej przez podepnijFoto()

async function otworzKawe(id) {
  edytowanaKawa = id;
  pokazInfo($('kawa-info'), '', '');
  $('btn-kawa-usun').hidden = !id;
  if (!id) {
    $('kawa-tytul').textContent = 'Nowa kawa';
    ['kawa-nazwa','kawa-metoda','kawa-pochodzenie','kawa-obrobka','kawa-opis','kawa-link'].forEach((f) => $(f).value = '');
    $('kawa-dostepna').checked = true; ustawKawaFoto(''); ustawKawaFoto2('');
  } else {
    const { data, error } = await sb.from('coffees').select('*').eq('id', id).single();
    if (error || !data) { pokazInfo($('kawa-info'), 'Nie udało się wczytać kawy.', 'zle'); return; }
    $('kawa-tytul').textContent = 'Edycja kawy';
    $('kawa-nazwa').value = data.name || '';
    $('kawa-metoda').value = data.method || '';
    $('kawa-pochodzenie').value = data.origin || '';
    $('kawa-obrobka').value = data.obrobka || '';
    $('kawa-opis').value = data.note || '';
    $('kawa-link').value = data.link_url || '';
    $('kawa-dostepna').checked = !!data.available;
    ustawKawaFoto(data.photo_url || ''); ustawKawaFoto2(data.photo_url2 || '');
  }
  $('widok-kawy').hidden = true; $('widok-kawy-edytor').hidden = false; window.scrollTo(0, 0);
}

$('btn-kawa-zapisz').addEventListener('click', async () => {
  const nazwa = $('kawa-nazwa').value.trim();
  if (!nazwa) { pokazInfo($('kawa-info'), 'Nazwa jest wymagana.', 'zle'); return; }
  const rekord = {
    name: nazwa,
    method: $('kawa-metoda').value.trim() || null,
    origin: $('kawa-pochodzenie').value.trim() || null,
    obrobka: $('kawa-obrobka').value.trim() || null,
    note: $('kawa-opis').value.trim() || null,
    link_url: $('kawa-link').value.trim() || null,
    available: $('kawa-dostepna').checked,
    photo_url: kawaFoto || null,
    photo_url2: kawaFoto2 || null
  };
  if (!edytowanaKawa) rekord.sort = kawy.length ? Math.max(...kawy.map((k) => k.sort ?? 0)) + 1 : 0;
  const btn = $('btn-kawa-zapisz'); btn.disabled = true; btn.textContent = 'Zapisywanie…';
  const odp = edytowanaKawa
    ? await sb.from('coffees').update(rekord).eq('id', edytowanaKawa)
    : await sb.from('coffees').insert(rekord);
  btn.disabled = false; btn.textContent = 'Zapisz';
  if (odp.error) { pokazInfo($('kawa-info'), 'Nie udało się zapisać.', 'zle'); return; }
  await wczytajKawy();
  $('widok-kawy-edytor').hidden = true; $('widok-kawy').hidden = false;
  pokazInfo($('kawy-info'), 'Zapisano. Aby pokazać zmiany na stronie, kliknij „Aktualizuj stronę”.', 'ok');
});

$('btn-kawa-usun').addEventListener('click', async () => {
  if (!edytowanaKawa) return;
  if (!confirm('Usunąć tę kawę?')) return;
  const { error } = await sb.from('coffees').delete().eq('id', edytowanaKawa);
  if (error) { pokazInfo($('kawa-info'), 'Nie udało się usunąć.', 'zle'); return; }
  await wczytajKawy();
  $('widok-kawy-edytor').hidden = true; $('widok-kawy').hidden = false;
  pokazInfo($('kawy-info'), 'Usunięto.', 'ok');
});

// ══════════════════════════════════════════════════════════════
//  STAN — live (ciasta)
// ══════════════════════════════════════════════════════════════
let stany = [], edytowanyStan = null;
const stanFotki = ['', '', '', ''];  // 1 główne + 3 do story
const NAZWY_STATUS = { available: 'Dostępne', low: 'Zostało niewiele', sold_out: 'Wyprzedane' };
const NAST_STATUS = { available: 'low', low: 'sold_out', sold_out: 'available' };

async function wczytajStan() {
  const { data, error } = await sb.from('stock_items')
    .select('*').order('sort', { ascending: true }).order('created_at', { ascending: false });
  if (error) { pokazInfo($('stan-info'), 'Nie udało się wczytać stanów.', 'zle'); return; }
  stany = data || []; stanZaladowany = true; renderStan();
}

function renderStan() {
  const box = $('stan-lista');
  if (!stany.length) { box.innerHTML = '<div class="pusto">Brak pozycji. Kliknij „Dodaj pozycję”.</div>'; return; }
  box.innerHTML = '';
  stany.forEach((s, i) => {
    const poza = i >= LIMIT_CIASTA;
    const el = document.createElement('div');
    el.className = 'wpis' + (poza ? ' poza-strona' : '');
    el.innerHTML = `
      <div class="kolejnosc">
        <button class="strzal" data-gora title="W górę" ${i === 0 ? 'disabled' : ''} aria-label="W górę">↑</button>
        <button class="strzal" data-dol title="W dół" ${i === stany.length - 1 ? 'disabled' : ''} aria-label="W dół">↓</button>
      </div>
      <img class="mini" src="${s.photo_url || ''}" alt="" ${s.photo_url ? '' : 'style="visibility:hidden"'}>
      <div class="tresc">
        <div class="tyt"></div>
        <div class="meta"><span class="note"></span>${poza ? ' <span class="poza-znak">poza stroną</span>' : ''}</div>
      </div>
      <div class="akcje">
        <button class="status ${s.status}" data-status title="Kliknij, aby zmienić">${NAZWY_STATUS[s.status]}</button>
        <button class="btn pusty mały" data-edit>Edytuj</button>
      </div>`;
    el.querySelector('.tyt').textContent = s.name;
    el.querySelector('.note').textContent = s.note || '';
    el.querySelector('[data-edit]').addEventListener('click', () => otworzStan(s.id));
    el.querySelector('[data-gora]').addEventListener('click', () => przesunStan(i, -1));
    el.querySelector('[data-dol]').addEventListener('click', () => przesunStan(i, 1));
    el.querySelector('[data-status]').addEventListener('click', async () => {
      await sb.from('stock_items').update({ status: NAST_STATUS[s.status] }).eq('id', s.id);
      await wczytajStan();
    });
    box.appendChild(el);
  });
}

async function przesunStan(i, kierunek) {
  const j = i + kierunek;
  if (j < 0 || j >= stany.length) return;
  [stany[i], stany[j]] = [stany[j], stany[i]];
  renderStan();
  await Promise.all(stany.map((s, idx) => sb.from('stock_items').update({ sort: idx }).eq('id', s.id)));
  await wczytajStan();
}

$('btn-nowy-stan').addEventListener('click', () => otworzStan(null));
$('btn-stan-wroc').addEventListener('click', () => { $('widok-stan-edytor').hidden = true; $('widok-stan').hidden = false; });
$('btn-stan-anuluj').addEventListener('click', () => { $('widok-stan-edytor').hidden = true; $('widok-stan').hidden = false; });

function ustawStanFotoN(nr, url) {  // nr: 1..4
  stanFotki[nr - 1] = url || '';
  const suf = nr === 1 ? '' : nr;
  const img = $('stan-foto' + suf + '-podglad');
  if (url) { img.src = url; img.hidden = false; $('btn-stan-foto' + suf + '-usun').hidden = false; }
  else { img.hidden = true; $('btn-stan-foto' + suf + '-usun').hidden = true; }
}
// uploadery zdjęć ciasta podpinane niżej przez podepnijFoto()

// ── podpięcie uploaderów (po zdefiniowaniu funkcji ustaw…) ──
podepnijFoto({ strefaId: 'okladka-strefa', inputId: 'pole-okladka', btnId: 'btn-okladka',
  usunId: 'btn-okladka-usun', infoId: 'edytor-info', widokId: 'widok-edytor', ustaw: ustawOkladke });
podepnijFoto({ strefaId: 'kawa-strefa', inputId: 'kawa-foto', btnId: 'btn-kawa-foto',
  usunId: 'btn-kawa-foto-usun', infoId: 'kawa-info', widokId: 'widok-kawy-edytor',
  ustaw: ustawKawaFoto, przetworz: normalizujKawe });
podepnijFoto({ strefaId: 'kawa-strefa2', inputId: 'kawa-foto2', btnId: 'btn-kawa-foto2',
  usunId: 'btn-kawa-foto2-usun', infoId: 'kawa-info', widokId: 'widok-kawy-edytor',
  ustaw: ustawKawaFoto2, przetworz: normalizujKawe });
[1, 2, 3, 4].forEach((nr) => {
  const suf = nr === 1 ? '' : nr;
  podepnijFoto({
    strefaId: 'stan-strefa' + suf, inputId: 'stan-foto' + suf, btnId: 'btn-stan-foto' + suf,
    usunId: 'btn-stan-foto' + suf + '-usun', infoId: 'stan-poz-info', widokId: 'widok-stan-edytor',
    ustaw: (u) => ustawStanFotoN(nr, u),
  });
});

async function otworzStan(id) {
  edytowanyStan = id;
  pokazInfo($('stan-poz-info'), '', '');
  $('btn-stan-usun').hidden = !id;
  if (!id) {
    $('stan-tytul').textContent = 'Nowa pozycja';
    $('stan-nazwa').value = ''; $('stan-note').value = ''; $('stan-status').value = 'available';
    [1, 2, 3, 4].forEach((n) => ustawStanFotoN(n, ''));
  } else {
    const { data, error } = await sb.from('stock_items').select('*').eq('id', id).single();
    if (error || !data) { pokazInfo($('stan-poz-info'), 'Nie udało się wczytać pozycji.', 'zle'); return; }
    $('stan-tytul').textContent = 'Edycja pozycji';
    $('stan-nazwa').value = data.name || '';
    $('stan-note').value = data.note || '';
    $('stan-status').value = data.status || 'available';
    ustawStanFotoN(1, data.photo_url || '');
    ustawStanFotoN(2, data.photo_url2 || '');
    ustawStanFotoN(3, data.photo_url3 || '');
    ustawStanFotoN(4, data.photo_url4 || '');
  }
  $('widok-stan').hidden = true; $('widok-stan-edytor').hidden = false; window.scrollTo(0, 0);
}

$('btn-stan-zapisz').addEventListener('click', async () => {
  const nazwa = $('stan-nazwa').value.trim();
  if (!nazwa) { pokazInfo($('stan-poz-info'), 'Nazwa jest wymagana.', 'zle'); return; }
  const rekord = {
    name: nazwa,
    status: $('stan-status').value,
    note: $('stan-note').value.trim() || null,
    photo_url: stanFotki[0] || null,
    photo_url2: stanFotki[1] || null,
    photo_url3: stanFotki[2] || null,
    photo_url4: stanFotki[3] || null,
  };
  if (!edytowanyStan) rekord.sort = stany.length ? Math.max(...stany.map((s) => s.sort ?? 0)) + 1 : 0;
  const btn = $('btn-stan-zapisz'); btn.disabled = true; btn.textContent = 'Zapisywanie…';
  const odp = edytowanyStan
    ? await sb.from('stock_items').update(rekord).eq('id', edytowanyStan)
    : await sb.from('stock_items').insert(rekord);
  btn.disabled = false; btn.textContent = 'Zapisz';
  if (odp.error) { pokazInfo($('stan-poz-info'), 'Nie udało się zapisać.', 'zle'); return; }
  await wczytajStan();
  $('widok-stan-edytor').hidden = true; $('widok-stan').hidden = false;
  pokazInfo($('stan-info'), 'Zapisano. Aby pokazać zmiany na stronie, kliknij „Aktualizuj stronę”.', 'ok');
});

$('btn-stan-usun').addEventListener('click', async () => {
  if (!edytowanyStan) return;
  if (!confirm('Usunąć tę pozycję?')) return;
  const { error } = await sb.from('stock_items').delete().eq('id', edytowanyStan);
  if (error) { pokazInfo($('stan-poz-info'), 'Nie udało się usunąć.', 'zle'); return; }
  await wczytajStan();
  $('widok-stan-edytor').hidden = true; $('widok-stan').hidden = false;
  pokazInfo($('stan-info'), 'Usunięto.', 'ok');
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

// ══════════════════════════════════════════════════════════════
//  MENU (karta lokalu)
// ══════════════════════════════════════════════════════════════
let menu = [], edytowanaPoz = null;

async function wczytajMenu() {
  const { data, error } = await sb.from('menu_items')
    .select('*')
    .order('sekcja_sort', { ascending: true })
    .order('sort', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) {
    pokazInfo($('menu-info'), 'Nie udało się wczytać menu. Czy tabela menu_items istnieje?', 'zle');
    return;
  }
  menu = data || []; menuZaladowane = true; renderMenu();
}

function grupyMenu() {
  const sekcje = [], mapa = new Map();
  for (const it of menu) {
    if (!mapa.has(it.sekcja)) { mapa.set(it.sekcja, []); sekcje.push(it.sekcja); }
    mapa.get(it.sekcja).push(it);
  }
  return { sekcje, mapa };
}

function wypelnijSekcje() {
  const sekcje = [...new Set(menu.map((m) => m.sekcja))];
  $('lista-sekcji').innerHTML = sekcje
    .map((s) => `<option value="${String(s).replace(/"/g, '&quot;')}"></option>`).join('');
}

function renderMenu() {
  const box = $('menu-lista');
  if (!menu.length) { box.innerHTML = '<div class="pusto">Brak pozycji. Kliknij „Dodaj pozycję”.</div>'; return; }
  box.innerHTML = '';
  const { sekcje, mapa } = grupyMenu();
  for (const sek of sekcje) {
    const naglowek = document.createElement('div');
    naglowek.className = 'menu-sekcja etykieta';
    naglowek.textContent = sek;
    box.appendChild(naglowek);
    const poz = mapa.get(sek);
    poz.forEach((it, i) => {
      const el = document.createElement('div');
      el.className = 'wpis';
      el.innerHTML = `
        <div class="kolejnosc">
          <button class="strzal" data-gora ${i === 0 ? 'disabled' : ''} aria-label="W górę">↑</button>
          <button class="strzal" data-dol ${i === poz.length - 1 ? 'disabled' : ''} aria-label="W dół">↓</button>
        </div>
        <div class="tresc">
          <div class="tyt"></div>
          <div class="meta"><span class="detale"></span></div>
        </div>
        <div class="akcje">
          <span class="menu-cena"></span>
          <button class="btn pusty mały" data-edit>Edytuj</button>
        </div>`;
      el.querySelector('.tyt').textContent = it.nazwa;
      el.querySelector('.menu-cena').textContent = it.cena || '';
      el.querySelector('.detale').textContent = [it.dieta, it.sklad ? 'opis' : ''].filter(Boolean).join(' · ');
      el.querySelector('[data-edit]').addEventListener('click', () => otworzPoz(it.id));
      el.querySelector('[data-gora]').addEventListener('click', () => przesunPoz(it, sek, -1));
      el.querySelector('[data-dol]').addEventListener('click', () => przesunPoz(it, sek, 1));
      box.appendChild(el);
    });
  }
}

// zamiana miejscami w obrębie sekcji + przenumerowanie sort (10,20,30…)
async function przesunPoz(it, sek, kierunek) {
  const wSekcji = menu.filter((m) => m.sekcja === sek);
  const idx = wSekcji.findIndex((m) => m.id === it.id);
  const j = idx + kierunek;
  if (j < 0 || j >= wSekcji.length) return;
  [wSekcji[idx], wSekcji[j]] = [wSekcji[j], wSekcji[idx]];
  await Promise.all(wSekcji.map((m, k) => sb.from('menu_items').update({ sort: (k + 1) * 10 }).eq('id', m.id)));
  await wczytajMenu();
}

async function otworzPoz(id) {
  edytowanaPoz = id;
  pokazInfo($('poz-info'), '', '');
  $('btn-poz-usun').hidden = !id;
  wypelnijSekcje();
  if (!id) {
    $('poz-tytul').textContent = 'Nowa pozycja';
    ['poz-sekcja', 'poz-nazwa', 'poz-cena', 'poz-sklad'].forEach((f) => ($(f).value = ''));
    $('poz-dieta').value = '';
  } else {
    const { data, error } = await sb.from('menu_items').select('*').eq('id', id).single();
    if (error || !data) { pokazInfo($('poz-info'), 'Nie udało się wczytać pozycji.', 'zle'); return; }
    $('poz-tytul').textContent = 'Edycja pozycji';
    $('poz-sekcja').value = data.sekcja || '';
    $('poz-nazwa').value = data.nazwa || '';
    $('poz-cena').value = data.cena || '';
    $('poz-sklad').value = data.sklad || '';
    $('poz-dieta').value = data.dieta || '';
  }
  $('widok-menu').hidden = true; $('widok-menu-edytor').hidden = false; window.scrollTo(0, 0);
}

$('btn-nowa-poz').addEventListener('click', () => otworzPoz(null));
$('btn-poz-wroc').addEventListener('click', () => { $('widok-menu-edytor').hidden = true; $('widok-menu').hidden = false; });
$('btn-poz-anuluj').addEventListener('click', () => { $('widok-menu-edytor').hidden = true; $('widok-menu').hidden = false; });

$('btn-poz-zapisz').addEventListener('click', async () => {
  const sekcja = $('poz-sekcja').value.trim();
  const nazwa = $('poz-nazwa').value.trim();
  if (!sekcja || !nazwa) { pokazInfo($('poz-info'), 'Sekcja i nazwa są wymagane.', 'zle'); return; }
  const rekord = {
    sekcja, nazwa,
    cena: $('poz-cena').value.trim() || null,
    sklad: $('poz-sklad').value.trim() || null,
    dieta: $('poz-dieta').value || null,
  };
  const wSekcji = menu.filter((m) => m.sekcja === sekcja && m.id !== edytowanaPoz);
  if (wSekcji.length) rekord.sekcja_sort = wSekcji[0].sekcja_sort;
  else rekord.sekcja_sort = menu.length ? Math.max(...menu.map((m) => m.sekcja_sort ?? 0)) + 10 : 10;
  if (!edytowanaPoz) rekord.sort = wSekcji.length ? Math.max(...wSekcji.map((m) => m.sort ?? 0)) + 10 : 10;

  const btn = $('btn-poz-zapisz'); btn.disabled = true; btn.textContent = 'Zapisywanie…';
  const odp = edytowanaPoz
    ? await sb.from('menu_items').update(rekord).eq('id', edytowanaPoz)
    : await sb.from('menu_items').insert(rekord);
  btn.disabled = false; btn.textContent = 'Zapisz';
  if (odp.error) { pokazInfo($('poz-info'), 'Nie udało się zapisać.', 'zle'); return; }
  await wczytajMenu();
  $('widok-menu-edytor').hidden = true; $('widok-menu').hidden = false;
  pokazInfo($('menu-info'), 'Zapisano. Aby pokazać zmiany na stronie, kliknij „Aktualizuj stronę”.', 'ok');
});

$('btn-poz-usun').addEventListener('click', async () => {
  if (!edytowanaPoz) return;
  if (!confirm('Usunąć tę pozycję z menu?')) return;
  const { error } = await sb.from('menu_items').delete().eq('id', edytowanaPoz);
  if (error) { pokazInfo($('poz-info'), 'Nie udało się usunąć.', 'zle'); return; }
  await wczytajMenu();
  $('widok-menu-edytor').hidden = true; $('widok-menu').hidden = false;
  pokazInfo($('menu-info'), 'Usunięto.', 'ok');
});
