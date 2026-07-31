# Spectral reference data

The Aurora library combines the repository's original high-precision detector
signatures with missing signatures from Cytek Biosciences' public
[Full Spectrum Viewer](https://spectrum.cytekbio.com/), retrieved from its
`112 Dyes spectrum 5L.csv` export on 2026-07-28.

For rows added from the Cytek export:

- percentages were converted to normalized values from 0 to 1;
- negative background values were clamped to zero, matching the viewer;
- detector names were mapped directly from `UV1`–`UV16`, `V1`–`V16`,
  `B1`–`B14`, `YG1`–`YG10`, and `R1`–`R8` to the app's corresponding `-A`
  detector labels; and
- Thermo Fisher's `LIVE/DEAD Fixable Near-IR` and the Cytek export's
  `LIVE DEAD NIR` are displayed under the concise canonical name
  `LIVE DEAD NIR`; the manufacturer name and catalog numbers remain aliases.

Existing higher-precision Aurora rows were retained unchanged. No spectrum is
interpolated from a different dye or cytometer.

On 2026-07-31, missing reference records were merged from the AutoSpectral
development branch at commit
[`f262593f8dc9461dedf2b95cd6a55cc57550f589`](https://github.com/DrCytometer/AutoSpectral/commit/f262593f8dc9461dedf2b95cd6a55cc57550f589).
The merge added 25 Aurora signatures and 10 FACSDiscover signatures without
replacing any existing OpenPanel spectrum. It also expanded the local
fluorophore dictionary to 446 unique canonical names. ID7000 and Xenith were
already complete relative to that snapshot.

OpenPanel intentionally continues to support Aurora, FACSDiscover, ID7000, and
Attune Xenith only. The sparse AutoSpectral libraries for other instruments are
not bundled. Detector peaks are calculated from each fluorophore's full
signature on the selected instrument configuration; imported peak-channel
assignments do not override that calculation.

## Panel Wizard reference data

- `panel_wizard_brightness.csv` contains ordinal relative-brightness
  classifications from BD's *Life Sciences Relative Fluorochrome Brightness*
  chart. The chart's four categories are encoded as Dim = 1, Moderate = 3,
  Bright = 4, and Very Bright = 5; level 2 is intentionally unused rather
  than inventing an intermediate manufacturer category:
  <https://www.bdbiosciences.com/content/dam/bdb/marketing-documents/23-16181-08_Post%20Card_BD%20Life_Sciences_Relative_Fluorochrome_Brightness_06092020.pdf>
- `panel_wizard_antigen_density.csv` contains the documented molecules-per-cell
  values from BioLegend's *Expression of Common Surface Molecules on Blood Cells*:
  <https://www.biolegend.com/Files/Images/media_assets/support_resource/Expression_Common_Proteins_121511.pdf>

These references are intentionally sparse. A missing fluorophore is displayed
as unknown rather than as dim. A missing fluorophore, antigen, or cell-type
combination contributes no brightness or antigen-density term to the wizard
calculation.

Marker names and aliases used by wizard autocomplete are based on the
[AutoSpectral marker database](https://docs.google.com/spreadsheets/d/16FAinR_Nfnl00mpHvmQFJT_uJJY3VUWk29yAaQ7HHn8/edit?usp=sharing).
The bundled `marker_dictionary.csv` snapshot contains 878 unique canonical
names. It is merged at runtime with OpenPanel's curated contextual markers, so
their aliases remain searchable and their cell-type prioritization remains
intact. The list is used only for local lookup and never sends marker searches
to a server.

The bundled OMIP bibliography covers OMIP-001 through OMIP-121 from the
PubMed title query `OMIP[Title]` (refreshed 2026-07-31). Every entry can be
searched and previewed locally, with links to the OMIP database and its paper.
Six built-in editable templates reproduce the marker/fluorochrome tables from
[OMIP-042](https://pmc.ncbi.nlm.nih.gov/articles/PMC6077845/),
[OMIP-051](https://pmc.ncbi.nlm.nih.gov/articles/PMC6546165/),
[OMIP-069](https://pmc.ncbi.nlm.nih.gov/articles/PMC8132182/),
[OMIP-077](https://pmc.ncbi.nlm.nih.gov/articles/PMC9292053/),
[OMIP-090](https://pmc.ncbi.nlm.nih.gov/articles/PMC10952450/), and
[OMIP-101](https://pmc.ncbi.nlm.nih.gov/articles/PMC10958279/). Suggestions
that are unavailable on the selected cytometer remain unassigned for the
wizard to optimize.

Spectral spread risk uses the Hotspot Matrix / spreading-inflation-factor
formulation described in
[AutoSpectral](https://www.biorxiv.org/content/10.64898/2026.01.27.701929v2).
