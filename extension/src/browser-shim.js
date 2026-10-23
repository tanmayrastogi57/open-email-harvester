/* Minimal cross-browser shim: Firefox exposes `browser` (promises), Chromium exposes `chrome` (MV3 promises). */
(function (root) {
  if (typeof root.browser === 'undefined' && typeof root.chrome !== 'undefined') root.browser = root.chrome;
})(typeof globalThis !== 'undefined' ? globalThis : this);
