/* eslint-disable react-refresh/only-export-components -- pure visualization helpers share the component's domain contract */
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type {
    CSSProperties,
    Dispatch,
    KeyboardEvent as ReactKeyboardEvent,
    PointerEvent as ReactPointerEvent,
    SetStateAction,
} from 'react';
import { GripVertical } from 'lucide-react';
import { DetectorSpectrumAxis } from './DetectorSpectrumAxis';
import { SpectrumBandPlot } from './SpectrumBandPlot';
import {
    detectorAxisChartWidth,
    detectorAxisDisplayWidth,
    detectorAxisFooterHeight,
    detectorLaserKey,
    detectorLaserMeta,
    detectorSignatureChartWidth,
} from './detectorAxis';
import {
    DEFAULT_PLOT_SCALE,
    MAX_PLOT_SCALE,
    MIN_PLOT_SCALE,
} from './projectStore';
import {
    detectorPointX,
    formatMetric,
    getSimilarityStyle,
    laserLabel,
    laserWavelength,
    linePath,
    toSimilarityValue,
    responseProvenanceForPayload,
    responseProvenanceWarningForPayload,
} from './panelBuilderShared';
import type {
    CollinearityDiagnostic,
    NumericRow,
    PanelPayload,
    TabId,
} from './panelBuilderShared';

export interface SelectedPanelEntry {
    fluor: string;
    slotIndex: number;
    marker: string;
    color: string;
    peakLaser: string;
    peakEmission: number;
}

interface PanelVisualizationsProps {
    payload: PanelPayload;
    selected: string[];
    selectedEntries: SelectedPanelEntry[];
    emissions: number[];
    lasers: string[];
    tab: TabId;
    setTab: Dispatch<SetStateAction<TabId>>;
    onMarkerChange: (slotIndex: number, value: string) => void;
    spectraByName: Map<string, NumericRow>;
    similarityByName: Map<string, NumericRow>;
    colorByFluor: Map<string, string>;
    hoveredFluor: string | null;
    theme: 'light' | 'dark';
    error: string;
    plotScale: number;
    onPlotScaleChange: (scale: number) => void;
    readOnly?: boolean;
}

type SpectrumResizeEdge = 'left' | 'right';

const PLOT_RESIZE_KEYBOARD_STEP = 10;

function formatHotspotValue(value: number): string {
    if (!Number.isFinite(value)) return 'NA';
    if (value >= 100) return value.toExponential(2);
    if (value >= 10) return value.toFixed(1);
    return value.toFixed(2);
}

function getHotspotStyle(
    value: number,
    isDiagonal: boolean,
    diagnostic: CollinearityDiagnostic,
    theme: 'light' | 'dark',
): CSSProperties {
    if (isDiagonal) {
        return {
            background: 'var(--bg-cell-diag)',
            color: theme === 'dark' ? '#fff' : '#111',
        };
    }
    const maximum = diagnostic.hotspotMatrix.flat().reduce(
        (current, candidate) => Number.isFinite(candidate) ? Math.max(current, candidate) : current,
        0,
    );
    const intensity = maximum > 0 ? Math.log1p(Math.max(0, value)) / Math.log1p(maximum) : 0;
    const hue = 214 - Math.min(1, intensity) * 174;
    const lightness = theme === 'dark' ? 31 - intensity * 9 : 94 - intensity * 47;
    return {
        background: `hsl(${hue.toFixed(1)} 82% ${Math.max(18, lightness).toFixed(1)}%)`,
        color: intensity > 0.58 ? '#fffaf4' : theme === 'dark' ? '#f3f6ff' : '#172033',
        textShadow: intensity > 0.7 ? '0 1px 2px rgba(0, 0, 0, 0.35)' : 'none',
    };
}

export function resolveSpectrumHover(
    spectrumHover: { fluor: string } | null,
    hoveredFluor: string | null,
): string | null {
    return spectrumHover?.fluor ?? hoveredFluor;
}

export function entriesForLaser<T>(entriesByLaser: Map<string, T[]>, laser: string): T[] {
    return entriesByLaser.get(laser) || [];
}

export function observeSpectrumPlot(
    plot: HTMLDivElement | null,
    onWidth: (width: number) => void,
): (() => void) | undefined {
    if (!plot) return undefined;
    const updateWidth = () => {
        const nextWidth = Math.round(plot.getBoundingClientRect().width);
        if (nextWidth > 0) onWidth(nextWidth);
    };
    updateWidth();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(updateWidth);
    observer.observe(plot);
    return () => observer.disconnect();
}

export function withSpectrumPlotResizeTarget(
    plot: HTMLDivElement | null,
    onReady: (plot: HTMLDivElement) => void,
): void {
    if (!plot) return;
    onReady(plot);
}

export const PanelVisualizations = memo(function PanelVisualizations({
    payload,
    selected,
    selectedEntries,
    emissions,
    lasers,
    tab,
    setTab,
    onMarkerChange,
    spectraByName,
    similarityByName,
    colorByFluor,
    hoveredFluor,
    theme,
    error,
    plotScale,
    onPlotScaleChange,
    readOnly = false,
}: PanelVisualizationsProps) {
    const tabContentRef = useRef<HTMLElement>(null);
    const spectrumContainerRef = useRef<HTMLDivElement>(null);
    const spectrumPlotRef = useRef<HTMLDivElement>(null);
    const spectrumResizeCleanupRef = useRef<(() => void) | null>(null);
    const spectrumTooltipRef = useRef<HTMLDivElement>(null);
    const spectrumPointerRef = useRef({ clientX: 0, clientY: 0 });
    const [spectrumHover, setSpectrumHover] = useState<{ fluor: string; color: string } | null>(null);
    const [matrixView, setMatrixView] = useState<'similarity' | 'hotspot'>('similarity');
    const baseChartWidth = detectorAxisChartWidth(payload.detectors.length);
    const signatureChartWidth = detectorSignatureChartWidth(payload.detectors.length);
    const compactDisplayWidth = detectorAxisDisplayWidth(payload.detectors.length, payload.measurement_mode);
    const chartHeight = 230;
    const spectrumHeight = chartHeight + detectorAxisFooterHeight(payload.detectors);
    const plotZoom = `${(plotScale / DEFAULT_PLOT_SCALE) * 100}%`;
    const spectrumDisplayWidth = compactDisplayWidth === null
        ? plotZoom
        : `${Math.round(compactDisplayWidth * plotScale / DEFAULT_PLOT_SCALE)}px`;
    const fallbackSpectrumWidth = compactDisplayWidth ?? baseChartWidth;
    const [measuredSpectrumWidth, setMeasuredSpectrumWidth] = useState<number | null>(null);
    const spectrumWidth = measuredSpectrumWidth ?? fallbackSpectrumWidth;
    const spectrumLeft = 42;
    const spectrumRight = spectrumWidth - 8;
    const spectrumPlotWidth = spectrumRight - spectrumLeft;
    const responseProvenance = responseProvenanceForPayload(
        payload.cytometer,
        payload.measurement_mode,
        payload.response_provenance,
    );
    const responseProvenanceWarning = responseProvenanceWarningForPayload(
        payload.cytometer,
        payload.measurement_mode,
        payload.response_provenance,
    );
    const responseLabel = responseProvenance.class === 'synthetic_filter_proxy'
        ? 'detector peaks'
        : responseProvenance.class === 'measured_detector_response'
            ? 'detector responses'
            : 'spectra';
    const signatureTabLabel = responseProvenance.class === 'synthetic_filter_proxy'
        ? 'PEAKS'
        : responseProvenance.class === 'measured_detector_response'
            ? 'RESPONSES'
            : 'SPECTRA';
    const complexityLabel = responseProvenance.class === 'synthetic_filter_proxy'
        ? 'Planning-proxy complexity'
        : responseProvenance.class === 'measured_detector_response'
            ? 'Detector-response complexity'
            : 'Complexity Index';
    const hotspotDiagnostic = payload.collinearity;
    const hotspotEligible = responseProvenance.class !== 'synthetic_filter_proxy' && hotspotDiagnostic !== undefined;
    const hotspotSelectionComplete = hotspotDiagnostic?.status === 'ok'
        && hotspotDiagnostic.endmembers.length === selected.length
        && hotspotDiagnostic.endmembers.every((name, index) => name === selected[index]);

    useEffect(() => {
        if (!hotspotEligible) setMatrixView('similarity');
    }, [hotspotEligible]);

    useEffect(() => {
        tabContentRef.current?.scrollTo({ top: 0, left: 0 });
    }, [tab]);

    useLayoutEffect(() => {
        return observeSpectrumPlot(spectrumPlotRef.current, (nextWidth) => {
            setMeasuredSpectrumWidth((current) => current === nextWidth ? current : nextWidth);
        });
    }, []);

    useEffect(() => () => spectrumResizeCleanupRef.current?.(), []);

    const beginSpectrumResize = (
        edge: SpectrumResizeEdge,
        event: ReactPointerEvent<HTMLDivElement>,
    ) => {
        event.preventDefault();
        spectrumResizeCleanupRef.current?.();

        const handle = event.currentTarget;
        withSpectrumPlotResizeTarget(spectrumPlotRef.current, (measuredPlot) => {
            const startX = event.clientX;
            const startScale = plotScale;
            const startWidth = measuredPlot.getBoundingClientRect().width;
            const pointerId = event.pointerId;
            const previousCursor = document.body.style.cursor;
            const previousUserSelect = document.body.style.userSelect;
            let nextScale = startScale;
            let animationFrame = 0;

            const applyScale = () => {
                animationFrame = 0;
                onPlotScaleChange(nextScale);
            };
            const queueScale = () => {
                if (!animationFrame) animationFrame = window.requestAnimationFrame(applyScale);
            };
            const move = (moveEvent: PointerEvent) => {
                if (startWidth <= 0) return;
                const signedDelta = edge === 'right'
                    ? moveEvent.clientX - startX
                    : startX - moveEvent.clientX;
                nextScale = Math.min(
                    MAX_PLOT_SCALE,
                    Math.max(
                        MIN_PLOT_SCALE,
                        Math.round(startScale * (startWidth + signedDelta) / startWidth),
                    ),
                );
                queueScale();
            };
            const cleanup = () => {
                handle.removeEventListener('pointermove', move);
                handle.removeEventListener('pointerup', finish);
                handle.removeEventListener('pointercancel', finish);
                if (animationFrame) {
                    window.cancelAnimationFrame(animationFrame);
                    applyScale();
                }
                if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
                measuredPlot.classList.remove('is-resizing');
                handle.classList.remove('is-resizing');
                document.body.style.cursor = previousCursor;
                document.body.style.userSelect = previousUserSelect;
                spectrumResizeCleanupRef.current = null;
            };
            const finish = () => {
                cleanup();
                onPlotScaleChange(nextScale);
            };

            measuredPlot.classList.add('is-resizing');
            handle.classList.add('is-resizing');
            document.body.style.cursor = 'ew-resize';
            document.body.style.userSelect = 'none';
            handle.setPointerCapture(pointerId);
            handle.addEventListener('pointermove', move);
            handle.addEventListener('pointerup', finish);
            handle.addEventListener('pointercancel', finish);
            spectrumResizeCleanupRef.current = cleanup;
        });
    };

    const resizeSpectrumByKeyboard = (edge: SpectrumResizeEdge, event: ReactKeyboardEvent<HTMLDivElement>) => {
        const direction = event.key === 'ArrowRight'
            ? edge === 'right' ? 1 : -1
            : event.key === 'ArrowLeft'
                ? edge === 'left' ? 1 : -1
                : 0;
        if (!direction && event.key !== 'Home' && event.key !== 'End') return;
        event.preventDefault();
        onPlotScaleChange(
            event.key === 'Home'
                ? MIN_PLOT_SCALE
                : event.key === 'End'
                    ? MAX_PLOT_SCALE
                    : Math.min(MAX_PLOT_SCALE, Math.max(MIN_PLOT_SCALE, plotScale + direction * PLOT_RESIZE_KEYBOARD_STEP)),
        );
    };

    const positionSpectrumTooltip = (clientX: number, clientY: number) => {
        const container = spectrumContainerRef.current;
        const tooltip = spectrumTooltipRef.current;
        if (!container || !tooltip) return;
        const bounds = container.getBoundingClientRect();
        const visibleX = Math.max(0, Math.min(bounds.width, clientX - bounds.left));
        const visibleY = Math.max(0, Math.min(bounds.height, clientY - bounds.top));
        const x = visibleX + container.scrollLeft;
        const y = visibleY + container.scrollTop;
        tooltip.style.left = `${x}px`;
        tooltip.style.top = `${y}px`;
        tooltip.classList.toggle('opens-left', visibleX > bounds.width - 190);
    };

    const showSpectrumTooltip = (
        fluor: string,
        color: string,
        event: ReactPointerEvent<SVGPathElement>,
    ) => {
        spectrumPointerRef.current = { clientX: event.clientX, clientY: event.clientY };
        setSpectrumHover({ fluor, color });
        window.requestAnimationFrame(() => positionSpectrumTooltip(event.clientX, event.clientY));
    };

    const moveSpectrumTooltip = (event: ReactPointerEvent<SVGPathElement>) => {
        spectrumPointerRef.current = { clientX: event.clientX, clientY: event.clientY };
        positionSpectrumTooltip(event.clientX, event.clientY);
    };

    useEffect(() => {
        if (!spectrumHover) return;
        positionSpectrumTooltip(
            spectrumPointerRef.current.clientX,
            spectrumPointerRef.current.clientY,
        );
    }, [spectrumHover]);

    return (
<main
    className={`main-panel${error ? ' has-error' : ''}`}
    style={{
        '--plot-zoom': plotZoom,
        '--spectrum-display-width': spectrumDisplayWidth,
        '--spectrum-display-height': `${spectrumHeight}px`,
    } as CSSProperties}
>
    <div className="top-spectrum" ref={spectrumContainerRef}>
        <div
            className="spectrum-plot-shell"
            ref={spectrumPlotRef}
            style={{ '--spectrum-display-width': spectrumDisplayWidth } as CSSProperties}
        >
            <div
                className="spectrum-plot-resize-handle spectrum-plot-resize-handle-left"
                role="separator"
                aria-label="Resize spectrum plot from left edge"
                aria-orientation="vertical"
                aria-valuemin={MIN_PLOT_SCALE}
                aria-valuemax={MAX_PLOT_SCALE}
                aria-valuenow={Math.round(plotScale)}
                tabIndex={0}
                onPointerDown={(event) => beginSpectrumResize('left', event)}
                onKeyDown={(event) => resizeSpectrumByKeyboard('left', event)}
            >
                <GripVertical className="spectrum-plot-resize-icon" size={16} strokeWidth={1.8} aria-hidden="true" />
            </div>
            <svg
                className="spectrum-svg"
                width={spectrumWidth}
                height={spectrumHeight}
                viewBox={`0 0 ${spectrumWidth} ${spectrumHeight}`}
                role="img"
                aria-label={`Combined ${responseLabel}`}
            >
            {[0, 25, 50, 75, 100].map(tick => {
                const y = chartHeight - (tick / 100) * (chartHeight - 32) - 24;
                return (
                    <g key={tick}>
                        <line x1={spectrumLeft} y1={y} x2={spectrumRight} y2={y} stroke="var(--chart-grid)" strokeWidth={1} />
                        <text x={28} y={y + 4} fontSize={12} textAnchor="end" className="chart-axis-text">{tick}</text>
                    </g>
                );
            })}
            <DetectorSpectrumAxis
                entries={payload.detectors}
                cytometer={payload.cytometer}
                xForIndex={(index) => detectorPointX(index, payload.detectors.length, spectrumLeft, spectrumPlotWidth)}
                left={spectrumLeft}
                right={spectrumRight}
                plotTop={6}
                baselineY={chartHeight - 24}
                gridColor="var(--chart-grid)"
                axisColor="var(--chart-axis)"
                textColor="var(--text-muted)"
                gradientId="panel-detector-spectrum"
            />
            {selected.map(fluor => {
                const row = spectraByName.get(fluor);
                if (!row) return null;
                const effectiveHoveredFluor = resolveSpectrumHover(spectrumHover, hoveredFluor);
                const isHovered = effectiveHoveredFluor === fluor;
                const hasHoverActive = effectiveHoveredFluor !== null;
                const fluorColor = colorByFluor.get(fluor) || '#2688e8';
                const pathData = linePath(row, payload.detectors, spectrumPlotWidth, chartHeight, spectrumLeft);
                return (
                    <g key={fluor}>
                        <path
                            className="spectrum-visible-line"
                            data-fluorophore={fluor}
                            d={pathData}
                            fill="none"
                            stroke={fluorColor}
                            strokeWidth={isHovered ? 4.2 : 2.4}
                            strokeLinejoin="round"
                            strokeLinecap="round"
                            opacity={hasHoverActive ? (isHovered ? 1.0 : 0.15) : 0.92}
                            style={{
                                transition: 'all 0.15s ease-in-out',
                                pointerEvents: 'none',
                                filter: isHovered ? `drop-shadow(0 0 5px ${fluorColor})` : 'none'
                            }}
                        />
                        <path
                            className="spectrum-hit-target"
                            data-fluorophore={fluor}
                            d={pathData}
                            fill="none"
                            stroke="transparent"
                            strokeWidth={22}
                            strokeLinejoin="round"
                            strokeLinecap="round"
                            onPointerEnter={(event) => showSpectrumTooltip(fluor, fluorColor, event)}
                            onPointerMove={moveSpectrumTooltip}
                            onPointerLeave={() => setSpectrumHover(null)}
                            style={{
                                cursor: 'pointer',
                                pointerEvents: 'stroke'
                            }}
                        />
                    </g>
                );
            })}
            </svg>
            <div
                className="spectrum-plot-resize-handle spectrum-plot-resize-handle-right"
                role="separator"
                aria-label="Resize spectrum plot from right edge"
                aria-orientation="vertical"
                aria-valuemin={MIN_PLOT_SCALE}
                aria-valuemax={MAX_PLOT_SCALE}
                aria-valuenow={Math.round(plotScale)}
                tabIndex={0}
                onPointerDown={(event) => beginSpectrumResize('right', event)}
                onKeyDown={(event) => resizeSpectrumByKeyboard('right', event)}
            >
                <GripVertical className="spectrum-plot-resize-icon" size={16} strokeWidth={1.8} aria-hidden="true" />
            </div>
        </div>
        {spectrumHover && (
            <div
                ref={spectrumTooltipRef}
                className="spectrum-cursor-tooltip"
                role="tooltip"
            >
                <span
                    className="spectrum-cursor-tooltip-swatch"
                    style={{ background: spectrumHover.color }}
                />
                {spectrumHover.fluor}
            </div>
        )}
    </div>

    <div className="response-provenance-banner" role="note">
        <strong>{responseProvenance.label}</strong>
        <span>{responseProvenance.method}. Source: {responseProvenance.source}. {responseProvenance.limitation}</span>
        {responseProvenanceWarning && <span role="alert">Warning: {responseProvenanceWarning}</span>}
    </div>

    <div className="tabs-bar">
        <button className={`tab-button ${tab === 'panel' ? 'active' : ''}`} onClick={() => setTab('panel')}>PANEL</button>
        <button className={`tab-button ${tab === 'similarity' ? 'active' : ''}`} onClick={() => setTab('similarity')}>SIMILARITY</button>
        <button className={`tab-button ${tab === 'signatures' ? 'active' : ''}`} onClick={() => setTab('signatures')}>{signatureTabLabel}</button>
        <div style={{ flex: 1 }} />
        <div className="complexity-badge">{complexityLabel}: {formatMetric(payload.complexity_index)}</div>
    </div>

    {error && <div className="error-state" role="alert" aria-live="assertive">{error}</div>}

    <section className="tab-content" ref={tabContentRef}>
        {tab === 'panel' && (
            <div className="panel-matrix-wrap">
                <table className="panel-matrix">
                    <thead>
                        <tr>
                            <th className="emission-head" />
                            {lasers.map(laser => {
                                const laserKey = detectorLaserKey({ detector: laser, laser });
                                const laserMeta = detectorLaserMeta(laserKey, payload.cytometer);
                                return (
                                    <th
                                        className="laser-head"
                                        data-laser-key={laserKey}
                                        key={laser}
                                        colSpan={2}
                                        style={{ background: laserMeta.color, color: laserMeta.textColor }}
                                    >
                                        {laserLabel(laser)}
                                    </th>
                                );
                            })}
                        </tr>
                        <tr>
                            <th className="emission-head">Emission</th>
                            {lasers.flatMap(laser => [
                                <th key={`${laser}-marker`}>Marker</th>,
                                <th key={`${laser}-fluor`}>Fluorophore</th>,
                            ])}
                        </tr>
                    </thead>
                    <tbody>
                        {emissions.flatMap(emission => {
                            const laserEntriesMap = new Map<string, typeof selectedEntries>();
                            lasers.forEach(laser => {
                                const entries = selectedEntries.filter(entry => entry.peakLaser === laser && entry.peakEmission === emission);
                                laserEntriesMap.set(laser, entries);
                            });
                            const maxEntries = Math.max(1, ...lasers.map(laser => laserEntriesMap.get(laser)?.length || 0));

                            return Array.from({ length: maxEntries }).map((_, subIndex) => (
                                <tr key={`${emission}-${subIndex}`}>
                                    {subIndex === 0 ? (
                                        <td className="emission-cell" rowSpan={maxEntries}>{emission}</td>
                                    ) : null}
                                    {lasers.flatMap(laser => {
                                        const entries = entriesForLaser(laserEntriesMap, laser);
                                        const entry = entries[subIndex];
                                        const occupied = !!entry;
                                        const isImpossible = emission < laserWavelength(laser);
                                        const cellClass = occupied ? '' : (isImpossible ? 'impossible-region' : 'empty-region');

                                        return [
                                            <td key={`${emission}-${laser}-marker-${subIndex}`} className={cellClass}>
                                                {!isImpossible && occupied && (
                                                    <input
                                                        key={entry.slotIndex}
                                                        className="matrix-marker-input"
                                                        value={entry.marker}
                                                        placeholder="Marker"
                                                        disabled={readOnly}
                                                        onChange={event => {
                                                            const val = event.target.value;
                                                            onMarkerChange(entry.slotIndex, val);
                                                        }}
                                                    />
                                                )}
                                            </td>,
                                            <td key={`${emission}-${laser}-fluor-${subIndex}`} className={cellClass}>
                                                {!isImpossible && occupied && (
                                                    <span className="matrix-fluor" key={entry.slotIndex} style={{ color: entry.color }}>{entry.fluor}</span>
                                                )}
                                            </td>,
                                        ];
                                    })}
                                </tr>
                            ));
                        })}
                    </tbody>
                </table>
            </div>
        )}

        {tab === 'similarity' && (
            <div>
                <div className="matrix-view-toggle" role="group" aria-label="Similarity matrix view">
                    <button
                        type="button"
                        className={matrixView === 'similarity' ? 'active' : ''}
                        aria-pressed={matrixView === 'similarity'}
                        onClick={() => setMatrixView('similarity')}
                    >
                        Similarity
                    </button>
                    {hotspotEligible && (
                        <button
                            type="button"
                            className={matrixView === 'hotspot' ? 'active' : ''}
                            aria-pressed={matrixView === 'hotspot'}
                            onClick={() => setMatrixView('hotspot')}
                        >
                            Hotspot
                        </button>
                    )}
                    {matrixView === 'hotspot' && hotspotSelectionComplete && hotspotDiagnostic.maxSif !== null && (
                        <span className="matrix-view-summary">
                            Max SIF {formatHotspotValue(hotspotDiagnostic.maxSif)} · {hotspotDiagnostic.maxSifEndmember ?? 'unknown'}
                        </span>
                    )}
                </div>
                <div className="similarity-wrap">
                    {matrixView === 'hotspot' ? (
                        selected.length === 0 ? (
                            <div className="empty-state">Select fluorophores to calculate hotspot/SIF.</div>
                        ) : !hotspotSelectionComplete ? (
                            <div className="empty-state" role="status">
                                {hotspotDiagnostic?.reason || 'Exact hotspot/SIF is unavailable for the selected fluorophores.'}
                            </div>
                        ) : (
                            <table className="similarity-table hotspot-table" aria-label="Exact fluorophore hotspot matrix">
                                <tbody>
                                    {selected.map((rowName, rowIndex) => {
                                        const diagnosticRowIndex = hotspotDiagnostic.endmembers.indexOf(rowName);
                                        return (
                                            <tr key={rowName}>
                                                <th className="row-label">{rowName}</th>
                                                {selected.map((colName, colIndex) => {
                                                    if (colIndex > rowIndex) return null;
                                                    const diagnosticColumnIndex = hotspotDiagnostic.endmembers.indexOf(colName);
                                                    const value = hotspotDiagnostic.hotspotMatrix[diagnosticRowIndex]?.[diagnosticColumnIndex];
                                                    if (value === undefined) return null;
                                                    return (
                                                        <td
                                                            key={colName}
                                                            style={getHotspotStyle(value, rowName === colName, hotspotDiagnostic, theme)}
                                                        >
                                                            {formatHotspotValue(value)}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        );
                                    })}
                                    <tr>
                                        <th className="axis-corner" aria-hidden="true" />
                                        {selected.map(name => (
                                            <th className="col-label" key={name}><span className="rotated-label">{name}</span></th>
                                        ))}
                                    </tr>
                                </tbody>
                            </table>
                        )
                    ) : selected.length === 0 ? (
                        <div className="empty-state">Select fluorophores to calculate similarity.</div>
                    ) : (
                        <table className="similarity-table" aria-label="Fluorophore similarity matrix">
                            <tbody>
                                {selected.map((rowName, rowIndex) => (
                                    <tr key={rowName}>
                                        <th className="row-label">{rowName}</th>
                                        {selected.map((colName, colIndex) => {
                                            if (colIndex > rowIndex) return null;
                                            const value = rowName === colName ? 1 : toSimilarityValue(similarityByName.get(rowName)?.[colName]);
                                            const cellStyle = getSimilarityStyle(value, rowName === colName, theme);
                                            return (
                                                <td key={colName} style={cellStyle}>
                                                    {value.toFixed(value === 1 ? 0 : 2)}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                                <tr>
                                    <th className="axis-corner" aria-hidden="true" />
                                    {selected.map(name => (
                                        <th className="col-label" key={name}><span className="rotated-label">{name}</span></th>
                                    ))}
                                </tr>
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        )}

        {tab === 'signatures' && (
            <div className="signatures-wrap">
                {selected.length === 0 ? (
                    <div className="empty-state">Select fluorophores to view {responseLabel}.</div>
                ) : selected.map((fluor, index) => {
                    const row = spectraByName.get(fluor);
                    if (!row) return null;

                    return (
                        <div className="signature-card" key={fluor}>
                            <h3>{fluor}</h3>
                            <SpectrumBandPlot
                                fluorophore={fluor}
                                row={row}
                                detectors={payload.detectors}
                                chartWidth={signatureChartWidth}
                                theme={theme}
                                eager={index < 2}
                            />
                        </div>
                    );
                })}
            </div>
        )}
    </section>
</main>
    );
});
