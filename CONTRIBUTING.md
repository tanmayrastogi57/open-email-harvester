# Contributing

Thanks for helping!

1. Fork and clone, then `npm ci`.
2. Make changes. Keep the product **site-agnostic**: never hardcode specific websites, API keys, or personal data.
3. Run `npm run lint`, `npm test` and `npm run lint:ext` — all must pass.
4. Add tests for new extraction patterns in `test/extractor.test.js` (use `example.com`-style domains only).
5. Open a pull request describing the change.

Privacy rules: no telemetry, no remote calls from the extension except the user-configured **localhost** bridge, and no runtime dependencies in `server/` unless strictly necessary.

Please be respectful and only use this tool on data you're allowed to collect, in line with applicable laws (GDPR, CAN-SPAM, etc.) and site terms.
