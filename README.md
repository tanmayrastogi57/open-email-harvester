# Open Email Harvester

**Privacy-first contact extractor for any website, any browser, and any AI.**

Scan a page to pull out emails (obfuscated ones too), phone numbers, social/profile links, names, the page title, the source URL and the company domain. Your contacts stay in your browser. If you want an AI assistant to work with them, connect it through **MCP** or a localhost **REST/OpenAPI** bridge.

> CI workflow: [`ci/github-actions-ci.yml`](ci/github-actions-ci.yml). Copy it to `.github/workflows/ci.yml` to enable GitHub Actions (lint + tests on Node 18/20/22 + web-ext lint).

## Why it's different

| | |
|---|---|
| 🔒 **Privacy-first, local-only** | Contacts live in `browser.storage.local` or a local JSON file. It has no telemetry, no analytics and no cloud backend, and it needs no API keys. |
| 🌐 **Works on any site** | Nothing is tied to a particular website. It uses `activeTab` when you click Scan. Auto-scan only runs if you turn it on and grant the optional all-sites permission. |
| 🧭 **Works in any browser** | One Manifest V3 build runs in Chrome, Edge, Brave, Opera, Vivaldi and Firefox (128+). A small `browser`/`chrome` shim handles the differences. |
| 🤖 **Works with any AI** | A built-in **MCP server** covers Claude Desktop, Cursor, ChatGPT connectors and other MCP clients. A **REST bridge with an OpenAPI spec** covers everything else: custom GPT actions, LangChain, n8n, scripts. |
| 🕵️ **Catches obfuscated emails** | It finds `name [at] domain [dot] com`, `(at)/(dot)`, `AT/DOT`, `{at}`, HTML entities (`&#64;`, `&#x40;`, `&commat;`), `%40`, and `mailto:`/`tel:` links. |

## Features
- **Scan** the current page with a click or **Alt+Shift+E**, or turn on **auto-scan**.
- **Extracts** emails, phones, social links (GitHub, X/Twitter, Facebook, Instagram, YouTube, Mastodon, Bluesky and more), guessed names, page title, source URL and domain/company.
- **Validity hints that work offline:** each email is checked for syntax, matched against a disposable-domain list and flagged if it's a role account (`info@`, `support@` and so on). These checks make no network calls.
- **Manage your list:** duplicates are merged automatically. You can add tags and notes, search everything (or type `#tag` to filter by tag), filter by type and group by domain.
- **Export/import** as CSV or JSON, or **clear** everything.
- **Optional sync** to the local bridge. It's off by default and only accepts localhost URLs.

## Repository layout
```
extension/   MV3 extension (popup, options, background, content, src/ shared logic)
server/      mcp.js (MCP stdio server), bridge.js (REST), openapi.yaml, db.js
test/        node:test unit tests
```

## Install the extension

First, download `open-email-harvester-extension-v1.0.0.zip` from [Releases](https://github.com/tanmayrastogi57/open-email-harvester/releases) and unzip it, or clone this repo and use the `extension/` folder.

### Chrome / Brave / Opera / Vivaldi
1. Open `chrome://extensions` (`brave://extensions`, `opera://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select the `extension/` folder.

### Microsoft Edge
1. Open `edge://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select `extension/`.

### Firefox (128+)
- **To try it temporarily:** open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…** and pick `extension/manifest.json`.
- **To install it permanently:** sign it with `npx web-ext sign --source-dir extension` using your own AMO credentials, or install it in Developer Edition/Nightly with `xpinstall.signatures.required=false`.

### Using it
1. Open any page and click the toolbar icon, then **Scan this page**.
2. To scan pages as they load, open **Settings**, turn on **Auto-scan** and accept the optional permission.

## Connect an AI

You'll need Node 18 or newer. Clone the repo; the server has no runtime dependencies:
```bash
git clone https://github.com/tanmayrastogi57/open-email-harvester && cd open-email-harvester
```
By default, data is stored in `~/.open-email-harvester/contacts.json`. To change that, set `OEH_DATA`.

### MCP tools
| Tool | What it does |
|---|---|
| `list_contacts` | List contacts. Filter by `query`, `tag`, `type` or `domain`. |
| `search_contacts` | Full-text search |
| `add_contacts` | Add contacts (duplicates are merged) |
| `tag_contact` | Add tags or notes to a contact |
| `remove_contact` | Delete a contact |
| `extract_from_text` | Run the extractor on text or HTML the AI provides, optionally saving the results |
| `validate_email` | Offline validity hint |
| `list_domains` | Number of contacts per domain |
| `export_contacts` | Export as CSV or JSON |

### Claude Desktop
Edit `claude_desktop_config.json`. It's in `~/Library/Application Support/Claude/` on macOS and `%APPDATA%\Claude\` on Windows:
```json
{ "mcpServers": { "open-email-harvester": { "command": "node", "args": ["/ABS/PATH/open-email-harvester/server/mcp.js"] } } }
```
Restart Claude Desktop.

### Cursor
Add the same block to `~/.cursor/mcp.json`, or to `.cursor/mcp.json` in a project.

### VS Code (Copilot), Windsurf, Cline, Continue, Zed and other MCP clients
Use stdio transport with the command `node /ABS/PATH/server/mcp.js`.

### ChatGPT, custom GPTs, Gemini, local LLMs and other non-MCP tools
1. Start the bridge:
   ```bash
   node server/bridge.js            # http://127.0.0.1:8765
   OEH_TOKEN=choose-a-secret node server/bridge.js   # optional bearer token
   ```
2. Point your tool at the spec: `http://127.0.0.1:8765/openapi.yaml` (the same file is at [`server/openapi.yaml`](server/openapi.yaml)).
   - **Custom GPT actions:** these need a public HTTPS URL. If you want that, expose the bridge yourself through a tunnel and **set `OEH_TOKEN`**.
   - **Ollama, LM Studio, LangChain, n8n and scripts:** call the REST endpoints directly.

### Syncing the extension to the bridge
Open extension **Settings**, turn on **Sync**, keep the URL as `http://127.0.0.1:8765` and enter the token if you set one. New scans are then sent to the bridge, so your AI sees them. The **Sync** button in the popup pushes everything you've already saved.

### REST quick reference
```
GET    /health
GET    /contacts?query=&tag=&type=email|phone|social&domain=
POST   /contacts                 body: contact or [contacts]
PATCH  /contacts/{id}            body: {tags:[], notes:""}
DELETE /contacts/{id}  |  DELETE /contacts
GET    /domains
GET    /export?format=csv|json
POST   /extract                  body: {text, html, url, title, links[], save}
GET    /validate?email=
```
Example:
```bash
curl -s -X POST localhost:8765/extract -H 'content-type: application/json' \
  -d '{"text":"jane [at] example [dot] com, +1 555 010 0199","save":true}'
```

## Development
```bash
npm ci
npm test          # unit tests (node:test)
npm run lint      # eslint
npm run lint:ext  # web-ext lint
npm run package   # builds dist/*.zip
```

## Responsible use
Only collect contact data you're allowed to process, and follow privacy and anti-spam laws (GDPR, CAN-SPAM, etc.) and each site's terms. The tool doesn't get around logins or paywalls. It only reads pages you have open.

## License
[MIT](LICENSE)
