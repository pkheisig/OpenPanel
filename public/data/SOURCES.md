# Detector-response reference data

The bundled files are fluorophore-by-detector response matrices. Spectral
instruments use full detector signatures; conventional instruments use the
response observed across their discrete laser/filter channels. The same matrix
operations can score both modes, but conventional scores are planning proxies
unless the rows come from measured, instrument-specific single-stain controls.

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

## Bundled-data validation contract

Every bundled CSV is validated before it can contribute to a panel payload.
The validators require the documented headers, exact row widths, nonblank
identities and required metadata, finite numeric fields, unique canonical
identities, and unambiguous detector definitions. Spectral response values
must remain in the signed normalized domain `[-1, 1]`; small negative values
are retained baseline residuals, not missing values, and no malformed value is
coerced to zero. Each spectral row must contain a meaningful nonzero response.

On 2026-08-29, the bundled inputs were repaired to satisfy that contract: the
FACSymphony identity header was restored to `fluorophore`, the redundant
`LIVE/DEAD Fixable Near-IR` dictionary row was removed because it canonicalized
to `LIVE DEAD NIR`, and ambiguous overlapping aliases were removed from the
BYG750, EYFP/YFP, and NovaFluor Blue dictionary entries. These changes only
resolve identity/schema ambiguity; they do not alter spectral response values.

The response-matrix coverage is pinned at 64 detectors x 395 fluorophores for
Aurora, 78 x 78 for FACSDiscover, 182 x 65 for ID7000, 51 x 63 for Attune
Xenith, and 48 x 24 for FACSymphony. The validator rejects unknown or missing
detector columns and rejects any row-count change instead of constructing a
partial payload.

On 2026-07-31, missing reference records were merged from the AutoSpectral
development branch at commit
[`f262593f8dc9461dedf2b95cd6a55cc57550f589`](https://github.com/DrCytometer/AutoSpectral/commit/f262593f8dc9461dedf2b95cd6a55cc57550f589).
The merge added 25 Aurora signatures and 10 FACSDiscover signatures without
replacing any existing OpenPanel spectrum. It also expanded the local
fluorophore dictionary to 445 unique canonical names after the identity
cleanup above. ID7000 and Xenith were
already complete relative to that snapshot.

OpenPanel supports spectral Aurora, FACSDiscover, ID7000, and Attune Xenith,
plus conventional BD FACSymphony A5 SE, BD LSRFortessa 3L/4L, BD FACSCelesta,
Attune NxT, Accuri C6 Plus, FACSCalibur, FACSCanto II, FACSLyric, FACSVerse,
LSR II, Navios, DxFLEX, FACSAria Fusion, Bio-Rad ZE5, Attune CytPix, Agilent
NovoCyte Quanteon, Miltenyi MACSQuant, and Beckman Coulter CytoFLEX LX
configurations.
The sparse AutoSpectral libraries for other instruments are not bundled.
Detector peaks (or primary response channels) are calculated from each
fluorophore's response vector on the selected instrument configuration; imported
peak-channel assignments do not override that calculation.

## Conventional BD detector references

The Fortessa detector/filter definitions in
[`conventional_detector_dictionary.csv`](./conventional_detector_dictionary.csv)
are transcribed from the public [FCS Manager Fortessa 3L and 4L
configurations](https://github.com/pkheisig/fcs-manager/blob/master2/src/fcs-web.ts#L108-L151).
The 3L configuration contains 14 fluorescence channels plus a 488/10 side-scatter
channel; the 4L configuration contains 16 fluorescence channels plus side
scatter. OpenPanel excludes the scatter channel from the color/panel ceiling.
The public [BD LSRFortessa Cell Analyzer User's Guide
(PDF)](https://static.bdbiosciences.com/documents/BD_LSRFortessa_cell_analyzer_user_guide.pdf)
documents the configurable detector arrays, optical filters, and measured
compensation workflow.

The same table includes the BD FACSCelesta BV, BVR, BVUV, and BVYG detector
sets transcribed from BD's public [FACSCelesta Filter Guide
(PDF)](https://www.bdbiosciences.com/content/dam/bdb/marketing-documents/BD-FACSCelesta-Filter-Guide.pdf)
and the linked [configuration sheets](https://www.bdbiosciences.com/en-us/products/instruments/flow-cytometers/research-cell-analyzers/facscelesta).

For the FACSymphony A5 SE, BD's [user guide](https://www.bdbiosciences.com/content/dam/bdb/marketing-documents/products-pdf-folder/instruments/research-cell-analyzers/FACSymphony-A5-SE-UG-RUO.pdf)
documents the five laser options, detector arrays, and filter-holder semantics;
the public [A5 SE optical configuration PDF](https://bioscience.fi/wp-content/uploads/2024/02/Symphony-5A-SEOptical-Configuration.pdf)
lists the 48 detector/filter positions used by the bundled response file. The
A5 SE can run either spectral unmixing or compensation workflows; OpenPanel's
conventional target exposes the detector-response planning view and does not
claim a measured compensation matrix.

For cross-checking, the public [University of Arkansas Fortessa 4L detector
table](https://medicine.uams.edu/mbim/research-cores/flow-cytometry-core-facility/instruments/bdlsrfortessa/)
and [University of Edinburgh Fortessa filter table](https://vet.ed.ac.uk/roslin/facilities-resources/bioimaging/flow-cytometry/instruments/bd-lsr-fortessa)
show the same fluorescence-channel structure and common dye assignments.

The Fortessa preview matrix is a public-data planning proxy: it combines the
FCS Manager primary detector assignments with the emission maxima in the bundled
fluorophore dictionary and the documented bandpass filter centers/widths. It
uses a smooth generic emission envelope to distribute signal across compatible
filters. It is not a measured Fortessa compensation or spreading matrix. The
actual reference matrix still needs instrument-specific single-stain controls,
because filter tables and emission maxima do not encode PMT gains, dichroic
transmission, laser power, tandem-dye behavior, or sample-dependent spread.

## Public fluorophore and conventional-instrument references

- `conventional_fluorophore_estimates.csv` adds public-data planning mappings
  for Super Bright 600, Super Bright 645, Super Bright 702, Zombie Aqua, and
  BV785. The entries use manufacturer-reported excitation/emission maxima and
  recommended filter references from [Thermo Fisher's Super Bright 600
  product page](https://www.thermofisher.com/antibody/product/63-5961-82),
  [Super Bright 645 product page](https://www.thermofisher.com/order/catalog/product/64-0451-82),
  [Super Bright 702 product information sheet](https://assets.thermofisher.com/TFS-Assets/LSG/manuals/MAN0018613_SuperBright702_PI.pdf),
  [BioLegend's Zombie Aqua product page](https://www.biolegend.com/en-us/products/zombie-aqua-fixable-viability-kit-8444),
  and [BioLegend's Brilliant Violet spectra reference](https://www.biolegend.com/Files/Images/BioLegend/literature/images/02-0005-01.pdf).
  These are marked `estimated` in the panel builder and are not measured
  compensation or spreading matrices.
- Thermo Fisher's [fluorophore and reagent selection guide for flow cytometry
  (PDF)](https://assets.thermofisher.com/TFS-Assets/BID/Reference-Materials/fluorophore-reagents-flow-cytometry-selection-guide.pdf)
  provides public laser/filter groupings and common dye assignments.
- Thermo Fisher's [Molecular Probes spectral characteristics table](https://www.thermofisher.com/in/en/home/references/molecular-probes-the-handbook/tables/spectral-characteristics-and-recommended-bandpass-filter-sets-for-molecular-probes-dyes.html)
  provides excitation and emission maxima for common dyes.
- Thermo Fisher's [Fluorescence SpectraViewer](https://www.thermofisher.com/tools/fluorescence-spectraviewer)
  and its [usage guide](https://www.thermofisher.com/us/en/home/life-science/cell-analysis/fluorophores/guide-fluorescence-spectraviewer.html)
  are public tools for inspecting full emission curves and filter overlap; the
  exportable full curves are not treated as instrument-specific compensation
  data here.
- BD's public [FACSCelesta Filter Guide (PDF)](https://www.bdbiosciences.com/content/dam/bdb/marketing-documents/BD-FACSCelesta-Filter-Guide.pdf)
  and [configuration sheets](https://www.bdbiosciences.com/en-us/products/instruments/flow-cytometers/research-cell-analyzers/facscelesta)
  provide the reference tables for the bundled Celesta BV, BVR, BVUV, and BVYG
  conventional configurations. These are kept as separate instrument/configuration
  rows; a Celesta configuration is not inferred from Fortessa filters.
- Thermo Fisher's public [Attune NxT detector-configuration table](https://www.thermofisher.com/in/en/home/life-science/cell-analysis/flow-cytometry/flow-cytometers/attune-nxt-flow-cytometer/models/nxt.html)
  documents the available laser combinations and channel counts. The bundled
  `attune_nxt_4l` rows use the public 4-laser channel/filter table in Thermo's
  [13-parameter Attune NxT application note](https://www.thermofisher.com/us/en/home/life-science/cell-analysis/flow-cytometry/flow-cytometry-learning-center/flow-cytometry-resource-library/flow-cytometry-application-notes/multiparameter-immunophenotyping-human-lysed-whole-blood-attune-nxt-flow-cytometer-b-cells-nk-cells-t-cells-myeloid-cells.html)
  and the public [10-parameter detector/filter table](https://www.thermofisher.com/us/en/home/technical-resources/research-tools/image-gallery/image-gallery-detail.21736.html).
  The [Attune filter catalogue](https://www.thermofisher.com/order/catalog/product/jp/en/100022760S)
  makes clear that these filters are user-changeable, so other Attune NxT/CytPix
  installations need their actual installed filter configuration before they
  should be added as separate panel targets.

## Additional complete conventional configurations

The BD [FACSCanto II Filter Guide](https://wiki.umontreal.ca/download/attachments/189567903/BD_FACS_Canto-II_Filter%20Configuration.pdf?api=v2&modificationDate=1628098832000&version=1)
provides complete 2-laser 4-2, 3-laser 4-2-2, and 2-laser 5-3 detector/filter
tables. OpenPanel bundles those three configurations as `canto_2l_4_2`,
`canto_3l_4_2_2`, and `canto_2l_5_3`; mirror-only rows marked `NA` in the
guide are intentionally not counted as detectors or colors.

The official BD [FACSLyric Filter Guide](https://www.bdbiosciences.com/content/dam/bdb/marketing-documents/products-pdf-folder/instruments/clinical-cell-analyzers/BD-Clinical-FACSLyric-Filter-QR-Guide-%28IVD%29.pdf)
and [system product list](https://www.bdbiosciences.com/content/dam/bdb/marketing-documents/eu/X23-18865-07_FACSLyric_PL_final.pdf)
provide complete 2-laser 4/6-color and 3-laser 8/10/12-color configurations.
OpenPanel exposes the five corresponding detector sets and uses the product
list color count as the fluorescence-detector ceiling.

Bio-Rad's public [ZE5 Laser and Filter Configuration Guide](https://www.bio-rad.com/sites/default/files/2024-07/Bulletin_3651.pdf)
provides complete 3-laser 17-color, 3-laser option 2 17-color, 3-laser
20-color, 4-laser 24-color, and 5-laser 27-color tables. OpenPanel bundles
those five named configurations. The guide's UV-option A/B tables are not
bundled because their printed color counts do not agree with the displayed
filter-row counts; they require an instrument-specific reconciliation first.

Thermo Fisher's [Attune CytPix User Guide](https://www.thermofisher.com/TFS-Assets/LSG/manuals/MAN0019440_AttuneCytPixFlowCytometer_UG.pdf)
contains the default configuration/filter table for BYXX, BRXX, BV4XX, BV6XX,
BYRX, BYV4X, BRV6X, BYRV6, and BYRV4. These nine configurations are bundled
with their exact default emission-filter labels. The manual prints `BRV4X`
as 10 detectors while its displayed non-empty channels enumerate 11, so that
configuration is deliberately excluded until the vendor reference is
resolved. The Attune NxT and CytPix filter rows are planning references, not
measured compensation or spreading matrices; installations with changed
filters must be represented by a new verified configuration.

The public University of Helsinki [NovoCyte Quanteon 4025 optical-filter
table](https://www.helsinki.fi/assets/drupal/s3fs-public/migrated-generic-group-long-pages/files/203655-novocyte_quanteon_optical_filters_biomedicum.pdf)
identifies all 25 fluorescence detectors (27 total parameters including
FSC/SSC), with exact laser/filter assignments. OpenPanel bundles that named
4025 configuration. Quanteon 4020/4016 tables from other public references
use different detector layouts, so they are not conflated with the 4025
target.

BD's official [Accuri C6 Plus optical-filter guide](https://www.bdbiosciences.com/content/dam/bdb/marketing-documents/BD-Accuri-C6-Plus-Filter-Guide.pdf)
defines the standard shipped 3-blue/1-red configuration as FL1 533/30,
FL2 585/40, FL3 670 LP, and FL4 675/25. OpenPanel bundles that exact four-color
configuration as `accuri_c6_plus_standard`; alternate selectable-laser and
application-specific filter modules are not generalized.

The public [BD FACSCalibur optical-layout reference](https://www.bdj.co.jp/pdf/64-039-01_p26.pdf)
and [University of Montreal detector table](https://microbiologie.umontreal.ca/cytometrie/instruments/analyse-cellulaire/analyseur-facscalibur-becton-dickinson/banc-optique-bd-facscalibur/)
agree on the fixed 2-laser 4-color map: blue FL1 530/30, FL2 585/42, FL3
670 LP, and red FL4 661/16. OpenPanel bundles it as `facscalibur_2l_4` and
excludes scatter from the color ceiling.

The public [DxFLEX detector configuration table](https://caflabs.org.za/wp-content/uploads/2025/10/Beckman-Coulter-DxFLEX-configuration.pdf)
gives the complete B5-R3-V5 map: five violet, five blue, and three red
fluorescence detectors. Beckman's [DxFLEX documentation](https://www.mybeckman.uk/flow-cytometry/clinical-flow-cytometers/dxflex/pushing-boundaries)
describes the fixed WDM/APD detector architecture. OpenPanel bundles only the
reconciled `dxflex_b5_r3_v5` 13-detector configuration; the lower-channel
DxFLEX variants are not added without their own complete installed map.

Miltenyi's official [MACSQuant Analyzer 10 specification sheet](https://www.miltenyibiotec.com/upload/assets/IM0011348.PDF)
and [MACSQuant instrument configuration table](https://static.miltenyibiotec.com/asset/150655405641/document_nvailh5sa963jcjmuhfelstk41?content-disposition=inline)
provide exact channel/filter rows for the Analyzer 10, Analyzer 16, and VYB.
OpenPanel bundles those three fixed configurations and excludes FSC/SSC from
the color ceiling. The MACSQuant table's finite ranges (`655-730` and
`593-650`) are kept as ranges; long-pass rows remain long-pass rather than
being silently converted into invented bandpass filters.

The public BD [FACSVerse System Reference Guide](https://content.ilabsolutions.com/wp-content/uploads/2015/08/23-11879-00-FACSVerse-System-Reference-Guide.pdf)
provides the complete BD-defined 4-0-0, 4-2-0, and 4-2-2 detector arrays.
OpenPanel bundles those three configurations as `facsverse_1l_4`,
`facsverse_2l_6`, and `facsverse_3l_8`; blank filter positions and the SSC
position are excluded from the color ceiling.

BD's public [LSR II User's Guide](https://www.bu.edu/flow-cytometry/files/2010/10/BD-LSRII-User-Guide1.pdf)
contains complete default mirror/filter tables for the eight common
6-blue/0-or-2-or-6-violet/0-or-2-UV/3-or-4-red layouts. OpenPanel keeps those
layouts separate because the violet and red octagon/trigon filter assignments
are not interchangeable.

Beckman Coulter's public [CytoFLEX LX configuration table](https://www.cnic.es/sites/default/files/administrator/cytoflex_lx_cnic_configurations.pdf)
gives the complete default UV3-V5-B3-Y5-R3 channel/filter map; the vendor's
[product specification](https://www.beckman.com/flow-cytometry/research-flow-cytometers/cytoflex-lx/c40323)
confirms the same 19-fluorescence-detector product. OpenPanel bundles that
fixed 5-laser configuration as `cytoflex_lx_u3_v5_b3_y5_r3_i0`.

Beckman Coulter's [Navios filter reference](https://www.mybeckman.se/support/faq/product/navios-optical-filters)
and the public Navios configuration table in this [Southampton thesis](https://shura.shu.ac.uk/31355/7/Pawson_2021_ProfD_RoleTolerogenicCells.pdf)
give a consistent 2-laser 8-color layout: five blue channels (525/40,
575/30, 620/30, 695/30, and 755 LP) and three red channels (660/20, 725/20,
and 755 LP). OpenPanel bundles that layout as `navios_2l_8` and excludes the
488/10 scatter channel.

Other CytoFLEX and Attune variants remain excluded when their public material
only documents a selectable filter inventory or a color ceiling without a
fixed per-channel assignment. They need their installed WDM/filter map before
they can be represented safely.

The Navios 10-color/violet variant is not bundled: public references disagree
on the violet bandpass width (450/40 versus 450/50), so it requires a resolved
instrument-specific table before use.

The Bio-Rad [S3/S3e manual](https://www.bio-rad.com/sites/default/files/webroot/web/pdf/lsr/literature/10031105.pdf)
states that its optical filter blocks are user-changeable, so no single S3/S3e
detector map is assumed. The public [Bonn BUV-optimized FACSAria Fusion
table](https://www.medfak.uni-bonn.de/en/research/infrastructure/media-files/documents/filter-und-fluorochrome-ariafusion-buv.pdf/%40%40download)
does provide one internally consistent installed map: 18 fluorescence rows
(2 blue, 3 red, 6 violet, 3 yellow-green, and 4 UV), matching the associated
20-parameter system when FSC/SSC are included. OpenPanel bundles it only as the
explicit `facsaria_fusion_buv` facility configuration; other Fusion
installations remain excluded until their own filter map is known.

Sony's public [SH800 filter configuration](https://bioscience.fi/wp-content/uploads/2024/02/Sony-SH800-4Laser-Configuration_405-488-561-638.pdf)
and [MA900 detector table](https://flowcytometry.umn.edu/sites/flowcytometry.umn.edu/files/2024-04/Sony%20MA900%20Configuration%202024.pdf)
are complete public references, but they use co-linear/shared excitation:
SH800's six PMTs can be driven by multiple selected lasers, while MA900's
FL1-FL5 and FL6-FL12 groups are shared across laser pairs. OpenPanel currently
requires one excitation-laser assignment per detector, so these systems are
left out rather than being represented with a misleading single-laser map.

Agilent's [NovoCyte Advanteon product page](https://www.agilent.com/en/product/research-flow-cytometry/flow-cytometers/flow-cytometer-systems/novocyte-advanteon-flow-cytometer-1270335)
describes a customizable one-to-three-laser platform with up to 21 fluorescence
channels. No single universal detector/filter layout is assumed here; a named
Advanteon installation can be added once its exact configuration is selected.

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

The bundled OMIP Library contains all 113 flow-cytometry records from the
121-record PubMed OMIP bibliography snapshot, refreshed 2026-07-31. Mass
cytometry and imaging applications are excluded because they are not flow
cytometry workflows. Every included flow OMIP has an offline marker–reagent
table: 2,372 marker rows in total, covering both spectral and conventional
panels.

The assignments were imported from the public
[FluoroFinder OMIP registry](https://admin.fluorofinder.com/omips), which
reproduces the published reagent tables. OMIP-084 and OMIP-091 use their
published Wiley tables because their registry detail endpoints were
unavailable: [OMIP-084 Table 2](https://doi.org/10.1002/cyto.a.24564) and
[OMIP-091](https://doi.org/10.1002/cyto.a.24738). Source cytometer labels and
the table URL are bundled with each template for provenance. Published
duplicate fluorophores are preserved; reagents not present in the local dye
dictionary remain visible by their reported name, and colors unavailable on
the selected cytometer remain unassigned for the wizard to optimize. These
are literature assignments, not a claim that every imported panel has been
validated on every OpenPanel configuration.

Spectral-mode spread risk uses the Hotspot Matrix /
spreading-inflation-factor formulation described in
[AutoSpectral](https://www.biorxiv.org/content/10.64898/2026.01.27.701929v2).
In conventional mode, the corresponding inverse-similarity term is exposed as
a detector-response separation proxy; it is not a measured compensation or
spreading-error estimate without an instrument-specific spillover/spread
matrix or noise model.
