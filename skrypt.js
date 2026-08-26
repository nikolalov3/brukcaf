/* Skrypty strony: pasek oferty oraz znak marki w nawigacji. */

/* 1. Pasek oferty na górze strony.
   Zasady:
   - pozycje oznaczone data-rola="zawsze" pojawiają się przy każdym wejściu,
   - data-rola="czasem" mniej więcej co drugie wejście,
   - reszta (nazwy kaw) jest tasowana, żeby kolejność nie była za każdym razem ta sama.
   W HTML zostaje statyczny zestaw domyślny — bez JS pasek nadal działa. */
(function () {
  var tasma = document.querySelector('.tasma');
  if (!tasma) return;

  var tor = tasma.querySelector('.tor');
  var zrodlo = tasma.querySelector('[data-pula]');
  if (!tor || !zrodlo) return;

  // zawartość <template> siedzi w osobnym fragmencie — szukamy w .content
  var korzen = zrodlo.content || zrodlo;
  var wszystkie = Array.prototype.slice.call(korzen.querySelectorAll('span'));
  var zawsze = [], czasem = [], tasowane = [];

  wszystkie.forEach(function (el) {
    var rola = el.getAttribute('data-rola');
    var tekst = el.textContent.trim();
    if (rola === 'zawsze') zawsze.push(tekst);
    else if (rola === 'czasem') czasem.push(tekst);
    else tasowane.push(tekst);
  });

  // Fisher–Yates
  for (var i = tasowane.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = tasowane[i]; tasowane[i] = tasowane[j]; tasowane[j] = t;
  }

  var hasla = tasowane.slice();

  czasem.forEach(function (tekst) {
    if (Math.random() < 0.5) hasla.push(tekst);
  });

  // pozycje obowiązkowe wchodzą w losowe miejsce, żeby nie zawsze kończyły pasek
  zawsze.forEach(function (tekst) {
    hasla.splice(Math.floor(Math.random() * (hasla.length + 1)), 0, tekst);
  });

  if (!hasla.length) return;

  // dwie kopie ciągu — animacja przesuwa się o 50% i wraca bez szwu
  var html = '';
  for (var k = 0; k < 2; k++) {
    hasla.forEach(function (tekst) {
      html += '<span>' + tekst + '</span><span>·</span>';
    });
  }
  tor.innerHTML = html;
})();

/* 2. Znak marki w pasku pojawia się dopiero po zjechaniu hero z ekranu,
   żeby nie dublować dużego logotypu.

   Świadomie NIE używamy tu IntersectionObserver z jednym progiem: przy
   przewijaniu w okolicy granicy przełącznik przeskakiwał tam i z powrotem
   kilka razy na sekundę i pasek migotał. Zamiast tego jest strefa martwa
   (histereza): znak wchodzi po przekroczeniu progu w dół, a znika dopiero
   po cofnięciu się o dodatkowe 90 px w górę. W środku tego pasa nic się
   nie zmienia, więc nie ma jak migać. */
(function () {
  var nawigacja = document.querySelector('.nawigacja');
  var znak = document.querySelector('.hero .znak');
  if (!nawigacja || !znak) return;

  var LUZ = 90;      // szerokość strefy martwej w pikselach
  var prog = 0;
  var wlaczony = false;
  var czeka = false;

  function przelicz() {
    var r = znak.getBoundingClientRect();
    prog = r.bottom + window.pageYOffset - nawigacja.offsetHeight;
  }

  function sprawdz() {
    var y = window.pageYOffset;
    if (!wlaczony && y > prog) {
      wlaczony = true;
      nawigacja.classList.add('po-hero');
    } else if (wlaczony && y < prog - LUZ) {
      wlaczony = false;
      nawigacja.classList.remove('po-hero');
    }
    czeka = false;
  }

  function przyPrzewijaniu() {
    if (czeka) return;
    czeka = true;
    requestAnimationFrame(sprawdz);
  }

  przelicz();
  sprawdz();
  window.addEventListener('scroll', przyPrzewijaniu, { passive: true });
  window.addEventListener('resize', function () { przelicz(); sprawdz(); });
  // logo to obrazek — po jego wczytaniu wysokość hero może się zmienić
  if (!znak.complete) znak.addEventListener('load', function () { przelicz(); sprawdz(); });
})();

/* 3. Przewijanie do kotwic: dłuższe i łagodniejsze niż systemowe.
   CSS zostawia scroll-behavior:smooth jako zachowanie bez JS, tutaj
   przejmujemy kliknięcia i prowadzimy je własną krzywą. */
(function () {
  var ruchOgraniczony = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!('requestAnimationFrame' in window)) return;

  function docelowe(hasz) {
    if (!hasz || hasz === '#') return null;
    try { return document.querySelector(hasz); } catch (e) { return null; }
  }

  // łagodne wejście i wyjście, bez gwałtownego startu
  function krzywa(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function przewin(doY, czas) {
    var startY = window.pageYOffset;
    var dystans = doY - startY;
    var start = null;

    function krok(teraz) {
      if (start === null) start = teraz;
      var post = Math.min((teraz - start) / czas, 1);
      window.scrollTo(0, startY + dystans * krzywa(post));
      if (post < 1) requestAnimationFrame(krok);
    }
    requestAnimationFrame(krok);
  }

  document.addEventListener('click', function (e) {
    var link = e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!link) return;

    var cel = docelowe(link.getAttribute('href'));
    if (!cel) return;

    e.preventDefault();

    var odstep = parseFloat(getComputedStyle(cel).scrollMarginTop) || 0;
    var doY = cel.getBoundingClientRect().top + window.pageYOffset - odstep;
    doY = Math.max(0, Math.min(doY, document.body.scrollHeight - window.innerHeight));

    if (ruchOgraniczony.matches) {
      window.scrollTo(0, doY);
    } else {
      // dłuższa droga to dłuższy czas, ale w rozsądnych widełkach
      var czas = Math.min(2200, Math.max(1300, Math.abs(doY - window.pageYOffset)));
      przewin(doY, czas);
    }

    if (history.replaceState) history.replaceState(null, '', link.getAttribute('href'));
  });
})();

/* 4. Zmiana języka nie gubi miejsca na stronie.
   Obie wersje mają te same identyfikatory sekcji, więc do adresu drugiej
   wersji doklejamy tę, którą użytkownik ma akurat pod paskiem nawigacji.
   Bez tego przełącznik zawsze wyrzucał na samą górę, co przy długiej
   karcie oznaczało przewijanie od nowa. */
(function () {
  var przelacznik = document.querySelector('.jezyk');
  if (!przelacznik) return;

  var nawigacja = document.querySelector('.nawigacja');

  function widocznaSekcja() {
    var linia = window.pageYOffset + (nawigacja ? nawigacja.offsetHeight : 0) + 8;
    var sekcje = document.querySelectorAll('main [id], footer[id]');
    var trafiona = null;

    for (var i = 0; i < sekcje.length; i++) {
      if (sekcje[i].getBoundingClientRect().top + window.pageYOffset <= linia) {
        trafiona = sekcje[i].id;
      }
    }
    return trafiona;
  }

  przelacznik.addEventListener('click', function () {
    var id = widocznaSekcja();
    var adres = przelacznik.getAttribute('href').split('#')[0];
    przelacznik.setAttribute('href', id ? adres + '#' + id : adres);
  });
})();

/* 5. Kolaż: kadry podmieniają się w spokojnym, równym rytmie.

   Jeden wspólny zegar zamiast pięciu osobnych. Wcześniej każdy kafel miał
   własny licznik i zdarzało się, że dwa zmieniały się tuż po sobie, a potem
   przez pół minuty nie działo się nic. Teraz co kilkanaście sekund zmienia
   się dokładnie jeden kafel, nigdy dwa razy ten sam pod rząd.

   Zajętość trzymamy we własnej tablicy, nie odczytujemy jej z DOM: w trakcie
   przenikania kafel ma przez chwilę dwa obrazki i odczyt zwracał ten stary,
   przez co inny kafel mógł sięgnąć po zdjęcie już wchodzące gdzie indziej.

   Zdjęcie z atrybutem data-kafel trafia wyłącznie do kafla o tym numerze.
   Przy włączonej redukcji ruchu podmiana nie startuje. */
(function () {
  var kolaz = document.querySelector('.kolaz');
  if (!kolaz) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var zrodlo = kolaz.querySelector('template[data-zdjecia]');
  if (!zrodlo) return;

  var pula = Array.prototype.map.call(
    (zrodlo.content || zrodlo).querySelectorAll('img'),
    function (el) {
      var tylko = el.getAttribute('data-kafel');
      return {
        src: el.getAttribute('data-src'),
        alt: el.getAttribute('data-alt'),
        tylko: tylko === null ? null : parseInt(tylko, 10)
      };
    });

  var kafle = Array.prototype.slice.call(kolaz.querySelectorAll('.kafel'));
  if (pula.length <= kafle.length) return;

  var stan = kafle.map(function (k) {
    var i = k.querySelector('img');
    return i ? i.getAttribute('src') : null;
  });
  var wtrakcie = kafle.map(function () { return false; });
  var ostatni = -1;

  function kandydaci(nr) {
    return pula.filter(function (z) {
      if (z.tylko !== null && z.tylko !== nr) return false;   // przypisane do innego kafla
      return stan.indexOf(z.src) === -1;                      // i jeszcze nigdzie nie wisi
    });
  }

  function podmien(nr) {
    if (wtrakcie[nr]) return false;

    var wolne = kandydaci(nr);
    if (!wolne.length) return false;

    var wybor = wolne[Math.floor(Math.random() * wolne.length)];
    var kafel = kafle[nr];
    var stary = kafel.querySelector('img');

    stan[nr] = wybor.src;      // rezerwacja przed wczytaniem
    wtrakcie[nr] = true;

    var nowy = new Image();
    nowy.alt = wybor.alt;
    nowy.decoding = 'async';
    nowy.className = 'znika';
    nowy.src = wybor.src;
    kafel.appendChild(nowy);

    function pokaz() {
      requestAnimationFrame(function () {
        nowy.classList.remove('znika');
        if (stary) stary.classList.add('znika');
        setTimeout(function () {
          if (stary && stary.parentNode) stary.parentNode.removeChild(stary);
          wtrakcie[nr] = false;
        }, 1500);
      });
    }

    if (nowy.complete) pokaz();
    else {
      nowy.onload = pokaz;
      nowy.onerror = function () {
        if (nowy.parentNode) nowy.parentNode.removeChild(nowy);
        stan[nr] = stary ? stary.getAttribute('src') : null;
        wtrakcie[nr] = false;
      };
    }
    return true;
  }

  function tura() {
    // kolejność losowa, ale bez powtórzenia poprzedniego kafla
    var do_sprawdzenia = [];
    for (var i = 0; i < kafle.length; i++) if (i !== ostatni) do_sprawdzenia.push(i);
    for (var j = do_sprawdzenia.length - 1; j > 0; j--) {
      var l = Math.floor(Math.random() * (j + 1));
      var t = do_sprawdzenia[j]; do_sprawdzenia[j] = do_sprawdzenia[l]; do_sprawdzenia[l] = t;
    }

    for (var k = 0; k < do_sprawdzenia.length; k++) {
      if (podmien(do_sprawdzenia[k])) { ostatni = do_sprawdzenia[k]; break; }
    }

    setTimeout(tura, 9000 + Math.random() * 3000);   // 9 do 12 sekund
  }

  setTimeout(tura, 6000);
})();

/* 6. Hasło do Wi-Fi w nawigacji.
   Okienko otwiera ikona, hasło kopiuje się jednym kliknięciem.
   Nowoczesne przeglądarki mają navigator.clipboard, ale działa on tylko
   w bezpiecznym kontekście, więc jest zapasowa droga przez pole tekstowe. */
(function () {
  var oprawa = document.querySelector('.wifi');
  if (!oprawa) return;

  var ikona = oprawa.querySelector('.wifi-ikona');
  var panel = oprawa.querySelector('.wifi-panel');
  var kopiuj = oprawa.querySelector('.wifi-kopiuj');
  var zamknij = oprawa.querySelector('.wifi-zamknij');
  // hasło trzymamy w atrybucie panelu, nie w widocznej treści
  var haslo = panel.getAttribute('data-haslo') || '';
  if (!ikona || !panel || !kopiuj || !haslo) return;

  var etykietaKopiuj = panel.getAttribute('data-kopiuj') || 'Kopiuj';
  var etykietaGotowe = panel.getAttribute('data-skopiowano') || 'Skopiowane';
  var licznik = null;

  function pokaz(czy) {
    panel.hidden = !czy;
    ikona.setAttribute('aria-expanded', czy ? 'true' : 'false');
    if (czy) kopiuj.focus();
  }

  function doSchowka(tekst) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(tekst);
    }
    return new Promise(function (ok, blad) {
      var pole = document.createElement('textarea');
      pole.value = tekst;
      pole.setAttribute('readonly', '');
      pole.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      document.body.appendChild(pole);
      pole.select();
      pole.setSelectionRange(0, tekst.length);   // iOS bywa uparty
      var udalo = false;
      try { udalo = document.execCommand('copy'); } catch (e) { udalo = false; }
      document.body.removeChild(pole);
      udalo ? ok() : blad();
    });
  }

  ikona.addEventListener('click', function () { pokaz(panel.hidden); });
  if (zamknij) zamknij.addEventListener('click', function () { pokaz(false); ikona.focus(); });

  kopiuj.addEventListener('click', function () {
    doSchowka(haslo).then(function () {
      kopiuj.textContent = etykietaGotowe;
      kopiuj.classList.add('gotowe');
      clearTimeout(licznik);
      licznik = setTimeout(function () {
        kopiuj.textContent = etykietaKopiuj;
        kopiuj.classList.remove('gotowe');
      }, 2200);
    }, function () {
      // schowek zablokowany: pokazujemy hasło, żeby dało się je przepisać
      var awaryjne = panel.querySelector('.wifi-awaryjne');
      if (!awaryjne) {
        awaryjne = document.createElement('p');
        awaryjne.className = 'wifi-awaryjne';
        panel.insertBefore(awaryjne, kopiuj);
      }
      awaryjne.textContent = haslo;
    });
  });

  document.addEventListener('click', function (e) {
    if (!panel.hidden && !oprawa.contains(e.target)) pokaz(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !panel.hidden) { pokaz(false); ikona.focus(); }
  });
})();

/* Dwa zdjęcia kawy: na desktopie zmiana po najechaniu (CSS :hover),
   a na urządzeniach dotykowych automatyczny cykl co 4,4 s — kaskadowo
   od pierwszej karty do ostatniej i w pętlę. */
(function () {
  if (!window.matchMedia || !matchMedia('(hover: none)').matches) return;
  var karty = Array.prototype.filter.call(
    document.querySelectorAll('.mlyn-karta'),
    function (k) { return k.querySelector('.karta-foto2'); }
  );
  if (!karty.length) return;
  var i = 0;
  setInterval(function () {
    karty[i % karty.length].classList.toggle('pokaz2');
    i++;
  }, 4400);
})();

/* Opis kawy: gdy treść jest dłuższa niż widoczny obszar, oznacz go klasą
   .przewijalny — CSS doda wtedy delikatne wygaszenie u dołu (sygnał, że jest
   więcej), bez brzydkiego paska scrolla. Gdy opis doscrollowany do samego dołu,
   dokładamy .na-dole i wygaszenie znika (nie ma już czego zapowiadać). */
(function () {
  function stan(o) {
    o.classList.toggle('przewijalny', o.scrollHeight > o.clientHeight + 2);
    o.classList.toggle('na-dole', o.scrollTop + o.clientHeight >= o.scrollHeight - 2);
  }
  function oznacz() {
    document.querySelectorAll('.karta-op').forEach(function (o) {
      stan(o);
      if (!o.dataset.podpiety) {
        o.addEventListener('scroll', function () { stan(o); });
        o.dataset.podpiety = '1';
      }
    });
  }
  if (document.readyState !== 'loading') oznacz();
  else document.addEventListener('DOMContentLoaded', oznacz);
  window.addEventListener('resize', oznacz);
})();

/* Wypieki jako story w telefonowym oknie: klik w kafel otwiera zdjęcia danego
   ciasta jako slajdy (paski postępu, auto 4 s, tap lewo/prawo). Po ostatnim
   zdjęciu przechodzi do kolejnego ciasta (jak Instagram). */
(function () {
  var kafle = Array.prototype.slice.call(document.querySelectorAll('.mlyn-strip.ciasta .ciasto-kafel.klik'));
  if (!kafle.length) return;

  var ciasta = kafle.map(function (k) {
    var fotki = [];
    try { fotki = JSON.parse(k.getAttribute('data-fotki') || '[]'); } catch (e) { fotki = []; }
    var zn = k.querySelector('.stan-znak');
    return {
      fotki: fotki,
      nazwa: (k.querySelector('.ciasto-nz') || {}).textContent || '',
      status: zn ? zn.textContent : '',
      statusKl: zn ? zn.className.replace('stan-znak', '').trim() : '',
      notka: (k.querySelector('.ciasto-notka') || {}).textContent || ''
    };
  });

  var CZAS = 4000;
  var box = document.createElement('div');
  box.className = 'stories';
  box.style.setProperty('--czas', (CZAS / 1000) + 's');
  box.innerHTML =
    '<div class="stories-okno">' +
      '<div class="stories-scena"></div>' +
      '<div class="stories-paski"></div>' +
      '<button class="stories-zamknij" aria-label="Zamknij">×</button>' +
      '<div class="stories-nawig"><span data-prev></span><span data-next></span></div>' +
      '<div class="stories-tresc">' +
        '<div class="stories-nz"></div>' +
        '<span class="stan-znak"></span>' +
        '<div class="stories-notka"></div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(box);

  var scena = box.querySelector('.stories-scena');
  var paski = box.querySelector('.stories-paski');
  var nz = box.querySelector('.stories-nz');
  var znak = box.querySelector('.stan-znak');
  var notka = box.querySelector('.stories-notka');
  var iC = 0, iF = 0, timer = null;

  function rysujPaski(n, akt) {
    var h = '';
    for (var k = 0; k < n; k++) {
      var kl = k < akt ? 'zrobiony' : (k === akt ? 'trwa' : '');
      h += '<div class="stories-pasek ' + kl + '"><i></i></div>';
    }
    paski.innerHTML = h;
  }

  function pokaz(ic, if_) {
    if (ic < 0) { ic = 0; if_ = 0; }
    while (ic < ciasta.length && if_ >= ciasta[ic].fotki.length) { ic++; if_ = 0; }
    if (ic >= ciasta.length) { zamknij(); return; }
    if (if_ < 0) {
      if (ic === 0) if_ = 0;
      else { ic--; if_ = ciasta[ic].fotki.length - 1; }
    }
    var c = ciasta[ic];
    iC = ic; iF = if_;
    scena.style.backgroundImage = c.fotki[iF] ? 'url("' + c.fotki[iF] + '")' : '';
    nz.textContent = c.nazwa;
    znak.textContent = c.status;
    znak.className = 'stan-znak ' + c.statusKl;
    znak.style.display = c.status ? '' : 'none';
    notka.textContent = c.notka;
    rysujPaski(c.fotki.length, iF);
    clearTimeout(timer);
    timer = setTimeout(function () { pokaz(iC, iF + 1); }, CZAS);
  }

  function otworz(ic) { box.classList.add('otwarte'); document.body.style.overflow = 'hidden'; pokaz(ic, 0); }
  function zamknij() { clearTimeout(timer); box.classList.remove('otwarte'); document.body.style.overflow = ''; }

  kafle.forEach(function (k, idx) {
    k.addEventListener('click', function () { otworz(idx); });
    k.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); otworz(idx); } });
  });
  box.querySelector('.stories-zamknij').addEventListener('click', zamknij);
  box.querySelector('[data-next]').addEventListener('click', function () { pokaz(iC, iF + 1); });
  box.querySelector('[data-prev]').addEventListener('click', function () { pokaz(iC, iF - 1); });
  box.addEventListener('click', function (e) { if (e.target === box) zamknij(); });
  document.addEventListener('keydown', function (e) {
    if (!box.classList.contains('otwarte')) return;
    if (e.key === 'Escape') zamknij();
    else if (e.key === 'ArrowRight') pokaz(iC, iF + 1);
    else if (e.key === 'ArrowLeft') pokaz(iC, iF - 1);
  });
})();

/* Młynek: przełącznik Kawa / Herbata.
   Herbata pojawia się dopiero, gdy Filip doda herbaty w panelu — wtedy napis
   "Kawa" zamienia się w segment Kawa|Herbata i przełącza widoczny pasek. */
(function () {
  const grupa = document.querySelector('.mlyn-napoje');
  if (!grupa) return;
  const kawy = grupa.querySelector('[data-kawy]');
  const herb = grupa.querySelector('[data-herbaty]');
  const przel = grupa.querySelector('.mlyn-przelacz');
  const label = grupa.querySelector('[data-tylko-kawa]');
  const maHerbaty = herb && herb.querySelector('.mlyn-karta');
  if (!maHerbaty) { if (herb) herb.hidden = true; return; }  // brak herbat → jak dotąd

  if (label) label.hidden = true;
  if (przel) przel.hidden = false;
  const taby = [...przel.querySelectorAll('.mlyn-tab')];
  function pokaz(cel) {
    kawy.hidden = cel !== 'kawy';
    herb.hidden = cel !== 'herbaty';
    taby.forEach((t) => {
      const on = t.dataset.cel === cel;
      t.classList.toggle('aktywny', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }
  taby.forEach((t) => t.addEventListener('click', () => pokaz(t.dataset.cel)));
  pokaz('kawy');
})();
