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
      var czas = Math.min(1100, Math.max(650, Math.abs(doY - window.pageYOffset) * 0.5));
      przewin(doY, czas);
    }

    if (history.replaceState) history.replaceState(null, '', link.getAttribute('href'));
  });
})();
