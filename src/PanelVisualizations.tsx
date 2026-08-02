import { memo, useEffect, useRef, useState } from 'react';
import type { CSSProperties, Dispatch, PointerEvent as ReactPointerEvent, SetStateAction } from 'react';
import { DetectorSpectrumAxis } from './DetectorSpectrumAxis';
import { SpectrumBandPlot } from './SpectrumBandPlot';
import {
    detectorAxisChartWidth,
    detectorAxisFooterHeight,
    detectorLaserKey,
    detectorLaserMeta,
} from './detectorAxis';
import { DEFAULT_PLOT_SCALE } from './projectStore';
import {
    detectorPointX,
    formatMetric,
    getSimilarityStyle,
    laserLabel,
    laserWavelength,
    linePath,
    toSimilarityValue,
} from './panelBuilderShared';
import type { NumericRow, PanelPayload, TabId } from './panelBuilderShared';

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
}: PanelVisualizationsProps) {
    const tabContentRef = useRef<HTMLElement>(null);
    const spectrumContainerRef = useRef<HTMLDivElement>(null);
    const spectrumTooltipRef = useRef<HTMLDivElement>(null);
    const spectrumPointerRef = useRef({ clientX: 0, clientY: 0 });
    const [spectrumHover, setSpectrumHover] = useState<{ fluor: string; color: string } | null>(null);
    const chartWidth = detectorAxisChartWidth(payload.detectors.length);
    const chartHeight = 230;
    const spectrumHeight = chartHeight + detectorAxisFooterHeight(payload.detectors);
    const plotZoom = `${(plotScale / DEFAULT_PLOT_SCALE) * 100}%`;
    const spectrumLeft = 42;
    const spectrumRight = chartWidth - 8;
    const spectrumPlotWidth = spectrumRight - spectrumLeft;

    useEffect(() => {
        tabContentRef.current?.scrollTo({ top: 0, left: 0 });
    }, [tab]);

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
<main className="main-panel" style={{ '--plot-zoom': plotZoom } as CSSProperties}>
    <div className="top-spectrum" ref={spectrumContainerRef}>
        <svg className="spectrum-svg" width={chartWidth} height={spectrumHeight} viewBox={`0 0 ${chartWidth} ${spectrumHeight}`} role="img" aria-label="Combined spectra">
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
                const effectiveHoveredFluor = spectrumHover?.fluor ?? hoveredFluor;
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

    <div className="tabs-bar">
        <button className={`tab-button ${tab === 'panel' ? 'active' : ''}`} onClick={() => setTab('panel')}>PANEL OVERVIEW</button>
        <button className={`tab-button ${tab === 'similarity' ? 'active' : ''}`} onClick={() => setTab('similarity')}>SIMILARITY INDICES</button>
        <button className={`tab-button ${tab === 'signatures' ? 'active' : ''}`} onClick={() => setTab('signatures')}>SPECTRA</button>
        <div style={{ flex: 1 }} />
        <div className="complexity-badge">Complexity Index: {formatMetric(payload.complexity_index)}</div>
    </div>

    {error && <div className="error-state">{error}</div>}

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
                                        const entries = laserEntriesMap.get(laser) || [];
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
                <div className="similarity-wrap">
                    {selected.length === 0 ? (
                        <div className="empty-state">Select fluorophores to calculate similarity indices.</div>
                    ) : (
                        <table className="similarity-table">
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
                                    <th />
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
                    <div className="empty-state">Select fluorophores to view spectra.</div>
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
                                chartWidth={chartWidth}
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
