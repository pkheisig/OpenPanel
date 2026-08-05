<p align="center">
  <img src="public/favicon-light.svg" width="72" height="72" alt="OpenPanel logo">
</p>

<h1 align="center">OpenPanel</h1>

<p align="center">Design and evaluate flow cytometry panels entirely in your browser.</p>

<p align="center">
  <a href="https://pkheisig.github.io/OpenPanel/"><strong>Open OpenPanel →</strong></a>
</p>

OpenPanel combines instrument-aware detector-response plots, panel matrices, similarity and complexity calculations, a guided Panel Wizard, and published OMIP templates. It supports spectral Cytek Aurora, BD FACSDiscover, Sony ID7000, and Thermo Fisher Attune Xenith configurations plus conventional BD FACSymphony A5 SE, BD LSRFortessa 3L/4L, BD FACSCelesta, Thermo Fisher Attune NxT, BD Accuri C6 Plus, BD FACSCalibur, BD FACSCanto II, BD FACSLyric, BD FACSVerse, BD LSR II, Beckman Coulter Navios, Beckman Coulter DxFLEX, BD FACSAria Fusion (BUV-optimized facility configuration), Bio-Rad ZE5, Thermo Fisher Attune CytPix, Agilent NovoCyte Quanteon, Miltenyi MACSQuant, and Beckman Coulter CytoFLEX LX configurations without requiring an account, installation, or application server.

## What you can do

- Build and compare panels against the selected cytometer configuration.
- Inspect combined signatures, detector assignments, response similarity, and panel complexity.
- Use the Panel Wizard to balance antigen density, co-expression, availability, brightness, and response conflicts.
- Browse all bundled flow-cytometry OMIPs, including conventional panels, and apply imported marker-color templates with source provenance.
- Keep named projects with separate workspaces for each cytometer.
- Exchange panel CSVs and complete OpenPanel JSON projects, or create a local PDF report.
- Reopen the app and cached reference data offline after the first successful visit.

## Private by design

Your markers, panels, imported files, projects, and reports stay on your device. Settings are stored in `localStorage`; projects use IndexedDB with a localStorage fallback. Imports and exports use browser file APIs, with ordinary uploads and downloads where direct file access is unavailable.

GitHub Pages only serves the static application and bundled reference data. OpenPanel has no application backend and does not upload project contents. GitHub may receive standard request metadata while serving the site; once cached, the PWA can reopen offline.

## Project files

- Panel CSV import accepts comma-, tab-, and semicolon-delimited files and exports `Marker,Fluorophore` CSVs.
- Complete projects export as `[project name]_OpenPanel.json`, including instrument workspaces, Panel Wizard data, and editor state.
- Older `.openpanel.json` projects and the previous `gui_state` JSON format remain importable.
- PDF overview reports are generated locally and include panel metadata, complexity, similarity, and instrument-response signatures.

## Run locally

Node.js 22 and npm are recommended.

```sh
git clone https://github.com/pkheisig/OpenPanel.git
cd OpenPanel
npm ci
npm run dev
```

Vite serves OpenPanel at `http://127.0.0.1:5174/OpenPanel/`. Run the full validation suite with:

```sh
npx playwright install chromium
npm run check
```

## Browser support and deployment

OpenPanel targets current Chrome, Edge, Firefox, and Safari releases. Chromium browsers can use native open/save pickers; Firefox and Safari receive upload/download fallbacks. Persistence and offline reopening require JavaScript, browser storage, and service workers. Private browsing or hardened storage policies may limit saved state, so JSON export is recommended for durable backups.

The repository is a single Vite, React, and TypeScript application with a `/OpenPanel/` production base. Calculations and reference libraries are bundled into the static `dist/` site, while `vite-plugin-pwa` supplies offline caching. [The GitHub Pages workflow](.github/workflows/pages.yml) tests, lints, builds, and runs browser workflows on every push, then deploys only `dist/` from `main`. No R runtime or server-side API is involved.

## Project links

- [Hosted application](https://pkheisig.github.io/OpenPanel/)
- [Detector-response data sources](public/data/SOURCES.md)
- [GitHub Pages workflow](.github/workflows/pages.yml)
- [License](LICENSE)

OpenPanel is licensed under [AGPL-3.0-or-later](LICENSE).

OpenPanel is maintained by Paul Heisig
([ORCID 0000-0002-8529-7944](https://orcid.org/0000-0002-8529-7944)).
