/* eslint-disable react-refresh/only-export-components -- shared panel primitives intentionally colocate the PDF glyph with pure helpers */
import { mapDetectorToEmission, wavelengthToColor } from './detectorAxis';
import { canonicalizeFluorophoreName, fluorophoreIdentity, resolveBundledFluorophoreKey } from './fluorophoreNames';
import { CYTOMETER_ALIASES } from './cytometerAliases';

const unboxGuiState = (value: unknown): unknown => {
    if (Array.isArray(value)) {
        if (value.length === 1) return unboxGuiState(value[0]);
        return value.map(unboxGuiState);
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, unboxGuiState(item)]));
    }
    return value;
};

const normalizeMarkers = (value: unknown): Record<number, string> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
        Object.entries(value).map(([key, marker]) => [Number(key), String(unboxGuiState(marker) ?? '')])
    );
};

const PdfIcon = ({ size = 20 }: { size?: number }) => (
    <svg width={size + 4} height={size} viewBox="0 0 30 24" fill="none" aria-hidden="true">
        <path d="M4 2.75h13l5 5v13.5H4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M17 2.75v5h5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <text x="13" y="16.4" fill="currentColor" fontSize="6.2" fontWeight="800" textAnchor="middle" fontFamily="Avenir Next, sans-serif">PDF</text>
    </svg>
);

type PanelMeasurementMode = 'spectral' | 'conventional';

type ResponseMatrixProvenanceClass =
    | 'measured_full_spectrum'
    | 'measured_detector_response'
    | 'synthetic_filter_proxy';

type ResponseMatrixProvenance = {
    class: ResponseMatrixProvenanceClass;
    label: string;
    method: string;
    version: string;
    source: string;
    limitation: string;
};

const RESPONSE_PROVENANCE_CONTRACT_VERSION = 'response-provenance-v1';
const WIZARD_SCORING_VERSION = 'wizard-response-provenance-v1';
const responseProvenanceDefaults: Record<ResponseMatrixProvenanceClass, Omit<ResponseMatrixProvenance, 'class'>> = {
    measured_full_spectrum: {
        label: 'Measured/full-spectrum response',
        method: 'Bundled full-spectrum response matrix',
        version: RESPONSE_PROVENANCE_CONTRACT_VERSION,
        source: 'instrument spectral response library',
        limitation: 'Spectral overlap is not a substitute for an instrument-specific compensation or spreading-error matrix.',
    },
    measured_detector_response: {
        label: 'File-backed detector response',
        method: 'Bundled detector-response reference',
        version: RESPONSE_PROVENANCE_CONTRACT_VERSION,
        source: 'symphony_spectra.csv',
        limitation: 'Detector responses are not an instrument-specific compensation or spreading-error matrix.',
    },
    synthetic_filter_proxy: {
        label: 'Synthetic detector-response planning proxy',
        method: 'Gaussian emission envelope over documented detector filters',
        version: RESPONSE_PROVENANCE_CONTRACT_VERSION,
        source: 'conventional_detector_dictionary.csv + fluorophore_dictionary.csv',
        limitation: 'Planning proxy only; not measured compensation, spreading, or instrument-specific spillover evidence.',
    },
};

const responseMatrixProvenance = (
    provenanceClass: ResponseMatrixProvenanceClass,
    overrides: Partial<Omit<ResponseMatrixProvenance, 'class'>> = {},
): ResponseMatrixProvenance => ({
    class: provenanceClass,
    ...responseProvenanceDefaults[provenanceClass],
    ...overrides,
});

const FULL_SPECTRUM_CYTOMETER_KEYS = ['aurora', 'discover', 'id7000', 'xenith'];
const CONVENTIONAL_CYTOMETER_KEYS = [
    'symphony', 'fortessa', 'celesta', 'attunenxt', 'accuric6plus', 'facscalibur', 'canto', 'lyric',
    'ze5', 'cytpix', 'quanteon', 'macsquant', 'facsverse', 'lsrii', 'cytoflexlx', 'navios',
    'dxflex', 'facsariafusion',
];

const RESPONSE_LIBRARY_SOURCES: Record<string, string> = {
    aurora: 'aurora_spectra.csv',
    discover: 'discover_spectra.csv',
    id7000: 'id7000_spectra.csv',
    xenith: 'xenith_spectra.csv',
    symphony: 'symphony_spectra.csv',
};

const normalizedCytometerKey = (cytometer: string): string => (
    String(cytometer ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')
);

const responseCytometerFamily = (cytometer: string): string | undefined => {
    const normalizedCytometer = normalizedCytometerKey(cytometer);
    const canonical = CYTOMETER_ALIASES[normalizedCytometer];
    return canonical ? normalizedCytometerKey(canonical) : undefined;
};

const responseMeasurementModeForCytometer = (cytometer: string): PanelMeasurementMode => {
    const family = responseCytometerFamily(cytometer);
    if (!normalizedCytometerKey(cytometer)) return 'spectral';
    if (!family) return 'conventional';
    return CONVENTIONAL_CYTOMETER_KEYS.includes(family) ? 'conventional' : 'spectral';
};

const responseSourceForCytometer = (cytometer: string): string | undefined => {
    const family = responseCytometerFamily(cytometer);
    return family ? RESPONSE_LIBRARY_SOURCES[family] : undefined;
};

const responseProvenanceForCytometer = (
    cytometer: string,
    measurementMode: PanelMeasurementMode,
    source?: string,
): ResponseMatrixProvenance => {
    const family = responseCytometerFamily(cytometer);
    if (!family) {
        if (normalizedCytometerKey(cytometer)) {
            // An unrecognized instrument must never inherit measured-response semantics.
            return responseMatrixProvenance('synthetic_filter_proxy', source ? { source } : {});
        }
        return responseMatrixProvenance(
            measurementMode === 'spectral' ? 'measured_full_spectrum' : 'synthetic_filter_proxy',
            source ? { source } : {},
        );
    }
    const provenanceClass: ResponseMatrixProvenanceClass = family === 'symphony'
        ? 'measured_detector_response'
        : FULL_SPECTRUM_CYTOMETER_KEYS.includes(family)
            ? 'measured_full_spectrum'
        : CONVENTIONAL_CYTOMETER_KEYS.includes(family)
            ? 'synthetic_filter_proxy'
        : 'synthetic_filter_proxy';
    return responseMatrixProvenance(provenanceClass, source ? { source } : {});
};

const isKnownCytometerIdentity = (cytometer: string): boolean => {
    return responseCytometerFamily(cytometer) !== undefined;
};

const responseProvenanceForMeasurementMode = (measurementMode: PanelMeasurementMode): ResponseMatrixProvenance => (
    responseMatrixProvenance(
        measurementMode === 'spectral' ? 'measured_full_spectrum' : 'synthetic_filter_proxy',
    )
);

const isResponseMatrixProvenance = (value: unknown): value is ResponseMatrixProvenance => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    return (
        (record.class === 'measured_full_spectrum'
            || record.class === 'measured_detector_response'
            || record.class === 'synthetic_filter_proxy')
        && typeof record.label === 'string'
        && typeof record.method === 'string'
        && typeof record.version === 'string'
        && typeof record.source === 'string'
        && typeof record.limitation === 'string'
    );
};

const responseProvenanceMatchesPayload = (
    cytometer: string,
    measurementMode: PanelMeasurementMode,
    provided: unknown,
): provided is ResponseMatrixProvenance => {
    const expected = responseProvenanceForCytometer(
        cytometer,
        measurementMode,
        responseSourceForCytometer(cytometer),
    );
    return isResponseMatrixProvenance(provided)
        && provided.class === expected.class
        && provided.version === expected.version
        && provided.source === expected.source;
};

const responseProvenanceForPayload = (
    cytometer: string,
    measurementMode: PanelMeasurementMode,
    _provided?: unknown,
): ResponseMatrixProvenance => {
    void _provided;
    const expected = responseProvenanceForCytometer(
        cytometer,
        measurementMode,
        responseSourceForCytometer(cytometer),
    );
    // Display copy is not identity; always render the canonical contract.
    return { ...expected };
};

const responseProvenanceWarningForPayload = (
    cytometer: string,
    measurementMode: PanelMeasurementMode,
    provided?: unknown,
): string | null => {
    if (normalizedCytometerKey(cytometer) && !isKnownCytometerIdentity(cytometer)) {
        return 'The instrument identity was not recognized; a synthetic planning proxy was used conservatively.';
    }
    return provided === undefined || provided === null || responseProvenanceMatchesPayload(cytometer, measurementMode, provided)
        ? null
        : 'Supplied response provenance did not match the selected instrument; the selected instrument contract was used.';
};

type LibraryInfo = {
    id: string;
    label: string;
    measurement_mode: PanelMeasurementMode;
    response_provenance: ResponseMatrixProvenance;
};

type ConfigurationInfo = {
    id: string;
    label: string;
    description: string;
};

type DetectorInfo = {
    detector: string;
    label: string;
    laser: string;
    emission: number;
    color: string;
};

type FluorInfo = {
    fluorophore: string;
    peak_detector: string;
    peak_laser: string;
    peak_color: string;
    retained_signal?: number;
    mapping_confidence?: 'curated' | 'estimated';
    mapping_source?: string;
    mapping_note?: string;
};

type NumericRow = {
    fluorophore: string;
    [key: string]: string | number;
};

type PanelPayload = {
    cytometer: string;
    configuration: string;
    measurement_mode: PanelMeasurementMode;
    response_provenance: ResponseMatrixProvenance;
    libraries: LibraryInfo[];
    configurations: ConfigurationInfo[];
    detectors: DetectorInfo[];
    fluorophores: FluorInfo[];
    selected: string[];
    spectra: NumericRow[];
    similarity: NumericRow[];
    complexity_index: number | null;
    peak_detectors: string[];
    max_panel_size: number;
    error?: string;
};

type TabId = 'panel' | 'similarity' | 'signatures';

type ImportedPanelRow = {
    fluor: string;
    marker: string;
};

type PanelImportDiagnostic = {
    sourceRow: number;
    rawFluorophore: string;
    canonicalFluorophore: string | null;
    status: 'accepted' | 'duplicate' | 'unsupported' | 'invalid';
    reason: string;
};

type ImportedPanelRows = {
    rows: ImportedPanelRow[];
    diagnostics: PanelImportDiagnostic[];
};

class PanelImportValidationError extends Error {
    rows: ImportedPanelRow[];
    diagnostics: PanelImportDiagnostic[];

    constructor(message: string, result: ImportedPanelRows) {
        super(message);
        this.name = 'PanelImportValidationError';
        this.rows = result.rows;
        this.diagnostics = result.diagnostics;
    }
}

type PanelFluorophoreDiagnostic = {
    requested: string;
    canonicalFluorophore: string | null;
    status: 'unrecognized' | 'unavailable' | 'duplicate';
    reason: string;
};

type PanelFluorophoreValidation = {
    accepted: string[];
    diagnostics: PanelFluorophoreDiagnostic[];
};

const laserOrder = ['DeepUV', 'UV', 'Violet', 'Blue', 'YellowGreen', 'Red', 'IR', 'Other'];
const emptySlots = 18;

const assertPanelSlotsWithinCapacity = (slots: string[], maxPanelSize: number): void => {
    const overflowIndex = slots.findIndex((slot, index) => Boolean(slot.trim()) && index >= maxPanelSize);
    if (overflowIndex >= 0) {
        throw new Error(
            `The imported panel uses detector slot ${overflowIndex + 1}, but the selected configuration supports only ${maxPanelSize} detectors.`,
        );
    }
};

const assertPanelMarkersWithinCapacity = (markers: Record<number, string>, maxPanelSize: number): void => {
    const invalidKey = Object.keys(markers)
        .find(key => !/^(0|[1-9]\d*)$/.test(key) || !Number.isSafeInteger(Number(key)));
    if (invalidKey !== undefined) {
        throw new Error(
            `The imported panel contains invalid marker slot ${JSON.stringify(invalidKey)}. Marker slots must be nonnegative integers.`,
        );
    }
    const overflowIndex = Object.keys(markers)
        .map(Number)
        .find(index => index >= maxPanelSize);
    if (overflowIndex !== undefined) {
        throw new Error(
            `The imported panel uses marker slot ${overflowIndex + 1}, but the selected configuration supports only ${maxPanelSize} detectors.`,
        );
    }
};

const formatMetric = (value: number | string | null | undefined) => {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) return 'NA';
    return numeric.toFixed(2);
};

const toNumber = (value: string | number | undefined) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const toSimilarityValue = (value: string | number | undefined) => {
    const numeric = toNumber(value);
    if (Math.abs(numeric) < 0.005) return 0;
    return Math.max(0, Math.min(1, numeric));
};

const laserLabel = (laser: string) => {
    if (laser === 'YellowGreen') return 'YG 561';
    if (laser === 'Violet') return 'V 405';
    if (laser === 'Blue') return 'B 488';
    if (laser === 'Red') return 'R 640';
    if (laser === 'DeepUV') return 'DUV 320';
    if (laser === 'UV') return 'UV 355';
    if (laser === 'IR') return 'IR 781';
    return laser;
};

const unique = <T,>(values: T[]) => Array.from(new Set(values));

const detectorPointX = (index: number, count: number, left: number, width: number) => (
    count <= 1 ? left + width / 2 : left + (index / (count - 1)) * width
);

const detectorColumnCenterX = (index: number, count: number, left: number, width: number) => (
    left + ((index + 0.5) / Math.max(1, count)) * width
);

const linePath = (row: NumericRow, detectors: DetectorInfo[], width: number, height: number, left = 0) => {
    if (detectors.length === 0) return '';
    return detectors.map((det, index) => {
        const x = detectorPointX(index, detectors.length, left, width);
        const y = height - toNumber(row[det.detector]) * (height - 32) - 24;
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
};

const laserWavelength = (laser: string) => {
    const key = laser.toLowerCase();
    if (key === 'deepuv') return 320;
    if (key === 'uv') return 355;
    if (key === 'violet') return 405;
    if (key === 'blue') return 488;
    if (key === 'yellowgreen') return 561;
    if (key === 'red') return 640;
    if (key === 'ir') return 781;
    return 0;
};

const getSimilarityStyle = (value: number, isDiag: boolean, currentTheme: 'light' | 'dark') => {
    if (isDiag) {
        return {
            background: 'var(--bg-cell-diag)',
            color: currentTheme === 'dark' ? '#fff' : '#111'
        };
    }

    const intensity = Math.max(0, Math.min(1, value));
    const sunsetIntensity = Math.pow(intensity, 1.55);
    const hue = 42 - sunsetIntensity * 67;

    return {
        background: `hsl(${hue.toFixed(1)} 88% ${Math.round(97 - sunsetIntensity * 50)}%)`,
        color: intensity > 0.62 ? '#fffaf4' : '#4b241d',
        textShadow: intensity > 0.72 ? '0 1px 2px rgba(70, 10, 20, 0.35)' : 'none'
    };
};

const bandColor = (value: number) => {
    const v = Math.max(0, Math.min(1, Math.pow(value, 0.55)));
    const stops = [
        { at: 0, color: [0, 0, 255] },
        { at: 0.25, color: [0, 255, 255] },
        { at: 0.5, color: [0, 255, 0] },
        { at: 0.75, color: [255, 255, 0] },
        { at: 1, color: [255, 0, 0] },
    ];
    const upper = stops.findIndex(stop => v <= stop.at);
    const hi = stops[Math.max(1, upper)];
    const lo = stops[Math.max(0, Math.max(1, upper) - 1)];
    const range = Math.max(0.0001, hi.at - lo.at);
    const t = (v - lo.at) / range;
    const rgb = lo.color.map((channel, i) => Math.round(channel + (hi.color[i] - channel) * t));
    return `rgb(${rgb.join(', ')})`;
};

const signatureLogFromValue = (value: number) => {
    const v = Math.max(0, Math.min(1, value));
    return 0.35 + Math.pow(v, 0.72) * 5.65;
};

const signatureY = (logValue: number, top: number, height: number) => {
    const yPower = 1.5;
    const maxTransformed = Math.pow(6.35, yPower);
    const transformed = Math.pow(Math.max(0, Math.min(6.35, logValue)), yPower);
    return top + height - (transformed / maxTransformed) * height;
};

const signatureBandBins = (value: number) => {
    const offsets = [-0.36, -0.30, -0.24, -0.18, -0.12, -0.06, 0, 0.06, 0.12, 0.18, 0.24, 0.30, 0.36];
    const v = Math.max(0, Math.min(1, value));
    const center = signatureLogFromValue(v);
    return offsets.map((offset, index) => {
        const distance = Math.abs(index - (offsets.length - 1) / 2) / ((offsets.length - 1) / 2);
        const density = Math.max(0.05, 1 - distance) * Math.max(0.08, v);
        return {
            logValue: Math.max(0, Math.min(6, center + offset)),
            density,
        };
    });
};

const csvEscape = (value: string) => `"${value.replace(/"/g, '""')}"`;

const normalizeImportToken = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

const MAX_IMPORTED_PANEL_ROWS = 4096;
const MAX_IMPORTED_PANEL_CELLS = 16384;

const parseDelimitedRows = (text: string, delimiter: string) => {
    const rows: Array<{ values: string[]; sourceRow: number }> = [];
    let row: string[] = [];
    let cell = '';
    let quoted = false;
    let sourceRow = 1;
    let parsedCells = 0;

    const pushCell = () => {
        parsedCells += 1;
        if (parsedCells > MAX_IMPORTED_PANEL_CELLS) {
            throw new Error(`The imported CSV contains more than ${MAX_IMPORTED_PANEL_CELLS} cells.`);
        }
        row.push(cell.trim());
        cell = '';
    };

    const pushRow = () => {
        pushCell();
        if (row.some(value => value.length > 0)) {
            if (rows.length >= MAX_IMPORTED_PANEL_ROWS) {
                throw new Error(`The imported CSV contains more than ${MAX_IMPORTED_PANEL_ROWS} rows.`);
            }
            rows.push({ values: row, sourceRow });
        }
        row = [];
        sourceRow += 1;
    };

    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        const next = text[i + 1];

        if (char === '"') {
            if (quoted && next === '"') {
                cell += '"';
                i += 1;
            } else {
                quoted = !quoted;
            }
        } else if (char === delimiter && !quoted) {
            pushCell();
        } else if ((char === '\n' || char === '\r') && !quoted) {
            pushRow();
            if (char === '\r' && next === '\n') i += 1;
        } else {
            cell += char;
        }
    }

    pushRow();
    if (rows.length > 0 && rows[0].values.length > 0) rows[0].values[0] = rows[0].values[0].replace(/^\uFEFF/, '');
    return rows;
};

const parseCsvLikeRows = (text: string) => {
    const delimiters = [',', '\t', ';'];
    const parsed = delimiters.map(delimiter => {
        const rows = parseDelimitedRows(text, delimiter);
        const multiColumnRows = rows.filter(row => row.values.length > 1).length;
        const totalCells = rows.reduce((sum, row) => sum + row.values.length, 0);
        return { delimiter, rows, score: multiColumnRows * 1000 + totalCells };
    });
    parsed.sort((a, b) => b.score - a.score);
    return parsed[0].rows;
};

const strongHeaderWords = new Set(['marker', 'markers', 'antigen', 'target', 'targets', 'fluor', 'fluorophore', 'fluorochrome', 'dye', 'tag', 'color', 'colour', 'reagent']);
const genericHeaderWords = new Set(['sample', 'sampleid', 'well', 'wellid', 'id', 'name', 'names', 'group', 'groups', 'channel', 'channels', 'file', 'filename', 'notes', 'conjugate', 'panel', 'panels', 'label', 'labels', 'metadata', 'source']);
const unambiguousGenericHeaderWords = new Set(['sample', 'sampleid', 'well', 'wellid', 'file', 'filename', 'metadata', 'source']);
const fluorophoreHeaderWords = new Set(['fluor', 'fluorophore', 'fluorochrome', 'dye', 'tag', 'color', 'colour', 'reagent']);

const rowHasHeaderWords = (row: string[]) => {
    const keys = row.map(normalizeImportToken);
    const strongCount = keys.filter(key => strongHeaderWords.has(key)).length;
    const genericCount = keys.filter(key => genericHeaderWords.has(key)).length;
    return strongCount >= 2
        || genericCount >= 2
        || (strongCount >= 1 && genericCount >= 1)
        || (row.length > 1 && keys.some(key => unambiguousGenericHeaderWords.has(key)))
        || (row.length === 1 && strongCount === 1);
};

const buildFluorLookup = (fluorophores: FluorInfo[]) => {
    const lookup = new Map<string, string>();
    fluorophores.forEach(info => {
        const canonical = info.fluorophore;
        const keys = [
            canonical,
            canonical.replace(/\s*\([^)]*\)/g, ''),
            canonical.replace(/^(.+?)\s*-\s*/g, '$1-'),
        ].map(normalizeImportToken).filter(Boolean);
        keys.forEach(key => {
            if (!lookup.has(key)) lookup.set(key, canonical);
        });
        const bundledKey = resolveBundledFluorophoreKey(canonical);
        if (bundledKey && !lookup.has(bundledKey)) lookup.set(bundledKey, canonical);
    });
    return lookup;
};

const matchImportedFluor = (value: string, lookup: Map<string, string>) => {
    const raw = value.trim();
    if (!raw) return '';
    const candidates = [
        raw,
        raw.replace(/\s*\([^)]*\)/g, ''),
        raw.split(/[;,|]/)[0] || raw,
    ].map(canonicalizeFluorophoreName).map(normalizeImportToken).filter(Boolean);

    for (const key of candidates) {
        const hit = lookup.get(key) || lookup.get(resolveBundledFluorophoreKey(key) || '');
        if (hit) return hit;
    }
    return '';
};

const detectImportedPanelRows = (
    text: string,
    fluorophores: FluorInfo[],
    maxMarkerLength = Number.POSITIVE_INFINITY,
): ImportedPanelRows => {
    const rows = parseCsvLikeRows(text);
    if (rows.length === 0) throw new Error('The imported CSV file is empty.');

    const lookup = buildFluorLookup(fluorophores);
    const firstRow = rows[0].values;
    const firstRowHasKnownFluor = firstRow.some(value => !!matchImportedFluor(value, lookup));
    const singleFluorHeaderIndex = firstRow.findIndex(value => fluorophoreHeaderWords.has(normalizeImportToken(value)));
    const hasKnownFluorBelowSingleHeader = singleFluorHeaderIndex >= 0
        && rows.slice(1).some(row => !!matchImportedFluor(row.values[singleFluorHeaderIndex] || '', lookup));
    const hasHeader = !firstRowHasKnownFluor && (
        rowHasHeaderWords(firstRow) || hasKnownFluorBelowSingleHeader
    );
    const headers = hasHeader ? firstRow.map(normalizeImportToken) : [];
    const dataRows = hasHeader ? rows.slice(1) : rows;
    const maxCols = Math.max(...rows.map(row => row.values.length));

    const fluorScores = Array.from({ length: maxCols }, (_, colIndex) => {
        const valueMatches = dataRows.reduce((count, row) => count + (matchImportedFluor(row.values[colIndex] || '', lookup) ? 1 : 0), 0);
        const header = headers[colIndex] || '';
        const headerBonus = ['fluor', 'fluorophore', 'fluorochrome', 'dye', 'tag', 'color', 'colour', 'reagent'].includes(header) ? 2 : 0;
        return valueMatches + headerBonus;
    });
    const fluorCol = fluorScores.indexOf(Math.max(...fluorScores));
    if (fluorCol < 0 || fluorScores[fluorCol] <= 0) {
        throw new Error('No known fluorophores were recognized in the imported CSV for the selected cytometer.');
    }

    const markerHeaderHits = headers
        .map((header, index) => ({ header, index }))
        .filter(item => ['marker', 'markers', 'antigen', 'target', 'targets'].includes(item.header) && item.index !== fluorCol);
    const markerCol = markerHeaderHits[0]?.index ?? (maxCols > 1
        ? Array.from({ length: maxCols }, (_, index) => index).find(index => index !== fluorCol && fluorScores[index] === 0)
        : undefined);

    const imported: ImportedPanelRow[] = [];
    const diagnostics: PanelImportDiagnostic[] = [];
    const seen = new Set<string>();
    const firstSourceRowByFluor = new Map<string, number>();
    dataRows.forEach(row => {
        const rawFluorophore = (row.values[fluorCol] || '').trim();
        if (!rawFluorophore) {
            diagnostics.push({
                sourceRow: row.sourceRow,
                rawFluorophore,
                canonicalFluorophore: null,
                status: 'invalid',
                reason: 'The fluorophore cell is empty.',
            });
            return;
        }
        const fluor = matchImportedFluor(rawFluorophore, lookup);
        if (!fluor) {
            diagnostics.push({
                sourceRow: row.sourceRow,
                rawFluorophore,
                canonicalFluorophore: null,
                status: 'unsupported',
                reason: 'The fluorophore is not available for the selected cytometer configuration.',
            });
            return;
        }
        if (seen.has(fluor)) {
            diagnostics.push({
                sourceRow: row.sourceRow,
                rawFluorophore,
                canonicalFluorophore: fluor,
                status: 'duplicate',
                reason: `This fluorophore duplicates row ${firstSourceRowByFluor.get(fluor)}.`,
            });
            return;
        }
        const marker = markerCol === undefined ? '' : (row.values[markerCol] || '').trim();
        if (marker.length > maxMarkerLength) {
            diagnostics.push({
                sourceRow: row.sourceRow,
                rawFluorophore,
                canonicalFluorophore: fluor,
                status: 'invalid',
                reason: `The marker name exceeds the maximum length of ${maxMarkerLength} characters.`,
            });
            return;
        }
        seen.add(fluor);
        firstSourceRowByFluor.set(fluor, row.sourceRow);
        diagnostics.push({
            sourceRow: row.sourceRow,
            rawFluorophore,
            canonicalFluorophore: fluor,
            status: 'accepted',
            reason: 'Recognized fluorophore.',
        });
        imported.push({
            fluor,
            marker,
        });
    });

    const result = { rows: imported, diagnostics };
    const rejected = diagnostics.filter(diagnostic => diagnostic.status !== 'accepted');
    const details = rejected.slice(0, 20).map(diagnostic => (
        `row ${diagnostic.sourceRow} ${JSON.stringify(diagnostic.rawFluorophore || '(blank)')}: ${diagnostic.reason}`
    )).join('; ')
        + (rejected.length > 20 ? `; ${rejected.length - 20} additional row(s) omitted.` : '');
    if (imported.length === 0 && rejected.length > 0) {
        throw new PanelImportValidationError(
            `No known fluorophores were recognized in the imported CSV for the selected cytometer. ${details}`,
            result,
        );
    }
    if (rejected.length > 0) {
        throw new PanelImportValidationError(`Panel CSV import rejected ${rejected.length} row(s): ${details}`, result);
    }
    if (imported.length === 0) {
        throw new Error('No known fluorophores were recognized in the imported CSV for the selected cytometer.');
    }
    return result;
};

const validatePanelFluorophores = (
    requested: string[],
    fluorophores: FluorInfo[],
): PanelFluorophoreValidation => {
    const lookup = buildFluorLookup(fluorophores);
    const accepted: string[] = [];
    const diagnostics: PanelFluorophoreDiagnostic[] = [];
    const seen = new Map<string, string>();
    requested.map(value => value.trim()).filter(Boolean).forEach((requestedFluorophore) => {
        const canonical = matchImportedFluor(requestedFluorophore, lookup);
        if (!canonical) {
            diagnostics.push({
                requested: requestedFluorophore,
                canonicalFluorophore: null,
                status: 'unrecognized',
                reason: 'The fluorophore is not available for the selected cytometer configuration.',
            });
            return;
        }
        const identity = fluorophoreIdentity(canonical);
        const firstRequested = seen.get(identity);
        if (firstRequested) {
            diagnostics.push({
                requested: requestedFluorophore,
                canonicalFluorophore: canonical,
                status: 'duplicate',
                reason: `This fluorophore duplicates "${firstRequested}".`,
            });
            return;
        }
        seen.set(identity, requestedFluorophore);
        accepted.push(canonical);
    });
    return { accepted, diagnostics };
};

const getCytometerName = (val: unknown): string => {
    if (!val) return '';
    if (Array.isArray(val)) return String(val[0] || '');
    return String(val);
};

const binEmission = (val: number, cyt: string): number => {
    const c = getCytometerName(cyt).toLowerCase();
    if (c === 'id7000') {
        return Math.round(val / 20) * 20;
    }
    if (c === 'discover' || c === 'xenith') {
        return Math.round(val / 15) * 15;
    }
    return val;
};

export {
    PdfIcon,
    bandColor,
    assertPanelSlotsWithinCapacity,
    assertPanelMarkersWithinCapacity,
    binEmission,
    buildFluorLookup,
    csvEscape,
    detectorColumnCenterX,
    detectorPointX,
    detectImportedPanelRows,
    emptySlots,
    formatMetric,
    getCytometerName,
    getSimilarityStyle,
    laserLabel,
    laserOrder,
    laserWavelength,
    linePath,
    mapDetectorToEmission,
    matchImportedFluor,
    normalizeMarkers,
    signatureBandBins,
    signatureY,
    toNumber,
    toSimilarityValue,
    unique,
    unboxGuiState,
    validatePanelFluorophores,
    wavelengthToColor,
    isResponseMatrixProvenance,
    responseMatrixProvenance,
    responseProvenanceForCytometer,
    responseProvenanceForMeasurementMode,
    responseMeasurementModeForCytometer,
    responseProvenanceMatchesPayload,
    responseProvenanceForPayload,
    responseProvenanceWarningForPayload,
    RESPONSE_PROVENANCE_CONTRACT_VERSION,
    WIZARD_SCORING_VERSION,
};
export type {
    ConfigurationInfo,
    DetectorInfo,
    FluorInfo,
    ImportedPanelRow,
    ImportedPanelRows,
    LibraryInfo,
    NumericRow,
    PanelFluorophoreDiagnostic,
    PanelFluorophoreValidation,
    PanelImportDiagnostic,
    PanelMeasurementMode,
    PanelPayload,
    ResponseMatrixProvenance,
    ResponseMatrixProvenanceClass,
    TabId,
};
export { PanelImportValidationError };
