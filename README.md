# OpenPanel

OpenPanel is a private, browser-native spectral flow cytometry panel builder for:

- Cytek Aurora
- BD FACSDiscover
- Sony ID7000
- Thermo Fisher Attune Xenith

Use the hosted application at **https://pkheisig.github.io/OpenPanel/**.

The application is fully static. Spectral calculations, project persistence, imports, CSV exports, and PDF reports all run on your device. After the first successful visit, the installed service worker keeps the application and bundled spectral libraries available offline.

## Privacy

OpenPanel has no application server and makes no API requests. GitHub Pages serves the application code and read-only bundled spectral reference CSVs; selected fluorophores, marker names, imported files, saved projects, and generated reports remain in the browser.

- Settings are stored in `localStorage`.
- The active project is stored in IndexedDB, with a localStorage fallback for restricted browser contexts.
- Imports are read with browser file APIs.
- Exports are written with the File System Access API where available, with ordinary browser downloads as the fallback.
- No user file or project content is uploaded by OpenPanel.

As with any GitHub Pages site, GitHub may receive standard web request metadata when it serves the static files. Once cached, the PWA can be reopened offline.

## Local development

Node.js 22 and npm are recommended.

```sh
git clone https://github.com/pkheisig/OpenPanel.git
cd OpenPanel
npm ci
npm run dev
```

Vite serves the project at `http://127.0.0.1:5174/OpenPanel/`.

Run the complete local validation:

```sh
npm test
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
```

`npm run build` writes the production site to `dist/`. The configured Vite base is `/OpenPanel/`, matching the GitHub repository path.

## Files and compatibility

Panel CSV import accepts comma-, tab-, and semicolon-delimited files. It detects marker/target and fluorophore/dye columns even when columns are reordered, and preserves the existing `Marker,Fluorophore` export format.

OpenPanel projects use versioned `.openpanel.json` files. The importer also accepts the prior panel-builder `gui_state` JSON envelope. Each project keeps an independent workspace for every cytometer used in that project, including its last detector configuration, selected fluorophores, markers, and complete Panel Wizard state. Switching to a cytometer without a saved workspace starts with an empty panel; switching back restores that cytometer's panel. Project-level state also includes the active view, theme, sidebar settings, and plot scale. Wizard persistence includes marker frequencies, assigned colors, co-expression settings, desired panel size, completion state, calculated rankings, ranking mode, and sorting.

The editor provides one Import menu and one Export menu. Each menu offers a compact panel CSV exchange or a complete OpenPanel project JSON exchange.

PDF overview reports are generated locally in the browser and contain the panel metadata, complexity index, spectral similarity matrix, and selected spectral signatures.

## Browser support

OpenPanel targets current stable releases of Chrome, Edge, Firefox, and Safari.

- Chromium browsers can use native open/save pickers when the File System Access API is available.
- Firefox and Safari use the equivalent upload/download fallback.
- IndexedDB, localStorage, service workers, and JavaScript must be enabled.
- Private browsing or hardened storage policies may limit persistence, but project import/export remains available.
- PWA installation presentation varies by browser and operating system; offline reopening is tested in Chromium.

## Deployment architecture

The repository contains one Vite/React/TypeScript application:

1. Vite bundles the UI and browser calculation engine.
2. Static reference libraries under `public/data/` are copied into `dist/`.
3. `vite-plugin-pwa` generates the web manifest and service worker and precaches the application, reference libraries, and visual assets.
4. [The Pages workflow](.github/workflows/pages.yml) runs unit/parity tests, lint, a production build, and Playwright browser workflows on every change to `main`.
5. Only the resulting `dist/` artifact is deployed to GitHub Pages.

There is no R runtime, local launcher, Plumber/httpuv API, server-side persistence, or server-side report generation.

## Regression coverage

The test suite checks:

- browser calculations against recorded outputs from the former R implementation for all four cytometers;
- detector/configuration aliases, detector counts, available fluorophore counts, cosine similarity, peak detectors, and panel complexity;
- project serialization and legacy `gui_state` round-trips;
- CSV/TSV/semicolon imports and CSV exports;
- local PDF creation;
- representative browser selection, marker, matrix, project, import, and export workflows;
- offline reopening after the initial load; and
- absence of application requests to non-local servers during browser workflows.

## License

MIT. See [LICENSE](LICENSE).
