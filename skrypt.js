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
   żeby nie dublować dużego logotypu. Obserwujemy sam znak w hero. */
(function () {
  var nawigacja = document.querySelector('.nawigacja');
  var znak = document.querySelector('.hero .znak');
  if (!nawigacja || !znak) return;

  // brak obserwatora: pokazujemy znak na stałe, zamiast chować go na zawsze
  if (!('IntersectionObserver' in window)) {
    nawigacja.classList.add('po-hero');
    return;
  }

  var obs = new IntersectionObserver(function (wpisy) {
    nawigacja.classList.toggle('po-hero', !wpisy[0].isIntersecting);
  }, { rootMargin: '-56px 0px 0px 0px', threshold: 0 });

  obs.observe(znak);
})();
