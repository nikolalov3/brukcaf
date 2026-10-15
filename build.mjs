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
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const DEMO = process.argv.includes('--demo');

// ── słowniki językowe (podpisy zależne od strony) ───────────────
const L = {
  pl: {
    file: 'index.html', intensity: 'Intensywność',
    pustoKawy: 'Zapytaj baristę, co dziś mielimy — świeże ziarno czeka.',
    pustoCiasta: 'Dziś bez wypieków. Zajrzyj jutro.',
    status: { available: 'dostępne', low: 'ostatnie sztuki', sold_out: 'wyprzedane' },
    sklep: { namiejscu: 'Na miejscu', brak: 'Chwilowo brak' },
  },
  en: {
    file: 'en/index.html', intensity: 'Intensity',
    pustoKawy: 'Ask the barista what we are grinding today.',
    pustoCiasta: 'No bakes today. Come back tomorrow.',
    status: { available: 'available', low: 'last few', sold_out: 'sold out' },
    sklep: { namiejscu: 'In-store', brak: 'Sold out' },
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
  const notka = c.note ? `\n            <span class="ciasto-notka">${esc(c.note)}</span>` : '';
  return `        <li class="mlyn-karta ciasto-kafel"${fotoStyle(c.photo_url)}>
          <span class="ciasto-tresc">
            <span class="ciasto-nz">${esc(c.name)}</span>
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
function jsonLd(kawy, herbaty, ciasta) {
  const pozycja = (x) => ({
    '@type': 'MenuItem',
    name: x.name,
    ...(x.note ? { description: x.note } : {}),
    ...(x.link_url ? { url: x.link_url, sameAs: x.link_url } : {}),
  });
  const sekcje = [];
  if (kawy.length) sekcje.push({ '@type': 'MenuSection', name: 'Kawa', hasMenuItem: kawy.map(pozycja) });
  if (herbaty.length) sekcje.push({ '@type': 'MenuSection', name: 'Herbata', hasMenuItem: herbaty.map(pozycja) });
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
  const re = new RegExp(`(<ul class="mlyn-strip[^"]*" ${attr}[^>]*>)[\\s\\S]*?(</ul>)`);
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

// ── SKLEP (produkty do kupienia na miejscu) ─────────────────────
function renderSklep(items, t) {
  return items.map((p) => {
    const nd = p.available === false;
    const cena = p.price ? `<span class="sklep-cena">${esc(p.price)}</span>` : '';
    // opis smakowy pojawia się jako warstwa na zdjęciu (hover na desktopie, tap na mobile)
    const warstwa = p.opis
      ? `<span class="sklep-opis-warstwa"><span class="sklep-opis">${esc(p.opis)}</span></span>` : '';
    const klik = p.opis ? ' klik' : '';
    const tab = p.opis ? ' tabindex="0"' : '';
    return `    <li class="sklep-karta${nd ? ' niedostepny' : ''}${klik}"${tab}>
      <span class="sklep-foto"${fotoStyle(p.photo_url)}>${warstwa}</span>
      <span class="sklep-stopka">
        <span class="sklep-nazwa">${esc(p.name)}</span>${cena}
      </span>
    </li>`;
  }).join('\n');
}

// Uwaga: świadomie BEZ Product/Offer JSON-LD dla sklepu. Bruk to kawiarnia,
// nie sklep wysyłkowy — Google wymagał pól e-commerce (oceny, GTIN, wysyłka,
// zwroty), których nie mamy. Sklep niesie sama widoczna sekcja + CafeOrCoffeeShop.
function podmienSklep(html, inner) {
  const re = /<!-- SKLEP -->[\s\S]*?<!-- \/SKLEP -->/;
  if (!re.test(html)) return html;
  return html.replace(re, `<!-- SKLEP -->\n${inner}\n  <!-- /SKLEP -->`);
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
  (dane.sklep || []).forEach((p) => { dodaj(p.name); dodaj(p.opis); });
  const lista = [...zbior];
  if (!lista.length) return new Map();
  const en = await tlumaczBatch(lista);
  const mapa = new Map();
  lista.forEach((pl, i) => { if (en[i]) mapa.set(pl, en[i]); });
  if (mapa.size) console.log(`DeepL: przetłumaczono ${mapa.size} fraz PL→EN`);
  return mapa;
}

// ── llms.txt — plik kontekstowy dla modeli AI (GPTBot, ClaudeBot, Perplexity) ──
// Fakty i kontekst, bez superlatywów bez pokrycia (modele je dyskontują). Bez
// oceny liczbowej — zmienia się i tworzyłaby niespójność z Google. Oferty
// sezonowej NIE wpisujemy na sztywno (gnije w cache) — kierujemy do menu na
// stronie. Godziny ze stałej (MUSZĄ być zgodne z index.html), data z buildu.
const GODZINY_LLM = {
  pl: ['Poniedziałek-piątek 8:00-18:00', 'Sobota 9:00-17:00', 'Niedziela 9:00-14:00', 'Śniadania 8:00-13:00'],
  en: ['Monday-Friday 8:00-18:00', 'Saturday 9:00-17:00', 'Sunday 9:00-14:00', 'Breakfast 8:00-13:00'],
};
function llmsTxt(lang) {
  const data = new Date().toISOString().slice(0, 10);
  const godz = GODZINY_LLM[lang].map((g) => '- ' + g).join('\n');
  if (lang === 'en') {
    return `# Bruk Cafe

> Specialty coffee shop in Kleparz, central Kraków. Coffee ground to order, breakfast, homemade cakes and a distinctive interior with a mirrored ceiling.

## About
Bruk Cafe is a small specialty coffee shop in Kleparz, next to Kraków's Old Town, a few minutes from the Main Square and the main train station. We serve specialty coffee, fresh breakfast and homemade cakes. You can also buy coffee beans to take home.

## Interior and atmosphere
An interior with character: a ceiling fully lined with mirrors, rugs and a minimalist look. A calm, atmospheric spot for coffee, laptop work and photos.

## Good for
- A calm coffee and relaxing
- Working on a laptop
- Breakfast in the centre
- Meeting up or a date
- Photos (mirrored ceiling)

## Offer
- Specialty coffee, ground on site
- Breakfast daily 8:00-13:00
- Homemade cakes and tea
- Shop: coffee beans to buy on site
- Seasonal specials change through the year, see the menu on the site

Order at the bar.

## Hours
${godz}

## Address
ul. Krótka 1, 31-149 Kraków (Kleparz, Old Town)

## Guest reviews
- "Great atmosphere, the ceiling is all mirrors, so you can take nice photos for Instagram"
- "A wonderful place with character, an original decor that sticks in your memory"
- "Great spot, with ideas, good coffee and a friendly vibe"

## Links
- Site: https://bruk.cafe/
- Menu: https://bruk.cafe/#karta
- Visit / contact: https://bruk.cafe/visit
- Instagram: https://www.instagram.com/brukcafe/

Last updated: ${data}
`;
  }
  return `# Bruk Cafe

> Kawiarnia specialty na Kleparzu, w centrum Krakowa. Kawa palona pod zamówienie z młynkiem na miejscu, śniadania, domowe ciasta i klimatyczne wnętrze z lustrzanym sufitem.

## O miejscu
Bruk Cafe to kameralna kawiarnia specialty na krakowskim Kleparzu, przy Starym Mieście, kilka minut od Rynku Głównego i Dworca Głównego. Serwujemy kawę specialty, świeże śniadania i domowe ciasta. Kawę można też kupić w ziarnach do domu.

## Wnętrze i atmosfera
Wnętrze z charakterem: sufit w całości wyłożony lustrami, dywany i minimalistyczny wystrój. Spokojne, klimatyczne miejsce na kawę, pracę z laptopem i dobre zdjęcia.

## Dobre na
- Spokojną kawę i relaks
- Pracę z laptopem
- Śniadanie w centrum
- Spotkanie lub randkę
- Zdjęcia (lustrzany sufit)

## Oferta
- Kawa specialty, młynek na miejscu
- Śniadania codziennie 8:00-13:00
- Domowe ciasta i herbaty
- Sklep: kawa ziarnista do kupienia na miejscu
- Oferta sezonowa rotuje w ciągu roku, aktualne pozycje w menu na stronie

Zamawiasz przy barze.

## Godziny
${godz}

## Adres
ul. Krótka 1, 31-149 Kraków (Kleparz, Stare Miasto)

## Opinie gości
- "To miejsce ma świetny klimat, sufit jest cały w lustrach, więc można zrobić fajne zdjęcia na Instagram"
- "Cudowne miejsce z charakterem, kawiarnia ma oryginalny wystrój, który od razu zapada w pamięć"
- "Super miejsce, z pomysłem, dobrą kawą i przyjaznym klimatem"

## Linki
- Strona: https://bruk.cafe/
- Menu: https://bruk.cafe/#karta
- Odwiedź / kontakt: https://bruk.cafe/visit
- Instagram: https://www.instagram.com/brukcafe/

Ostatnia aktualizacja: ${data}
`;
}

// ── BLOG: publiczne strony z tabeli `posts` (status=published) ──────
// Panel /admin/ zapisuje wpisy do bazy; tu budujemy statyczny /blog/ i
// /blog/<slug>/ w szacie Bruka, z danymi strukturalnymi BlogPosting.
// Zasada: blog WSPIERA stronę główną, nie konkuruje — niższy priorytet w
// sitemapie, osobne tematy (newsy/kawy), linki prowadzą z powrotem na główną.
const MIESIACE_PL = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
function dataPl(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return `${d.getUTCDate()} ${MIESIACE_PL[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
// Treść z edytora (ProseMirror) niesie śmieciowe style inline i data-*; czyścimy,
// żeby wpis wyglądał spójnie ze stroną. Zostają tagi i atrybuty src/href/alt.
function czyscTresc(html) {
  return String(html || '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(meta|link|html|head|body)\b[^>]*>/gi, '')
    .replace(/\sdata-[\w-]+="[^"]*"/g, '')
    .replace(/\sstyle="[^"]*"/g, '')
    .replace(/\sclass="[^"]*"/g, '')
    // na stronie jedyny H1 to tytuł wpisu — nagłówki z treści schodzą o poziom
    .replace(/<h1(\b[^>]*)?>/gi, '<h2>').replace(/<\/h1>/gi, '</h2>');
}
const absURL = (u) => !u ? '' : (u.startsWith('http') ? u : `https://bruk.cafe${u.startsWith('/') ? '' : '/'}${u}`);

// Blog dziedziczy wygląd ze strony głównej: /style.css daje tokeny (--tlo,
// --atrament, --linia…), fonty i reset. Tu tylko brutalistyczna warstwa bloga:
// jasno, ostre krawędzie (zero border-radius), czarne hairline'y, mono wersaliki.
// BEZ dark mode — strona główna jest wyłącznie jasna.
const BLOG_CSS = `
.blog-wrap{max-width:780px;margin:0 auto;padding:clamp(40px,7vw,88px) var(--bok)}
.blog-kicker{font:500 clamp(10px,1.1vw,11.5px)/1 var(--mono);letter-spacing:.18em;text-transform:uppercase;color:var(--cichy)}
.blog-kicker a{text-decoration:none}
.blog-wrap>h1{font:600 clamp(2rem,5vw,3.2rem)/1.12 var(--grotesk);letter-spacing:-.015em;margin:.6rem 0 1.4rem}
article h1{font:600 clamp(1.8rem,4.2vw,2.7rem)/1.18 var(--grotesk);letter-spacing:-.01em;margin:.5rem 0 .4rem}
time{display:block;font:500 clamp(10px,1.1vw,11.5px)/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--cichy);margin:.7rem 0}
.blog-cover{width:100%;margin:1.8rem 0 2.4rem;border:1px solid var(--linia)}
.blog-tresc{font-size:1.06rem;line-height:1.62}
.blog-tresc h2{font:600 1.4rem/1.45 var(--grotesk);margin:2.4rem 0 .7rem}
.blog-tresc h3{font:600 1.14rem/1.45 var(--grotesk);margin:1.9rem 0 .5rem}
.blog-tresc p{margin:0 0 1.2rem}
.blog-tresc img{margin:1.8rem 0;border:1px solid var(--linia)}
.blog-tresc a{text-underline-offset:2px}
.blog-autor{font:500 .78rem/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--cichy);margin-top:2.4rem}
.blog-powrot-dol{display:inline-block;margin-top:1.6rem;color:var(--tlo)!important;background:var(--atrament);border:1px solid var(--atrament);padding:10px 16px;font:500 clamp(10px,1.1vw,11.5px)/1 var(--mono);letter-spacing:.18em;text-transform:uppercase;text-decoration:none}
.blog-powrot-dol:hover{opacity:.82}
.blog-lista{list-style:none;margin:2.2rem 0 0;border-top:1px solid var(--linia)}
.blog-karta{border-bottom:1px solid var(--linia)}
.blog-karta a{text-decoration:none;display:block;padding:0 0 32px}
.blog-karta .foto{display:block;aspect-ratio:16/9;background:var(--beton) center/cover no-repeat;border:1px solid var(--linia);margin-top:32px}
.blog-karta .tresc{display:block;padding-top:22px}
.blog-karta h2{font:600 clamp(1.5rem,3vw,1.95rem)/1.18 var(--grotesk);letter-spacing:-.01em;margin:.5rem 0 .55rem}
.blog-karta p{margin:0;color:var(--cichy)}
.blog-karta:hover h2{text-decoration:underline;text-underline-offset:3px}
.blog-foot{border-top:1px solid var(--linia);max-width:var(--max);margin-inline:auto;padding:34px var(--bok);font:500 clamp(10px,1.1vw,11.5px)/1.9 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--cichy)}
.blog-foot a{color:var(--atrament)}
.blog-pusto{color:var(--cichy);font-family:var(--mono);padding:2rem 0}
`;

function szkieletBlog({ lang, title, desc, canonical, ogImage, jsonLd, body }) {
  const og = ogImage ? `<meta property="og:image" content="${esc(ogImage)}">\n<meta name="twitter:image" content="${esc(ogImage)}">` : '';
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Bruk Cafe">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
${og}
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/img/logo.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css">
${jsonLd}
<style>${BLOG_CSS}</style>
<script defer src="https://cloud.umami.is/script.js" data-website-id="5def49a7-c32f-49a2-ba0a-937ac12a760c"></script>
<script>document.documentElement.classList.add("js")</script>
</head>
<body>
<div class="tasma etykieta" aria-hidden="true">
  <div class="tor">
    <span>Espresso</span><span>·</span><span>Flat white</span><span>·</span><span>Drip V60</span><span>·</span>
    <span>Matcha</span><span>·</span><span>Cold brew</span><span>·</span><span>Breakfast 8–13</span><span>·</span>
    <span>Espresso</span><span>·</span><span>Flat white</span><span>·</span><span>Drip V60</span><span>·</span>
    <span>Matcha</span><span>·</span><span>Cold brew</span><span>·</span><span>Breakfast 8–13</span><span>·</span>
  </div>
  <template data-pula>
    <span>Espresso</span><span>Doppio</span><span>Americano</span><span>Flat white</span><span>Cappuccino</span><span>Latte</span><span>Drip V60</span><span>Matcha</span><span>Matcha latte</span><span>Cold brew</span><span data-rola="zawsze">Breakfast 8–13</span><span data-rola="czasem">Wi-Fi</span>
  </template>
</div>
<nav class="nawigacja">
  <div class="ramka rzad">
    <a class="marka" href="/" aria-label="Bruk Cafe, strona główna"><img src="/img/logo.png" alt="Bruk Cafe"></a>
    <div class="linki etykieta">
      <a class="chowaj" href="/#lokal">Wnętrze</a>
      <a class="chowaj" href="/blog/">Blog</a>
      <a class="chowaj" href="/#kontakt">Kontakt</a>
      <a class="blog-ikona" href="/blog/" aria-label="Blog">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 16h6"/></svg>
      </a>
      <div class="wifi">
        <button class="wifi-ikona" type="button" aria-expanded="false" aria-controls="wifi-panel" aria-label="Hasło do Wi-Fi">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="5" r="1.4"/><path d="M12 6.6V20"/><path d="M7.4 20l4.6-9 4.6 9"/><path d="M8.7 20h6.6"/><path d="M8.1 6.2a5.6 5.6 0 0 0 0 7.4"/><path d="M15.9 6.2a5.6 5.6 0 0 1 0 7.4"/><path d="M5.4 3.6a9.2 9.2 0 0 0 0 12.6"/><path d="M18.6 3.6a9.2 9.2 0 0 1 0 12.6"/></svg>
        </button>
        <div class="wifi-panel" id="wifi-panel" hidden
             data-haslo="SvZ$rkhcBAE3" data-kopiuj="Copy password" data-skopiowano="Copied">
          <dl class="wifi-dane">
            <dt class="etykieta">Network</dt><dd data-siec>PLAY_Swiatlowod_7CB0</dd>
            <dt class="etykieta">Password</dt><dd class="wifi-haslo">SvZ$rkhcBAE3</dd>
          </dl>
          <button class="wifi-kopiuj etykieta" type="button">Copy password</button>
          <button class="wifi-zamknij" type="button" aria-label="Close">&times;</button>
        </div>
      </div>
      <a class="jezyk" href="/en/" hreflang="en">EN</a>
    </div>
  </div>
</nav>
${body}
<footer class="blog-foot">
  Bruk Cafe · ul. Krótka 1, 31-149 Kraków (Kleparz)<br>
  <a href="/">bruk.cafe</a> · <a href="https://www.instagram.com/brukcafe/" target="_blank" rel="noopener">Instagram</a>
</footer>
<script src="/skrypt.js" defer></script>
</body>
</html>`;
}

function stronaListaBloga(posts) {
  const canonical = 'https://bruk.cafe/blog/';
  const karty = posts.length ? posts.map((p) => {
    const foto = p.cover_url ? ` style="background-image:url('${esc(p.cover_url)}')"` : '';
    return `    <li class="blog-karta"><a href="/blog/${esc(p.slug)}/">
      <span class="foto"${foto}></span>
      <span class="tresc">
        <time>${dataPl(p.published_at || p.created_at)}</time>
        <h2>${esc(p.title_pl)}</h2>
        ${p.excerpt_pl ? `<p>${esc(p.excerpt_pl)}</p>` : ''}
      </span>
    </a></li>`;
  }).join('\n') : '    <li class="blog-pusto">Nie ma jeszcze wpisów.</li>';
  const jsonLd = `<script type="application/ld+json">\n${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'Blog', '@id': canonical,
    name: 'Blog Bruk Cafe', inLanguage: 'pl-PL',
    publisher: { '@type': 'Organization', name: 'Bruk Cafe', logo: { '@type': 'ImageObject', url: 'https://bruk.cafe/img/logo.png' } },
    blogPost: posts.map((p) => ({ '@type': 'BlogPosting', headline: p.title_pl, url: `https://bruk.cafe/blog/${p.slug}/`, datePublished: p.published_at || p.created_at })),
  }, null, 2).replaceAll('</', '<\\/')}\n</script>`;
  const body = `<main class="blog-wrap">
  <span class="blog-kicker">Bruk Cafe</span>
  <h1>Blog</h1>
  <ul class="blog-lista">
${karty}
  </ul>
</main>`;
  return szkieletBlog({ lang: 'pl', title: 'Blog — Bruk Cafe', desc: 'Nowości, kawy i wydarzenia z Bruk Cafe na Kleparzu w Krakowie.', canonical, ogImage: 'https://bruk.cafe/img/og-cover.jpg', jsonLd, body });
}

function stronaWpisu(p) {
  const canonical = `https://bruk.cafe/blog/${p.slug}/`;
  const cover = absURL(p.cover_url);
  const desc = (p.excerpt_pl || p.title_pl || '').slice(0, 200);
  const ld = (o) => `<script type="application/ld+json">\n${JSON.stringify(o, null, 2).replaceAll('</', '<\\/')}\n</script>`;
  const jsonLd = ld({
    '@context': 'https://schema.org', '@type': 'BlogPosting',
    headline: p.title_pl,
    ...(p.excerpt_pl ? { description: p.excerpt_pl } : {}),
    ...(cover ? { image: cover } : {}),
    datePublished: p.published_at || p.created_at,
    dateModified: p.updated_at || p.published_at || p.created_at,
    author: { '@type': 'Organization', name: p.author || 'Bruk Cafe' },
    publisher: { '@type': 'Organization', name: 'Bruk Cafe', logo: { '@type': 'ImageObject', url: 'https://bruk.cafe/img/logo.png' } },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    inLanguage: 'pl-PL',
  }) + '\n' + ld({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Bruk Cafe', item: 'https://bruk.cafe/' },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://bruk.cafe/blog/' },
      { '@type': 'ListItem', position: 3, name: p.title_pl, item: canonical },
    ],
  });
  const coverHtml = cover ? `    <img class="blog-cover" src="${esc(p.cover_url)}" alt="${esc(p.title_pl)}">\n` : '';
  const body = `<main class="blog-wrap">
  <article>
    <span class="blog-kicker"><a href="/blog/" style="color:inherit;text-decoration:none">Blog</a></span>
    <h1>${esc(p.title_pl)}</h1>
    <time>${dataPl(p.published_at || p.created_at)}</time>
${coverHtml}    <div class="blog-tresc">${czyscTresc(p.body_pl)}</div>
    <p class="blog-autor">${esc(p.author || 'Bruk Cafe')}</p>
    <a class="blog-powrot-dol" href="/">Wróć na stronę Bruka</a>
  </article>
</main>`;
  return szkieletBlog({ lang: 'pl', title: `${p.title_pl} — Bruk Cafe`, desc, canonical, ogImage: cover || 'https://bruk.cafe/img/og-cover.jpg', jsonLd, body });
}

// sitemap z priorytetami: strona główna najmocniejsza (1.0), blog wspiera (0.5), wpisy niżej (0.4)
function generujSitemap(posts) {
  const dzis = new Date().toISOString().slice(0, 10);
  const alt = `
    <xhtml:link rel="alternate" hreflang="pl" href="https://bruk.cafe/"/>
    <xhtml:link rel="alternate" hreflang="en" href="https://bruk.cafe/en/"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="https://bruk.cafe/"/>`;
  const u = (loc, prio, lastmod, alternaty) => `  <url>
    <loc>${loc}</loc>${alternaty || ''}${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}
    <priority>${prio}</priority>
  </url>`;
  const wpisy = (posts || []).map((p) => u(`https://bruk.cafe/blog/${esc(p.slug)}/`, '0.4', (p.updated_at || p.published_at || p.created_at || '').slice(0, 10)));
  const blogLast = (posts && posts[0]) ? (posts[0].updated_at || posts[0].published_at || dzis).slice(0, 10) : dzis;
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${u('https://bruk.cafe/', '1.0', dzis, alt)}
${u('https://bruk.cafe/en/', '0.8', dzis, alt)}
${u('https://bruk.cafe/visit/', '0.5', dzis)}
${u('https://bruk.cafe/blog/', '0.5', blogLast)}${wpisy.length ? '\n' + wpisy.join('\n') : ''}
</urlset>
`;
}

// Mobilny odnośnik do najnowszego wpisu, wstawiany na stronie głównej przed
// stopką (na desktopie jest link „Blog" w pasku, więc tylko na mobile — CSS).
function blogMobi(posts) {
  const p = (posts || []).find((x) => x.status === 'published' && x.slug && x.title_pl);
  if (!p) return '';
  return `<div class="ramka"><a class="blog-mobi" href="/blog/${esc(p.slug)}/">
    <span class="nadpis etykieta">Najnowsze na blogu</span>
    <span class="tytul">${esc(p.title_pl)} <span class="strzalka">&rarr;</span></span>
  </a></div>`;
}
function podmienBlogMobi(html, inner) {
  const re = /<!-- BLOG-MOBI -->[\s\S]*?<!-- \/BLOG-MOBI -->/;
  if (!re.test(html)) return html;
  return html.replace(re, `<!-- BLOG-MOBI -->\n${inner}\n<!-- /BLOG-MOBI -->`);
}

// ── pobranie danych ─────────────────────────────────────────────
async function pobierz() {
  if (DEMO) {
    return {
      kawy: [
        { name: 'HAYB Yellow', method: 'Espresso', obrobka: 'naturalna', origin: 'Brazylia + Gwatemala · palarnia HAYB', note: 'Ciemny blend stu procent arabiki. Czekolada, orzechy, pełne ciało.', link_url: 'https://hayb.pl/produkt/yellow/' },
        { name: 'Etiopia Guji', method: 'Przelew V60', obrobka: 'myta', origin: 'palarnia HAYB', note: 'Owoce pestkowe, herbaciana lekkość, klarowna słodycz.' },
        { name: 'Kolumbia Huila', method: 'Przelew V60', obrobka: 'honey', origin: 'palarnia Coffee Proficiency', note: 'Czekolada, karmel, orzech laskowy.' },
        { name: 'Sencha', kind: 'herbata', method: '70°C · 2 min', origin: 'Japonia', note: 'Trawiasta, morska świeżość, delikatna słodycz.' },
        { name: 'Earl Grey', kind: 'herbata', method: '95°C · 4 min', origin: 'czarna, bergamotka', note: 'Klasyk z nutą cytrusowego olejku bergamotki.' },
      ],
      ciasta: [
        { name: 'Sernik baskijski', status: 'available', note: '', photo_url: '/img/ciasto.jpg', photo_url2: '/img/ciastka.jpg', photo_url3: '/img/espresso.jpg' },
        { name: 'Brownie', status: 'low', note: 'zostały 2 kawałki', photo_url: '/img/ciastka.jpg' },
        { name: 'Chlebek bananowy', status: 'sold_out', note: 'będzie jutro rano' },
      ],
      menu: [
        { sekcja: 'Kawa', nazwa: 'Doppio', cena: '12 zł', sort: 10 },
        { sekcja: 'Kawa', nazwa: 'Flat white', cena: '17 zł', sort: 20 },
        { sekcja: 'Herbata i matcha', nazwa: 'Matcha latte', cena: '21 zł', sort: 10 },
        { sekcja: 'Śniadania', nazwa: 'Pęczak z hummusem', cena: '39 zł', dieta: 'vegan', sklad: 'Kasza pęczak, hummus, marchew, harissa.', sort: 10 },
      ],
      sklep: [
        { name: 'Matcha ceremonialna 30 g', price: '65 zł', opis: 'Japońska matcha w puszce. Ta sama, którą pijesz u nas.', available: true, photo_url: '/img/espresso.jpg' },
        { name: 'Kawa ziarnista 250 g', price: '54 zł', opis: 'Świeżo wypalona specialty do zaparzenia w domu.', available: true, photo_url: '/img/ciastka.jpg' },
        { name: 'Kubek Bruk', price: '49 zł', opis: 'Ceramiczny, robiony ręcznie.', available: false, photo_url: '/img/ciasto.jpg' },
      ],
      posts: [],
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

  // Sklep osobno: brak tabeli shop_items NIE może wywalić buildu (zostaje statyczny sklep).
  let sklep = null;
  const sr = await sb.from('shop_items').select('*').order('sort').order('created_at');
  if (!sr.error) sklep = sr.data || [];
  else console.log('shop_items niedostępne — zostaje statyczny sklep (' + sr.error.message + ')');

  // Blog osobno: brak tabeli posts NIE może wywalić buildu (zostaje bez bloga).
  let posts = null;
  const pr = await sb.from('posts').select('*').eq('status', 'published').order('published_at', { ascending: false });
  if (!pr.error) posts = pr.data || [];
  else console.log('posts niedostępne — blog pominięty (' + pr.error.message + ')');

  return { kawy: kawy || [], ciasta: ciasta || [], menu, sklep, posts };
}

// Na stronie pokazujemy tylko czoło listy — reszta czeka w panelu (wyszarzona).
// Te limity MUSZĄ być zgodne z admin/admin.js (LIMIT_KAWY / LIMIT_CIASTA).
const LIMIT_KAWY = 6;
const LIMIT_HERBATY = 6;
const LIMIT_CIASTA = 6;
const jestHerbata = (k) => (k.kind || 'kawa') === 'herbata';

// ── główny przebieg ─────────────────────────────────────────────
// llms.txt nie zależy od bazy — generujemy zawsze (świeża data, aktualne godziny).
if (!DEMO) {
  writeFileSync('llms.txt', llmsTxt('pl'));
  writeFileSync('en/llms.txt', llmsTxt('en'));
  console.log('✓ llms.txt + en/llms.txt');
}

const dane = await pobierz();
if (!dane) process.exit(0); // nic nie zmieniamy, deploy leci dalej z szablonem

// ── Lokalizacja zdjęć: pobierz z Supabase Storage RAZ przy buildzie i serwuj
// z Vercela (/img/db/). Odwiedzający nie uderzają w Storage → transfer Supabase
// spada praktycznie do zera (limit egress dotyczy właśnie tego). Błąd pobrania =
// zostaje oryginalny URL (miękka degradacja). Nazwy plików są unikalne (timestamp).
async function lokalizujZdjecia(d) {
  // sharp konwertuje do WebP (~5–10× mniej niż PNG); brak sharp = zapis oryginału
  let sharp = null;
  try { sharp = (await import('sharp')).default; } catch { console.warn('⚠ sharp niedostępny — zdjęcia bez konwersji WebP'); }
  const cache = new Map();
  let pobrane = 0, bajtyIn = 0, bajtyOut = 0;
  const loc = async (url) => {
    if (!url || !url.includes('.supabase.co/storage/')) return url;
    if (cache.has(url)) return cache.get(url);
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('http ' + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      const baza = url.split('/').pop().split('?')[0].replace(/\.[^.]+$/, '');
      mkdirSync('img/db', { recursive: true });
      let plik, out;
      if (sharp) {
        // szerokość do 1000 px (bez powiększania), WebP q80, alfa zachowana
        out = await sharp(buf).resize({ width: 1000, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
        plik = baza + '.webp';
      } else {
        out = buf; plik = url.split('/').pop().split('?')[0];
      }
      writeFileSync('img/db/' + plik, out);
      const p = '/img/db/' + plik;
      cache.set(url, p); pobrane++; bajtyIn += buf.length; bajtyOut += out.length;
      return p;
    } catch { cache.set(url, url); return url; }
  };
  for (const k of d.kawy || []) { k.photo_url = await loc(k.photo_url); k.photo_url2 = await loc(k.photo_url2); }
  for (const c of d.ciasta || []) { c.photo_url = await loc(c.photo_url); }
  for (const p of d.sklep || []) { p.photo_url = await loc(p.photo_url); }
  // blog: okładka + zdjęcia osadzone w treści wpisu (też z Supabase Storage)
  const locImgsWTresci = async (html) => {
    const urls = [...String(html || '').matchAll(/src="([^"]+\.supabase\.co\/storage\/[^"]+)"/g)].map((m) => m[1]);
    let out = html;
    for (const url of urls) { const n = await loc(url); if (n !== url) out = out.split(url).join(n); }
    return out;
  };
  for (const p of d.posts || []) { p.cover_url = await loc(p.cover_url); if (p.body_pl) p.body_pl = await locImgsWTresci(p.body_pl); }
  const mb = (b) => (b / 1048576).toFixed(1);
  console.log(`Zdjęcia zlokalizowane do /img/db/: ${pobrane}${bajtyOut ? ` (${mb(bajtyIn)} MB → ${mb(bajtyOut)} MB WebP)` : ''}`);
}
if (!DEMO) await lokalizujZdjecia(dane);
// Ta sama tabela coffees: rodzaj rozdziela kawy od herbat (kolejność wg sort z zapytania).
const kawy = dane.kawy.filter((k) => !jestHerbata(k)).slice(0, LIMIT_KAWY);
const herbaty = dane.kawy.filter(jestHerbata).slice(0, LIMIT_HERBATY);
const ciasta = dane.ciasta.slice(0, LIMIT_CIASTA);
const menu = dane.menu;  // null gdy brak tabeli → zostaje statyczne menu
const sklep = dane.sklep;  // null gdy brak tabeli → zostaje statyczny sklep

// tłumaczenia PL→EN (pusta mapa gdy brak DEEPL_KEY albo błąd → EN zostaje jak było)
const mapa = DEMO ? new Map() : await mapaTlumaczen(dane);
const tr = (s) => (s && mapa.get(s)) || s;
const przekladKawy = (k) => ({ ...k, note: tr(k.note), origin: tr(k.origin), method: tr(k.method), obrobka: tr(k.obrobka) });
function daneDlaJezyka(lang) {
  if (lang !== 'en' || !mapa.size) return { kawy, herbaty, ciasta, menu, sklep, tlumaczone: false };
  return {
    kawy: kawy.map(przekladKawy),
    herbaty: herbaty.map(przekladKawy),
    ciasta: ciasta.map((c) => ({ ...c, name: tr(c.name), note: tr(c.note) })),
    menu: menu ? menu.map((m) => ({ ...m, sekcja: tr(m.sekcja), nazwa: tr(m.nazwa), sklad: tr(m.sklad) })) : menu,
    sklep: sklep ? sklep.map((p) => ({ ...p, name: tr(p.name), opis: tr(p.opis) })) : sklep,
    tlumaczone: true,
  };
}

let plKawyHtml = '', plHerbatyHtml = '', plMenuHtml = null;  // kawy/herbaty/menu z PL — do porównania z żywą stroną
for (const [lang, t] of Object.entries(L)) {
  const dl = daneDlaJezyka(lang);
  let html = readFileSync(t.file, 'utf8');
  const kInner = dl.kawy.length ? dl.kawy.map((k) => kartaKawy(k, t)).join('\n') : pustaKarta(t.pustoKawy);
  // herbaty: gdy pusto — wstrzykujemy pustą listę (grupa chowa się po stronie JS)
  const hInner = dl.herbaty.length ? dl.herbaty.map((k) => kartaKawy(k, t)).join('\n') : '';
  const cInner = dl.ciasta.length ? dl.ciasta.map((c) => kartaCiasta(c, t)).join('\n') : pustaKarta(t.pustoCiasta);
  if (lang === 'pl') { plKawyHtml = kInner; plHerbatyHtml = hInner; plMenuHtml = (menu && menu.length) ? renderMenu(menu) : null; }
  html = podmienListe(html, 'data-kawy', kInner);
  html = podmienListe(html, 'data-herbaty', hInner);
  html = podmienListe(html, 'data-ciasta', cInner);
  html = podmienLd(html, jsonLd(dl.kawy, dl.herbaty, dl.ciasta));
  // menu: PL zawsze z bazy; EN tylko gdy mamy tłumaczenie (inaczej zostaje statyczne angielskie)
  const menuDoWstawienia = (lang === 'pl' || dl.tlumaczone) ? dl.menu : null;
  if (menuDoWstawienia && menuDoWstawienia.length) {
    html = podmienMenu(html, renderMenu(menuDoWstawienia));
    html = podmienMenuLd(html, menuLd(menuDoWstawienia));
  }
  // sklep: PL zawsze z bazy; EN tylko z tłumaczeniem (inaczej zostaje statyczny angielski)
  // Uwaga: NIE emitujemy Product/Offer JSON-LD — Bruk to kawiarnia, nie sklep
  // wysyłkowy; Google domagał się pól e-commerce (oceny, GTIN, wysyłka, zwroty),
  // których nie mamy i nie wolno ich udawać. Zostaje sama widoczna sekcja.
  const sklepDoWstawienia = (lang === 'pl' || dl.tlumaczone) ? dl.sklep : null;
  if (sklepDoWstawienia && sklepDoWstawienia.length) {
    html = podmienSklep(html, renderSklep(sklepDoWstawienia, t));
  }
  // mobilny odnośnik do najnowszego wpisu przed stopką (tylko PL — tam jest blog)
  if (lang === 'pl') html = podmienBlogMobi(html, blogMobi(dane.posts));
  writeFileSync(t.file, html);
  const info = menu && menu.length ? `, ${menu.length} poz. menu` : '';
  const tl = (lang === 'en' && dl.tlumaczone) ? ' + EN tłumaczone' : '';
  const hinfo = herbaty.length ? `, ${herbaty.length} herbat` : '';
  console.log(`✓ ${t.file}: ${kawy.length} kaw${hinfo}, ${ciasta.length}/${dane.ciasta.length} ciast${info}${tl}${DEMO ? ' (demo)' : ''}`);
}

// ── BLOG: publiczne strony z wpisów (PL; EN dołoży się, gdy pojawią się tłumaczenia) ──
const posts = (dane.posts || []).filter((p) => p.status === 'published' && p.slug && p.title_pl);
if (!DEMO) {
  mkdirSync('blog', { recursive: true });
  writeFileSync('blog/index.html', stronaListaBloga(posts));
  for (const p of posts) {
    mkdirSync('blog/' + p.slug, { recursive: true });
    writeFileSync(`blog/${p.slug}/index.html`, stronaWpisu(p));
  }
  writeFileSync('sitemap.xml', generujSitemap(posts));
  console.log(`✓ /blog/: ${posts.length} wpis(ów) + sitemap.xml`);
}

// Czy treść ważna dla GEO (KAWY lub MENU) zmieniła się względem żywej strony?
// Jeśli zmieniły się tylko ciasta, nie ma sensu pingować wyszukiwarek.
async function trescBezZmian(nowyKInner, nowyHInner, noweMenu) {
  try {
    const r = await fetch('https://bruk.cafe/');
    if (!r.ok) return false;                 // nie wiemy → dla bezpieczeństwa pinguj
    const live = await r.text();
    const mk = live.match(/<ul class="mlyn-strip" data-kawy>([\s\S]*?)<\/ul>/);
    if (!mk) return false;
    if (mk[1].trim() !== nowyKInner.trim()) return false;   // kawy się zmieniły
    const mh = live.match(/<ul class="mlyn-strip[^"]*" data-herbaty[^>]*>([\s\S]*?)<\/ul>/);
    if ((mh ? mh[1].trim() : '') !== nowyHInner.trim()) return false;  // herbaty się zmieniły
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
// Czy wszystkie opublikowane wpisy są już na żywej liście /blog/? Jeśli nie
// (nowy wpis albo pierwszy deploy bloga), to zmiana — trzeba pingować.
async function blogBezZmian(ps) {
  try {
    const r = await fetch('https://bruk.cafe/blog/');
    if (!r.ok) return false;
    const h = await r.text();
    for (const p of ps) { if (!h.includes(`/blog/${p.slug}/`)) return false; }
    return true;
  } catch { return false; }
}
if (!DEMO) {
  const bezZmianTresc = await trescBezZmian(plKawyHtml, plHerbatyHtml, plMenuHtml);
  const bezZmianBloga = await blogBezZmian(posts);
  if (bezZmianTresc && bezZmianBloga) {
    console.log('IndexNow: kawy, herbaty, menu i blog bez zmian — pomijam ping');
  } else try {
    const urlList = ['https://bruk.cafe/', 'https://bruk.cafe/en/', 'https://bruk.cafe/blog/',
      ...posts.map((p) => `https://bruk.cafe/blog/${p.slug}/`)].slice(0, 100);
    const r = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: 'bruk.cafe',
        key: INDEXNOW_KEY,
        keyLocation: `https://bruk.cafe/${INDEXNOW_KEY}.txt`,
        urlList,
      }),
    });
    console.log('IndexNow:', r.status, `(${urlList.length} URL)`);
  } catch (e) {
    console.log('IndexNow pominięty:', e.message);
  }
}
