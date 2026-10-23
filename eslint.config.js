'use strict';
const globals = require('globals');
const js = require('@eslint/js');
module.exports = [
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  { files: ['**/*.js'], languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: Object.assign({}, globals.browser, globals.node, globals.webextensions) } },
];
