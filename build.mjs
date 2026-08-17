// build.mjs — generuje statyczną sekcję "Dziś w młynku" + JSON-LD z bazy Supabase.
//
// Dlaczego: boty AI (GPTBot, ClaudeBot, PerplexityBot) i Google nie odpalają
// JavaScriptu. Treść z panelu musi trafić do gotowego HTML-a przy deployu,
// inaczej sekcja jest dla nich pusta. Ten skrypt czyta bazę i wstawia karty
// (te same klasy, co szablon) oraz dane strukturalne Menu -> MenuItem.
//
// Uruchomienie:
//   node build.mjs           — czyta Supabase (potrzebne SUPABASE_URL, SUPABASE_ANON_KEY)
//   node build.mjs --demo    — renderuje przykładowe dane (podgląd bez bazy)

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';

const DEMO = process.argv.includes('--demo');

// ── słowniki językowe (podpisy zależne od strony) ───────────────
const L = {
  pl: {
    file: 'index.html', intensity: 'Intensywność',
    pustoKawy: 'Zapytaj baristę, co dziś mielimy — świeże ziarno czeka.',
    pustoCiasta: 'Dziś bez wypieków. Zajrzyj jutro.',
    status: { available: 'dostępne', low: 'ostatnie sztuki', sold_out: 'wyprzedane' },
  },
  en: {
    file: 'en/index.html', intensity: 'Intensity',
    pustoKawy: 'Ask the barista what we are grinding today.',
    pustoCiasta: 'No bakes today. Come back tomorrow.',
    status: { available: 'available', low: 'last few', sold_out: 'sold out' },
  },
};

// ── narzędzia ───────────────────────────────────────────────────
const esc = (s) => String(s ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const fotoStyle = (url) => url ? ` style="background-image:url('${esc(url)}')"` : '';

function beans(level) {
  const n = Math.max(0, Math.min(5, Number(level) || 0));
  let s = '';
  for (let i = 1; i <= 5; i++) s += i <= n ? '<i class="pelne"></i>' : '<i></i>';
  return s;
}

// ── renderowanie kart ───────────────────────────────────────────
function kartaKawy(k, t) {
  const poch = k.origin ? `\n            <span class="karta-poch">${esc(k.origin)}</span>` : '';
  const op = k.note ? `\n            <span class="karta-op">${esc(k.note)}</span>` : '';
  // chipy na dole: metoda parzenia + metoda obróbki ziaren
  const chipy = [];
  if (k.method) chipy.push(`<span class="karta-chip">${esc(k.method)}</span>`);
  if (k.obrobka) chipy.push(`<span class="karta-chip">${esc(k.obrobka)}</span>`);
  const chipRow = chipy.length
    ? `\n            <span class="karta-chipy">${chipy.join('')}</span>` : '';
  const foto2 = k.photo_url2
    ? `<span class="karta-foto2" aria-hidden="true"${fotoStyle(k.photo_url2)}></span>` : '';
  // nazwa skaluje się w dół dla długich, żeby blok pod nią był zawsze na tej samej wysokości
  const dl = (k.name || '').length;
  const nzKl = dl > 26 ? ' nz-maly' : dl > 16 ? ' nz-sredni' : '';
  // gdy jest link do produktu — nazwa staje się linkiem (styl jak tekst)
  const nazwaHtml = k.link_url
    ? `<a class="karta-nz karta-link${nzKl}" href="${esc(k.link_url)}" target="_blank" rel="noopener">${esc(k.name)}</a>`
    : `<span class="karta-nz${nzKl}">${esc(k.name)}</span>`;
  return `        <li class="mlyn-karta">
          <span class="karta-foto" data-foto aria-hidden="true"${fotoStyle(k.photo_url)}>${foto2}</span>
          <span class="karta-tresc">
            <span class="karta-glowa">${nazwaHtml}${poch}</span>${op}${chipRow}
          </span>
        </li>`;
}

function kartaCiasta(c, t) {
  const st = t.status[c.status] || t.status.available;
  const cls = c.status === 'low' ? 'malo' : c.status === 'sold_out' ? 'wyprzedane' : 'dostepne';
  const notka = c.note ? `\n            <span class="karta-notka">${esc(c.note)}</span>` : '';
  return `        <li class="mlyn-karta">
          <span class="karta-foto" data-foto aria-hidden="true"${fotoStyle(c.photo_url)}></span>
          <span class="karta-tresc">
            <span class="karta-nz">${esc(c.name)}</span>
            <span class="stan-znak ${cls}">${esc(st)}</span>${notka}
          </span>
        </li>`;
}

function pustaKarta(txt) {
  return `        <li class="mlyn-karta" style="flex-basis:100%">
          <span class="karta-tresc"><span class="karta-op">${esc(txt)}</span></span>
        </li>`;
}

// ── dane strukturalne (schema.org Menu) ─────────────────────────
function jsonLd(kawy, ciasta) {
  const pozycja = (x) => ({
    '@type': 'MenuItem',
    name: x.name,
    ...(x.note ? { description: x.note } : {}),
    ...(x.link_url ? { url: x.link_url, sameAs: x.link_url } : {}),
  });
  const sekcje = [];
  if (kawy.length) sekcje.push({ '@type': 'MenuSection', name: 'Kawa', hasMenuItem: kawy.map(pozycja) });
  if (ciasta.length) sekcje.push({ '@type': 'MenuSection', name: 'Wypieki', hasMenuItem: ciasta.map(pozycja) });
  if (!sekcje.length) return '';
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Menu',
    name: 'Dziś w młynku — Bruk Cafe',
    hasMenuSection: sekcje,
  };
  const json = JSON.stringify(data, null, 2).replaceAll('</', '<\\/');
  return `<script type="application/ld+json">\n${json}\n</script>`;
}

// ── wstrzykiwanie do HTML ───────────────────────────────────────
function podmienListe(html, attr, inner) {
  const re = new RegExp(`(<ul class="mlyn-strip[^"]*" ${attr}>)[\\s\\S]*?(</ul>)`);
  if (!re.test(html)) { console.error(`✗ Nie znalazłem <ul ${attr}>`); process.exit(1); }
  return html.replace(re, `$1\n${inner}\n      $2`);
}

function podmienLd(html, ld) {
  const re = /<!-- MLYN-LD -->[\s\S]*?<!-- \/MLYN-LD -->/;
  if (!re.test(html)) { console.error('✗ Brak markera MLYN-LD w <head>'); process.exit(1); }
  return html.replace(re, `<!-- MLYN-LD -->\n${ld}\n<!-- /MLYN-LD -->`);
}

// ── pobranie danych ─────────────────────────────────────────────
async function pobierz() {
  if (DEMO) {
    return {
      kawy: [
        { name: 'HAYB Yellow', method: 'Espresso', obrobka: 'naturalna', origin: 'Brazylia + Gwatemala · palarnia HAYB', note: 'Ciemny blend stu procent arabiki. Czekolada, orzechy, pełne ciało.', link_url: 'https://hayb.pl/produkt/yellow/' },
        { name: 'Etiopia Guji', method: 'Przelew V60', obrobka: 'myta', origin: 'palarnia HAYB', note: 'Owoce pestkowe, herbaciana lekkość, klarowna słodycz.' },
        { name: 'Kolumbia Huila', method: 'Przelew V60', obrobka: 'honey', origin: 'palarnia Coffee Proficiency', note: 'Czekolada, karmel, orzech laskowy.' },
      ],
      ciasta: [
        { name: 'Sernik baskijski', status: 'available', note: '' },
        { name: 'Brownie', status: 'low', note: 'zostały 2 kawałki' },
        { name: 'Chlebek bananowy', status: 'sold_out', note: 'będzie jutro rano' },
      ],
    };
  }
  const URL = process.env.SUPABASE_URL;
  const KEY = process.env.SUPABASE_ANON_KEY;
  // Miękka degradacja: brak zmiennych albo błąd bazy NIE może wywalić deployu.
  // Zostawiamy wtedy zawartość szablonu i logujemy ostrzeżenie.
  if (!URL || !KEY) { console.warn('⚠ Brak SUPABASE_URL / SUPABASE_ANON_KEY — pomijam generowanie, zostaje szablon.'); return null; }
  const sb = createClient(URL, KEY, { auth: { persistSession: false } });

  const [{ data: kawy, error: e1 }, { data: ciasta, error: e2 }] = await Promise.all([
    sb.from('coffees').select('*').eq('available', true).order('sort').order('created_at'),
    sb.from('stock_items').select('*').order('sort').order('created_at'),
  ]);
  if (e1 || e2) { console.warn('⚠ Błąd odczytu z Supabase — pomijam generowanie, zostaje szablon.', (e1 || e2).message); return null; }
  return { kawy: kawy || [], ciasta: ciasta || [] };
}

// Na stronie pokazujemy tylko czoło listy — reszta czeka w panelu (wyszarzona).
// Te limity MUSZĄ być zgodne z admin/admin.js (LIMIT_KAWY / LIMIT_CIASTA).
const LIMIT_KAWY = 6;
const LIMIT_CIASTA = 6;

// ── główny przebieg ─────────────────────────────────────────────
const dane = await pobierz();
if (!dane) process.exit(0); // nic nie zmieniamy, deploy leci dalej z szablonem
const kawy = dane.kawy.slice(0, LIMIT_KAWY);
const ciasta = dane.ciasta.slice(0, LIMIT_CIASTA);

let plKawyHtml = '';  // kawy z wersji PL — do porównania z żywą stroną
for (const [lang, t] of Object.entries(L)) {
  let html = readFileSync(t.file, 'utf8');
  const kInner = kawy.length ? kawy.map((k) => kartaKawy(k, t)).join('\n') : pustaKarta(t.pustoKawy);
  const cInner = ciasta.length ? ciasta.map((c) => kartaCiasta(c, t)).join('\n') : pustaKarta(t.pustoCiasta);
  if (lang === 'pl') plKawyHtml = kInner;
  html = podmienListe(html, 'data-kawy', kInner);
  html = podmienListe(html, 'data-ciasta', cInner);
  html = podmienLd(html, jsonLd(kawy, ciasta));
  writeFileSync(t.file, html);
  console.log(`✓ ${t.file}: ${kawy.length}/${dane.kawy.length} kaw, ${ciasta.length}/${dane.ciasta.length} ciast${DEMO ? ' (demo)' : ''}`);
}

// Czy sekcja KAW zmieniła się względem tego, co jest teraz na żywej stronie?
// Jeśli zmieniły się tylko ciasta, nie ma sensu pingować wyszukiwarek.
async function kawyBezZmian(nowyKInner) {
  try {
    const r = await fetch('https://bruk.cafe/');
    if (!r.ok) return false;                 // nie wiemy → dla bezpieczeństwa pinguj
    const live = await r.text();
    const m = live.match(/<ul class="mlyn-strip" data-kawy>([\s\S]*?)<\/ul>/);
    if (!m) return false;
    return m[1].trim() === nowyKInner.trim();
  } catch {
    return false;
  }
}

// ── IndexNow — powiadom Bing/Yandex (pośrednio ChatGPT), TYLKO gdy zmieniły się kawy ──
// Klucz jest jawny z założenia (hostowany w publicznym pliku KLUCZ.txt).
const INDEXNOW_KEY = 'dcdea3335dc57ab36cf2c27e6166e0e7';
if (!DEMO) {
  if (await kawyBezZmian(plKawyHtml)) {
    console.log('IndexNow: kawy bez zmian (zmiana tylko ciast?) — pomijam ping');
  } else try {
    const r = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: 'bruk.cafe',
        key: INDEXNOW_KEY,
        keyLocation: `https://bruk.cafe/${INDEXNOW_KEY}.txt`,
        urlList: ['https://bruk.cafe/', 'https://bruk.cafe/en/'],
      }),
    });
    console.log('IndexNow:', r.status);
  } catch (e) {
    console.log('IndexNow pominięty:', e.message);
  }
}
