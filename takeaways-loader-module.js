/**
 * WinFuture – Takeaways-Leiste (Loader-Modul, produktiv)
 * ------------------------------------------------------
 * Voraussetzungen:
 *  - Template rendert bei has_summary die Leiste #takeaways_bar direkt nach
 *    dem Content-Werbeslot (Kopfzeile komplett, Body leer mit height:0).
 *  - Styles liegen in der zentralen CSS-Datei (takeaways.css).
 *  - Die bisherige .summary_box bleibt unverändert im Artikel-HTML,
 *    der Redaktionsablauf ändert sich nicht.
 *
 * Aufgaben des Moduls:
 *  1. Bullets aus der .summary_box in die Leiste übernehmen (textContent,
 *     dadurch XSS-sicher und encoding-neutral)
 *  2. Alte Box (+ direkt folgenden <br>) entfernen – sofort beim Laden,
 *     solange sie unterhalb des Viewports liegt (dadurch CLS-neutral)
 *  3. Button aktivieren, Höhenanimation und Zeichen-Ticker verdrahten
 *
 * Fehlerverhalten: fehlt die Leiste -> nichts tun (Artikel ohne Zusammen-
 * fassung oder alte Cache-Version). Fehlt trotz Leiste die Box -> Leiste
 * entfernen (besser ein einmaliger Shift als ein dauerhaft toter Button).
 */
(() => {
  'use strict';

  const SPEED = {
    charDelay: 5,     // ms pro Zeichen
    lineStagger: 110, // ms Versatz pro Zeile
  };

  function init() {
    const bar = document.getElementById('takeaways_bar');
    if (!bar || bar.dataset.ready) return;

    const oldBox = document.querySelector('.summary_box');
    const items = oldBox
      ? [...oldBox.querySelectorAll('li')].map(li => li.textContent.trim()).filter(Boolean)
      : [];

    if (!items.length) { bar.remove(); return; }

    const head   = bar.querySelector('.takeaways_head');
    const body   = bar.querySelector('.takeaways_body');
    const ul     = body.querySelector('ul');
    const toggle = bar.querySelector('.takeaways_toggle');
    if (!head || !body || !ul || !toggle) return;

    const labelShow = toggle.textContent;
    const labelHide = toggle.dataset.hide || 'Ausblenden';
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    // 1) Bullets übernehmen
    for (const t of items) {
      const li = document.createElement('li');
      li.textContent = t;
      ul.appendChild(li);
    }

    // 2) Alte Box + direkt folgenden <br> entfernen
    const nx = oldBox.nextElementSibling;
    if (nx && nx.tagName === 'BR') nx.remove();
    oldBox.remove();

    /* ---- Zeichen-Ticker: Spans erst beim ersten Öffnen bauen ---- */
    let tickerBuilt = false;
    function buildTicker() {
      if (tickerBuilt || reduceMotion) return;
      tickerBuilt = true;
      [...ul.children].forEach((li, lineIdx) => {
        const text = li.textContent;
        li.textContent = '';
        const lineStart = lineIdx * SPEED.lineStagger;
        let c = 0;
        for (const part of text.split(/(s+)/)) {
          if (!part) continue;
          if (/^s+$/.test(part)) { li.appendChild(document.createTextNode(' ')); continue; }
          const w = document.createElement('span'); // hält Wörter beim Umbruch zusammen
          w.className = 'takeaways_w';
          for (const ch of part) {
            const s = document.createElement('span');
            s.className = 'takeaways_ch';
            s.textContent = ch;
            s.style.transitionDelay = (lineStart + c++ * SPEED.charDelay) + 'ms';
            w.appendChild(s);
          }
          li.appendChild(w);
        }
      });
    }

    /* ---- Auf-/Zuklappen: race-sicher über EINEN persistenten Handler ----
       "after" hält immer nur den Abschluss-Schritt der AKTUELLEN Animation;
       jeder neue Klick überschreibt ihn. Verhindert, dass veraltete
       transitionend-Handler die Höhe nachträglich verstellen.            */
    let open = false;
    let after = null;
    body.addEventListener('transitionend', (e) => {
      if (e.target !== body || e.propertyName !== 'height') return;
      const fn = after; after = null;
      if (fn) fn();
    });

    function expand() {
      if (open) return; open = true;
      buildTicker();
      head.setAttribute('aria-expanded', 'true');
      toggle.textContent = labelHide;

      bar.classList.remove('takeaways_noanim'); // Ticker (wieder) scharf schalten
      void body.offsetHeight;
      bar.classList.add('takeaways_open');      // startet den Zeilen-Ticker

      // >>> Analytics-Hook: Öffnungsrate messen, z. B.:
      // window._paq?.push(['trackEvent', 'Takeaways', 'open', location.pathname]);

      if (reduceMotion) { body.style.height = 'auto'; after = null; return; }
      body.style.height = body.scrollHeight + 'px'; // animiert ab aktueller Höhe
      after = () => { if (open) body.style.height = 'auto'; };
    }

    function collapse() {
      if (!open) return; open = false;
      head.setAttribute('aria-expanded', 'false');
      toggle.textContent = labelShow;

      bar.classList.add('takeaways_noanim');    // kein Rückwärts-Ticker
      if (body.style.height === 'auto') {       // von 'auto' aus keine Transition möglich
        body.style.height = body.scrollHeight + 'px';
        void body.offsetHeight;
      }
      bar.classList.remove('takeaways_open');

      if (reduceMotion) { body.style.height = '0'; after = null; return; }
      body.style.height = '0';
      after = null;
    }

    head.addEventListener('click', () => (open ? collapse() : expand()));

    // 3) Leiste scharf schalten
    head.disabled = false;
    bar.dataset.ready = '1';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
