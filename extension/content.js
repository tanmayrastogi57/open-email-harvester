/* Injected on demand. Collects a page snapshot and returns it; never sends data anywhere itself. */
(function () {
  const links = [...document.querySelectorAll('a[href]')].map((a) => a.href).slice(0, 5000);
  const html = document.documentElement.outerHTML.slice(0, 2000000);
  const text = (document.body ? document.body.innerText : '').slice(0, 1000000);
  return { url: location.href, title: document.title, text, html, links };
})();
