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
- `LIVE DEAD NIR` was assigned the app's canonical name
  `LIVE/DEAD Fixable Near-IR`.

Existing higher-precision Aurora rows were retained unchanged. No spectrum is
interpolated from a different dye or cytometer.

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
