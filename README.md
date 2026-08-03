# Bruk Cafe

Strona kawiarni Bruk Cafe, ul. Krótka 1, Kleparz, Kraków.

Statyczny HTML, CSS i jeden plik JS. Brak kroku budowania, brak zależności.

## Struktura

```
index.html      wersja polska (kanoniczna)
en/index.html   wersja angielska
style.css       arkusz wspólny dla obu wersji
skrypt.js       pasek oferty + znak marki w nawigacji
img/logo.png    logotyp
robots.txt
sitemap.xml
```

## Uruchomienie lokalnie

```
python3 -m http.server 4321
```

## Wdrożenie

Vercel, projekt bez frameworka. Katalog wyjściowy to korzeń repozytorium.
Domena kanoniczna `bruk.cafe`, `brukcafe.pl` przekierowana na nią kodem 301.

## Do dokończenia

- zdjęcia do kolażu w sekcji „Lokal" oraz ścieżki `image` w danych strukturalnych
- logo w formacie SVG zamiast PNG
- potwierdzenie godzin niedzielnych (Instagram i Facebook podają różne)
- fonty do zhostowania lokalnie zamiast z Google Fonts
- polityka prywatności
- identyfikator wizytówki Google w `sameAs`
