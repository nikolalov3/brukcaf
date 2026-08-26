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
  const notka = c.note ? `\n              <span class="ciasto-notka">${esc(c.note)}</span>` : '';
  return `        <li class="mlyn-karta ciasto-kafel" data-ciasto tabindex="0" role="button" aria-label="${esc(c.name)} — otwórz">
          <span class="ciasto-foto"${fotoStyle(c.photo_url)}>
            <span class="ciasto-tresc">
              <span class="ciasto-nz">${esc(c.name)}</span>
              <span class="stan-znak ${cls}">${esc(st)}</span>${notka}
            </span>
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

// ── MENU: grupowanie po sekcji (kolejność wg sekcja_sort/sort z zapytania) ──
function grupujMenu(items) {
  const sekcje = [], mapa = new Map();
  for (const it of items) {
    if (!mapa.has(it.sekcja)) { mapa.set(it.sekcja, []); sekcje.push(it.sekcja); }
    mapa.get(it.sekcja).push(it);
  }
  return { sekcje, mapa };
}

// widoczny HTML menu (te same klasy co szablon)
function renderMenu(items) {
  const { sekcje, mapa } = grupujMenu(items);
  return sekcje.map((sek) => {
    const poz = mapa.get(sek).map((it) => {
      const zn = it.dieta ? `<span class="znacznik">${esc(it.dieta)}</span>` : '';
      const cena = it.cena ? `<span class="cena">${esc(it.cena)}</span>` : '';
      const glowa = `<div class="glowa"><span class="nazwa">${esc(it.nazwa)}</span>${zn}<span class="kropki"></span>${cena}</div>`;
      return it.sklad
        ? `      <div class="pozycja">\n        ${glowa}\n        <p class="sklad">${esc(it.sklad)}</p>\n      </div>`
        : `      <div class="pozycja">${glowa}</div>`;
    }).join('\n');
    return `    <div class="grupa zjawia">\n      <h3 class="etykieta">${esc(sek)}</h3>\n${poz}\n    </div>`;
  }).join('\n\n');
}

// JSON-LD Menu (z @id, referencjonowany z CafeOrCoffeeShop.hasMenu)
function menuLd(items) {
  const { sekcje, mapa } = grupujMenu(items);
  const DIETY = { vegan: 'https://schema.org/VeganDiet', wege: 'https://schema.org/VegetarianDiet', vege: 'https://schema.org/VegetarianDiet' };
  const data = {
    '@context': 'https://schema.org', '@type': 'Menu', '@id': 'https://bruk.cafe/#menu',
    name: 'Menu Bruk Cafe', inLanguage: ['pl-PL', 'en'],
    hasMenuSection: sekcje.map((sek) => ({
      '@type': 'MenuSection', name: sek,
      hasMenuItem: mapa.get(sek).map((it) => ({
        '@type': 'MenuItem', name: it.nazwa,
        ...(it.sklad ? { description: it.sklad } : {}),
        ...(it.dieta && DIETY[it.dieta] ? { suitableForDiet: DIETY[it.dieta] } : {}),
        ...(it.cena ? { offers: { '@type': 'Offer', price: String(it.cena).replace(/[^\d.,]/g, '').replace(',', '.'), priceCurrency: 'PLN' } } : {}),
      })),
    })),
  };
  return `<script type="application/ld+json">\n${JSON.stringify(data, null, 2).replaceAll('</', '<\\/')}\n</script>`;
}

// Tolerancyjne: brak markera = pomijamy (np. EN trzyma statyczne angielskie menu).
function podmienMenu(html, inner) {
  const re = /<!-- MENU -->[\s\S]*?<!-- \/MENU -->/;
  if (!re.test(html)) return html;
  return html.replace(re, `<!-- MENU -->\n${inner}\n  <!-- /MENU -->`);
}
function podmienMenuLd(html, ld) {
  const re = /<!-- MENU-LD -->[\s\S]*?<!-- \/MENU-LD -->/;
  if (!re.test(html)) return html;
  return html.replace(re, `<!-- MENU-LD -->\n${ld}\n<!-- /MENU-LD -->`);
}

// ── automatyczne tłumaczenie PL→EN (DeepL) ──────────────────────
// Klucz z env DEEPL_KEY (nie w repo!). Wolumen menu+kaw jest mały, więc
// tłumaczymy przy każdym buildzie. Brak klucza / błąd = EN zostaje jak było.
const DEEPL_KEY = process.env.DEEPL_KEY;
async function tlumaczBatch(teksty) {
  if (!DEEPL_KEY || !teksty.length) return teksty.map(() => null);
  const endpoint = DEEPL_KEY.trim().endsWith(':fx')
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate';
  const wyniki = [];
  for (let i = 0; i < teksty.length; i += 45) {
    const partia = teksty.slice(i, i + 45);
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `DeepL-Auth-Key ${DEEPL_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: partia, source_lang: 'PL', target_lang: 'EN-GB', preserve_formatting: true }),
    });
    if (!r.ok) { console.warn('⚠ DeepL', r.status, '— EN bez tłumaczenia'); return teksty.map(() => null); }
    const j = await r.json();
    (j.translations || []).forEach((t) => wyniki.push(t.text));
  }
  return wyniki;
}
async function mapaTlumaczen(dane) {
  const zbior = new Set();
  const dodaj = (s) => { if (s && String(s).trim()) zbior.add(String(s)); };
  (dane.kawy || []).forEach((k) => { dodaj(k.note); dodaj(k.origin); dodaj(k.method); dodaj(k.obrobka); });
  (dane.ciasta || []).forEach((c) => { dodaj(c.name); dodaj(c.note); });
  (dane.menu || []).forEach((m) => { dodaj(m.sekcja); dodaj(m.nazwa); dodaj(m.sklad); });
  const lista = [...zbior];
  if (!lista.length) return new Map();
  const en = await tlumaczBatch(lista);
  const mapa = new Map();
  lista.forEach((pl, i) => { if (en[i]) mapa.set(pl, en[i]); });
  if (mapa.size) console.log(`DeepL: przetłumaczono ${mapa.size} fraz PL→EN`);
  return mapa;
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
        { name: 'Sernik baskijski', status: 'available', note: '', photo_url: '/img/ciasto.jpg' },
        { name: 'Brownie', status: 'low', note: 'zostały 2 kawałki', photo_url: '/img/ciastka.jpg' },
        { name: 'Chlebek bananowy', status: 'sold_out', note: 'będzie jutro rano' },
      ],
      menu: [
        { sekcja: 'Kawa', nazwa: 'Doppio', cena: '12 zł', sort: 10 },
        { sekcja: 'Kawa', nazwa: 'Flat white', cena: '17 zł', sort: 20 },
        { sekcja: 'Herbata i matcha', nazwa: 'Matcha latte', cena: '21 zł', sort: 10 },
        { sekcja: 'Śniadania', nazwa: 'Pęczak z hummusem', cena: '39 zł', dieta: 'vegan', sklad: 'Kasza pęczak, hummus, marchew, harissa.', sort: 10 },
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

  // Menu osobno: brak tabeli menu_items NIE może wywalić buildu (zostaje statyczne menu).
  let menu = null;
  const mr = await sb.from('menu_items').select('*').order('sekcja_sort').order('sort').order('created_at');
  if (!mr.error) menu = mr.data || [];
  else console.log('menu_items niedostępne — zostaje statyczne menu (' + mr.error.message + ')');

  return { kawy: kawy || [], ciasta: ciasta || [], menu };
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
const menu = dane.menu;  // null gdy brak tabeli → zostaje statyczne menu

// tłumaczenia PL→EN (pusta mapa gdy brak DEEPL_KEY albo błąd → EN zostaje jak było)
const mapa = DEMO ? new Map() : await mapaTlumaczen(dane);
const tr = (s) => (s && mapa.get(s)) || s;
function daneDlaJezyka(lang) {
  if (lang !== 'en' || !mapa.size) return { kawy, ciasta, menu, tlumaczone: false };
  return {
    kawy: kawy.map((k) => ({ ...k, note: tr(k.note), origin: tr(k.origin), method: tr(k.method), obrobka: tr(k.obrobka) })),
    ciasta: ciasta.map((c) => ({ ...c, name: tr(c.name), note: tr(c.note) })),
    menu: menu ? menu.map((m) => ({ ...m, sekcja: tr(m.sekcja), nazwa: tr(m.nazwa), sklad: tr(m.sklad) })) : menu,
    tlumaczone: true,
  };
}

let plKawyHtml = '', plMenuHtml = null;  // kawy i menu z PL — do porównania z żywą stroną
for (const [lang, t] of Object.entries(L)) {
  const dl = daneDlaJezyka(lang);
  let html = readFileSync(t.file, 'utf8');
  const kInner = dl.kawy.length ? dl.kawy.map((k) => kartaKawy(k, t)).join('\n') : pustaKarta(t.pustoKawy);
  const cInner = dl.ciasta.length ? dl.ciasta.map((c) => kartaCiasta(c, t)).join('\n') : pustaKarta(t.pustoCiasta);
  if (lang === 'pl') { plKawyHtml = kInner; plMenuHtml = (menu && menu.length) ? renderMenu(menu) : null; }
  html = podmienListe(html, 'data-kawy', kInner);
  html = podmienListe(html, 'data-ciasta', cInner);
  html = podmienLd(html, jsonLd(dl.kawy, dl.ciasta));
  // menu: PL zawsze z bazy; EN tylko gdy mamy tłumaczenie (inaczej zostaje statyczne angielskie)
  const menuDoWstawienia = (lang === 'pl' || dl.tlumaczone) ? dl.menu : null;
  if (menuDoWstawienia && menuDoWstawienia.length) {
    html = podmienMenu(html, renderMenu(menuDoWstawienia));
    html = podmienMenuLd(html, menuLd(menuDoWstawienia));
  }
  writeFileSync(t.file, html);
  const info = menu && menu.length ? `, ${menu.length} poz. menu` : '';
  const tl = (lang === 'en' && dl.tlumaczone) ? ' + EN tłumaczone' : '';
  console.log(`✓ ${t.file}: ${kawy.length}/${dane.kawy.length} kaw, ${ciasta.length}/${dane.ciasta.length} ciast${info}${tl}${DEMO ? ' (demo)' : ''}`);
}

// Czy treść ważna dla GEO (KAWY lub MENU) zmieniła się względem żywej strony?
// Jeśli zmieniły się tylko ciasta, nie ma sensu pingować wyszukiwarek.
async function trescBezZmian(nowyKInner, noweMenu) {
  try {
    const r = await fetch('https://bruk.cafe/');
    if (!r.ok) return false;                 // nie wiemy → dla bezpieczeństwa pinguj
    const live = await r.text();
    const mk = live.match(/<ul class="mlyn-strip" data-kawy>([\s\S]*?)<\/ul>/);
    if (!mk) return false;
    if (mk[1].trim() !== nowyKInner.trim()) return false;   // kawy się zmieniły
    if (noweMenu != null) {                                 // menu z bazy — porównaj
      const mm = live.match(/<!-- MENU -->([\s\S]*?)<!-- \/MENU -->/);
      if (!mm) return false;
      if (mm[1].trim() !== noweMenu.trim()) return false;   // menu się zmieniło
    }
    return true;                                            // ani kawy, ani menu — pewnie tylko ciasta
  } catch {
    return false;
  }
}

// ── IndexNow — powiadom Bing/Yandex (pośrednio ChatGPT), TYLKO gdy zmieniły się kawy lub menu ──
// Klucz jest jawny z założenia (hostowany w publicznym pliku KLUCZ.txt).
const INDEXNOW_KEY = 'dcdea3335dc57ab36cf2c27e6166e0e7';
if (!DEMO) {
  if (await trescBezZmian(plKawyHtml, plMenuHtml)) {
    console.log('IndexNow: kawy i menu bez zmian (zmiana tylko ciast?) — pomijam ping');
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
