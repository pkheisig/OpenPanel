import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { ArrowLeft, ChevronDown, Download, FileJson2, FileSpreadsheet, Minus, Moon, PanelLeftClose, PanelLeftOpen, Plus, Redo2, Sun, Trash2, Undo2, Upload, WandSparkles, X } from 'lucide-react';
import './PanelBuilder.css';
import { ClearPanelConfirmation } from './ClearPanelConfirmation';
import { ModuleLoadingState } from './ModuleLoadingState';
import type { WizardApplication } from './PanelWizard';
import { PanelVisualizations } from './PanelVisualizations';
import { rankUiSelectOptions } from './uiSelectSearch';
import { openTextFile, projectJsonFilename, saveBlob } from './browserFiles';
import { writeLocalStorage } from './browserStorage';
import { buildPanelPayload } from './spectralEngine';
import {
    parseProject,
    DEFAULT_PLOT_SCALE,
    MAX_PLOT_SCALE,
    MIN_PLOT_SCALE,
    saveActiveProject,
    savePanelProject,
    serializeProject,
} from './projectStore';
import type { CytometerPanelState, ProjectState } from './projectStore';
import type { WizardProjectState } from './panelWizardEngine';
import {
    PdfIcon,
    binEmission,
    csvEscape,
    detectImportedPanelRows,
    emptySlots,
    getCytometerName,
    laserOrder,
    mapDetectorToEmission,
    unique,
} from './panelBuilderShared';
import { createRefreshSequence } from './refreshSequence';
import { readThemePreference, saveThemePreference } from './themePreference';
import type {
    FluorInfo,
    NumericRow,
    PanelPayload,
    TabId,
} from './panelBuilderShared';

type PanelBuilderProps = {
    embedded?: boolean;
    cockpitTheme?: 'light' | 'dark' | null;
    projectPath?: string;
    projectRevision?: string;
    initialCytometer?: string;
    initialConfiguration?: string;
    initialProject?: ProjectState;
    projectId?: string;
    projectName?: string;
    onRequestExit?: () => void | Promise<void>;
};

const MIN_SIDEBAR_WIDTH = 180;
const MAX_SIDEBAR_WIDTH = 440;
const SIDEBAR_KEYBOARD_STEP = 12;
const MAX_PANEL_HISTORY = 100;

const panelCapacityMessage = (colorCount: number, detectorCount: number) => (
    `This panel has ${colorCount} colors, but the selected configuration has only ${detectorCount} detectors. Remove colors before calculating or adding to the panel.`
);
const loadPanelWizard = () => import('./PanelWizard');
const PanelWizard = lazy(() => loadPanelWizard().then((module) => ({ default: module.PanelWizard })));

type PanelEditSnapshot = {
    slots: string[];
    markers: Record<number, string>;
    wizard: WizardProjectState | null;
};

const PanelBuilder = ({
    embedded = false,
    cockpitTheme = null,
    initialCytometer = 'aurora',
    initialConfiguration = '5l_uv_v_b_yg_r',
    initialProject,
    projectId,
    projectName = 'Untitled panel',
    onRequestExit,
}: PanelBuilderProps) => {
    const [payload, setPayload] = useState<PanelPayload | null>(null);
    const [cytometer, setCytometer] = useState(() => getCytometerName(initialProject?.cytometer ?? initialCytometer));
    const [configuration, setConfiguration] = useState(() => getCytometerName(initialProject?.configuration ?? initialConfiguration));
    const [slots, setSlots] = useState<string[]>(() => {
        return initialProject ? [...initialProject.slots] : Array(emptySlots).fill('');
    });
    const slotsRef = useRef<string[]>(slots);
    const importInputRef = useRef<HTMLInputElement | null>(null);
    const projectInputRef = useRef<HTMLInputElement | null>(null);
    const fileActionsRef = useRef<HTMLDivElement | null>(null);
    const sidebarRef = useRef<HTMLElement | null>(null);
    const sidebarResizeCleanupRef = useRef<(() => void) | null>(null);
    const [markers, setMarkers] = useState<Record<number, string>>(() => initialProject?.markers ?? {});
    const markersRef = useRef(markers);
    const [panelName, setPanelName] = useState(projectName);
    const bootSelectionRef = useRef({ cytometer, configuration, slots });
    const bootPromiseRef = useRef<Promise<void> | null>(null);
    const panelRequestSequenceRef = useRef(createRefreshSequence());
    const [queries, setQueries] = useState<Record<number, string>>({});
    const [activeSlot, setActiveSlot] = useState<number | null>(null);
    const [tab, setTab] = useState<TabId>(initialProject?.tab ?? 'panel');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [exporting, setExporting] = useState(false);
    const [importing, setImporting] = useState(false);
    const [hoveredFluor, setHoveredFluor] = useState<string | null>(null);
    const [theme, setTheme] = useState<'light' | 'dark'>(() => {
        if (embedded && cockpitTheme) return cockpitTheme;
        return readThemePreference(initialProject?.theme);
    });
    const [guiStateLoaded, setGuiStateLoaded] = useState(false);
    const [sidebarWidth, setSidebarWidth] = useState(initialProject?.sidebarWidth ?? 214);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(initialProject?.sidebarCollapsed ?? false);
    const [plotScale, setPlotScale] = useState(
        initialProject?.plotScaleMode === 'fit-width' ? initialProject.plotScale : DEFAULT_PLOT_SCALE,
    );
    const [showPdfConfirm, setShowPdfConfirm] = useState(false);
    const [showClearConfirmation, setShowClearConfirmation] = useState(false);
    const [clearingPanel, setClearingPanel] = useState(false);
    const [showPanelWizard, setShowPanelWizard] = useState(false);
    const [wizardState, setWizardState] = useState<WizardProjectState | null>(() => initialProject?.wizard ?? null);
    const [wizardSyncRevision, setWizardSyncRevision] = useState(0);
    const wizardStateRef = useRef(wizardState);
    const handleWizardStateChange = useCallback((state: WizardProjectState) => {
        wizardStateRef.current = state;
        setWizardState(state);
    }, []);
    const syncWizardColorsWithPanel = useCallback((
        nextSlots: string[],
        removedSlotIndex?: number,
        invalidateResults = true,
    ) => {
        const current = wizardStateRef.current;
        if (!current) return;
        let changed = false;
        const remainingMarkers = current.markers
            .filter((marker) => marker.slotIndex !== removedSlotIndex);
        if (remainingMarkers.length !== current.markers.length) changed = true;
        const nextMarkers = remainingMarkers
            .map((marker) => {
                const slotIndex = removedSlotIndex !== undefined && marker.slotIndex > removedSlotIndex
                    ? marker.slotIndex - 1
                    : marker.slotIndex;
                const currentFluorophore = nextSlots[slotIndex] ?? '';
                if (slotIndex === marker.slotIndex && currentFluorophore === marker.currentFluorophore) {
                    return marker;
                }
                changed = true;
                return { ...marker, slotIndex, currentFluorophore };
            });
        const desiredSize = removedSlotIndex === undefined
            ? current.desiredSize
            : Math.min(current.desiredSize, nextSlots.length);
        if (desiredSize !== current.desiredSize) changed = true;
        if (!changed) return;
        const nextState = {
            ...current,
            desiredSize,
            markers: nextMarkers,
            results: invalidateResults && current.results ? null : current.results,
        };
        wizardStateRef.current = nextState;
        setWizardState(nextState);
        setWizardSyncRevision((revision) => revision + 1);
    }, []);
    const panelHistoryRef = useRef<{ past: PanelEditSnapshot[]; future: PanelEditSnapshot[] }>({
        past: [],
        future: [],
    });
    const [historyAvailability, setHistoryAvailability] = useState({ canUndo: false, canRedo: false });
    const [historyBusy, setHistoryBusy] = useState(false);
    const [cytometerPanels, setCytometerPanels] = useState<Record<string, CytometerPanelState>>(
        () => initialProject?.cytometerPanels ?? {},
    );
    const [fileMenu, setFileMenu] = useState<'import' | 'export' | null>(null);
    const [bootAttempt, setBootAttempt] = useState(0);

    useEffect(() => () => sidebarResizeCleanupRef.current?.(), []);

    useEffect(() => {
        if (wizardStateRef.current?.inputsChanged === true) return;
        syncWizardColorsWithPanel(slots);
    }, [slots, syncWizardColorsWithPanel]);

    useEffect(() => {
        if (typeof window.requestIdleCallback === 'function') {
            const idleCallback = window.requestIdleCallback(() => void loadPanelWizard(), { timeout: 1500 });
            return () => window.cancelIdleCallback(idleCallback);
        }
        const timer = window.setTimeout(() => void loadPanelWizard(), 600);
        return () => window.clearTimeout(timer);
    }, []);

    useEffect(() => {
        writeLocalStorage('spectreasy_cytometer', getCytometerName(cytometer));
    }, [cytometer]);

    useEffect(() => {
        writeLocalStorage('spectreasy_configuration', getCytometerName(configuration));
    }, [configuration]);

    useEffect(() => {
        if (embedded) return;
        saveThemePreference(theme);
    }, [embedded, theme]);

    useEffect(() => {
        writeLocalStorage('spectreasy_slots', JSON.stringify(slots));
    }, [slots]);

    useEffect(() => {
        markersRef.current = markers;
    }, [markers]);

    useEffect(() => {
        wizardStateRef.current = wizardState;
    }, [wizardState]);

    useEffect(() => {
        writeLocalStorage('spectreasy_markers', JSON.stringify(markers));
    }, [markers]);

    const projectState = useMemo<ProjectState>(() => {
        const activeCytometer = getCytometerName(cytometer);
        const activePanel: CytometerPanelState = {
            configuration: getCytometerName(configuration),
            slots,
            markers,
            wizard: wizardState,
        };
        return {
            cytometer: activeCytometer,
            configuration: activePanel.configuration,
            theme,
            slots,
            markers,
            tab,
            sidebarWidth,
            sidebarCollapsed,
            plotScale,
            plotScaleMode: 'fit-width',
            wizard: wizardState,
            cytometerPanels: {
                ...cytometerPanels,
                [activeCytometer]: activePanel,
            },
        };
    }, [cytometer, configuration, theme, slots, markers, tab, sidebarWidth, sidebarCollapsed, plotScale, wizardState, cytometerPanels]);

    const persistProjectState = useCallback(async (state: ProjectState = projectState) => {
        if (projectId) {
            await savePanelProject(projectId, panelName, state);
            return;
        }
        await saveActiveProject(state);
    }, [panelName, projectId, projectState]);

    const exitToPanelLibrary = useCallback(async () => {
        await persistProjectState();
        await onRequestExit?.();
    }, [onRequestExit, persistProjectState]);

    useEffect(() => {
        if (!guiStateLoaded) return;
        const timer = window.setTimeout(() => {
            void persistProjectState().catch(() => null);
        }, 500);
        return () => window.clearTimeout(timer);
    }, [guiStateLoaded, persistProjectState]);

    const selected = useMemo(() => slots.filter(Boolean), [slots]);
    const selectedColorCount = useMemo(() => new Set(selected).size, [selected]);
    const panelExceedsDetectorLimit = Boolean(payload && selectedColorCount > payload.max_panel_size);

    useEffect(() => {
        slotsRef.current = slots;
    }, [slots]);

    const selectedSet = useMemo(() => new Set(selected), [selected]);
    const panelHasContent = selected.length > 0 || Object.keys(markers).length > 0 || wizardState !== null;

    const colorByFluor = useMemo(() => {
        const map = new Map<string, string>();
        payload?.fluorophores.forEach(f => map.set(f.fluorophore, f.peak_color || '#2688e8'));
        return map;
    }, [payload]);

    const fluorByName = useMemo(() => {
        const map = new Map<string, FluorInfo>();
        payload?.fluorophores.forEach(f => map.set(f.fluorophore, f));
        return map;
    }, [payload]);

    const spectraByName = useMemo(() => {
        const map = new Map<string, NumericRow>();
        payload?.spectra.forEach(row => map.set(row.fluorophore, row));
        return map;
    }, [payload]);

    const similarityByName = useMemo(() => {
        const map = new Map<string, NumericRow>();
        payload?.similarity.forEach(row => map.set(row.fluorophore, row));
        return map;
    }, [payload]);

    const lasers = useMemo(() => {
        if (!payload) return [];
        const present = unique(payload.detectors.map(d => d.laser));
        return laserOrder.filter(laser => present.includes(laser));
    }, [payload]);

    const emissions = useMemo(() => {
        const cytName = getCytometerName(cytometer).toLowerCase();
        if (cytName === 'aurora') {
            return [370, 395, 420, 440, 450, 480, 500, 520, 550, 570, 580, 600, 660, 680, 690, 700, 730, 750, 780, 800];
        }
        if (!payload) return [];
        const rawEmissions = payload.detectors.map(d => binEmission(d.emission, cytometer));
        return unique(rawEmissions).sort((a, b) => a - b);
    }, [payload, cytometer]);

    const selectedEntries = useMemo(() => {
        if (!payload) return [];
        return slots
            .map((fluor, slotIndex) => {
                const info = fluorByName.get(fluor);
                const peakDetector = info?.peak_detector || '';
                const det = payload.detectors.find(d => d.detector === peakDetector);
                const peakLaser = det?.laser || info?.peak_laser || '';
                let peakEmission = det?.emission || 0;
                const cytName = getCytometerName(cytometer).toLowerCase();
                if (cytName === 'aurora' && peakDetector) {
                    peakEmission = mapDetectorToEmission(peakDetector);
                } else if (peakEmission > 0) {
                    peakEmission = binEmission(peakEmission, cytometer);
                }
                return {
                    fluor,
                    slotIndex,
                    marker: markers[slotIndex] || '',
                    color: colorByFluor.get(fluor) || '#2688e8',
                    peakLaser,
                    peakEmission,
                };
            })
            .filter(entry => entry.fluor);
    }, [colorByFluor, fluorByName, markers, payload, slots, cytometer]);

    const selectedRows = useMemo(() => slots
        .map((fluor, slotIndex) => ({
            fluor,
            marker: (markers[slotIndex] || '').trim(),
        }))
        .filter(row => row.fluor), [markers, slots]);

    const selectedConfigurationLabel = useMemo(() => {
        const hit = payload?.configurations.find(config => config.id === configuration);
        return hit?.label || '';
    }, [configuration, payload]);

    const capturePanelEdit = useCallback((): PanelEditSnapshot => ({
        slots: [...slotsRef.current],
        markers: { ...markersRef.current },
        wizard: wizardStateRef.current,
    }), []);

    const syncHistoryAvailability = useCallback(() => {
        setHistoryAvailability({
            canUndo: panelHistoryRef.current.past.length > 0,
            canRedo: panelHistoryRef.current.future.length > 0,
        });
    }, []);

    const recordPanelEdit = useCallback(() => {
        const history = panelHistoryRef.current;
        history.past.push(capturePanelEdit());
        if (history.past.length > MAX_PANEL_HISTORY) history.past.shift();
        history.future = [];
        syncHistoryAvailability();
    }, [capturePanelEdit, syncHistoryAvailability]);

    const clearPanelHistory = useCallback(() => {
        panelHistoryRef.current = { past: [], future: [] };
        syncHistoryAvailability();
    }, [syncHistoryAvailability]);

    const requestPanel = useCallback((
        nextCytometer: string,
        nextConfiguration: string,
        nextSelected: string[],
    ) => buildPanelPayload(nextCytometer, nextConfiguration, nextSelected), []);

    const fetchPanel = async (
        nextCytometer: string,
        nextConfiguration: string,
        nextSelected: string[],
        showLoading = false,
    ): Promise<PanelPayload | null> => {
        const requestSequence = panelRequestSequenceRef.current.begin();
        setError('');
        if (showLoading) setLoading(true);
        try {
            const nextPayload = await requestPanel(nextCytometer, nextConfiguration, nextSelected);
            if (!panelRequestSequenceRef.current.isCurrent(requestSequence)) return null;
            setPayload(nextPayload);
            setCytometer(getCytometerName(nextPayload.cytometer));
            setConfiguration(getCytometerName(nextPayload.configuration));
            const nextColorCount = new Set(nextSelected.filter(Boolean)).size;
            if (nextColorCount > nextPayload.max_panel_size) {
                setError(panelCapacityMessage(nextColorCount, nextPayload.max_panel_size));
            }
            return nextPayload;
        } catch (err) {
            if (!panelRequestSequenceRef.current.isCurrent(requestSequence)) return null;
            throw err;
        } finally {
            if (showLoading && panelRequestSequenceRef.current.isCurrent(requestSequence)) {
                setLoading(false);
            }
        }
    };

    const restorePanelEdit = async (snapshot: PanelEditSnapshot) => {
        slotsRef.current = [...snapshot.slots];
        markersRef.current = { ...snapshot.markers };
        wizardStateRef.current = snapshot.wizard;
        setSlots(snapshot.slots);
        setMarkers(snapshot.markers);
        setWizardState(snapshot.wizard);
        setQueries({});
        setActiveSlot(null);
        writeLocalStorage('spectreasy_slots', JSON.stringify(snapshot.slots));
        writeLocalStorage('spectreasy_markers', JSON.stringify(snapshot.markers));
        await fetchPanel(cytometer, configuration, snapshot.slots.filter(Boolean)).catch((historyError) => {
            setError(historyError instanceof Error ? historyError.message : 'Could not restore panel edit.');
        });
    };

    const undoPanelEdit = async () => {
        if (historyBusy) return;
        const previous = panelHistoryRef.current.past.pop();
        if (!previous) return;
        panelHistoryRef.current.future.push(capturePanelEdit());
        syncHistoryAvailability();
        setHistoryBusy(true);
        try {
            await restorePanelEdit(previous);
        } finally {
            setHistoryBusy(false);
        }
    };

    const redoPanelEdit = async () => {
        if (historyBusy) return;
        const next = panelHistoryRef.current.future.pop();
        if (!next) return;
        panelHistoryRef.current.past.push(capturePanelEdit());
        syncHistoryAvailability();
        setHistoryBusy(true);
        try {
            await restorePanelEdit(next);
        } finally {
            setHistoryBusy(false);
        }
    };

    useEffect(() => {
        const boot = async () => {
            try {
                const initial = await requestPanel(
                    bootSelectionRef.current.cytometer,
                    bootSelectionRef.current.configuration,
                    bootSelectionRef.current.slots.filter(Boolean),
                );
                setPayload(initial);
                setCytometer(getCytometerName(initial.cytometer));
                setConfiguration(getCytometerName(initial.configuration));
                const initialColorCount = new Set(slotsRef.current.filter(Boolean)).size;
                if (initialColorCount <= initial.max_panel_size && slotsRef.current.length > initial.max_panel_size) {
                    const nextSlots = slotsRef.current.slice(0, initial.max_panel_size);
                    const nextMarkers = Object.fromEntries(
                        Object.entries(markersRef.current)
                            .map(([key, value]) => [Number(key), value] as const)
                            .filter(([slotIndex]) => slotIndex < initial.max_panel_size),
                    );
                    slotsRef.current = nextSlots;
                    markersRef.current = nextMarkers;
                    setSlots(nextSlots);
                    setMarkers(nextMarkers);
                }
                if (initialColorCount > initial.max_panel_size) {
                    setError(panelCapacityMessage(initialColorCount, initial.max_panel_size));
                }
                setGuiStateLoaded(true);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Could not load bundled spectral libraries.');
            } finally {
                setLoading(false);
            }
        };
        if (!bootPromiseRef.current) bootPromiseRef.current = boot();
        void bootPromiseRef.current;
    }, [bootAttempt, requestPanel]);

    const retryBoot = () => {
        bootPromiseRef.current = null;
        setPayload(null);
        setError('');
        setLoading(true);
        setBootAttempt(attempt => attempt + 1);
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (target && typeof target.closest === 'function') {
                if (!target.closest('.selector-row') && !target.closest('.clear-slot')) {
                    setActiveSlot(null);
                }
                if (!fileActionsRef.current?.contains(target)) setFileMenu(null);
            }
        };
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape' || event.defaultPrevented) return;
            if (showPanelWizard) return;
            event.preventDefault();
            if (showClearConfirmation) {
                if (!clearingPanel) setShowClearConfirmation(false);
                return;
            }
            if (showPdfConfirm) {
                setShowPdfConfirm(false);
                return;
            }
            if (activeSlot !== null) {
                setActiveSlot(null);
                return;
            }
            if (fileMenu !== null) {
                setFileMenu(null);
                return;
            }
            if (onRequestExit) void exitToPanelLibrary();
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [activeSlot, clearingPanel, exitToPanelLibrary, fileMenu, onRequestExit, showClearConfirmation, showPanelWizard, showPdfConfirm]);

    const updateSlot = async (index: number, fluor: string) => {
        const currentSlots = slotsRef.current;
        if (fluor && currentSlots.some((existing, i) => i !== index && existing === fluor)) return;
        if (currentSlots[index] === fluor) return;
        recordPanelEdit();
        const nextSlots = currentSlots.map((existing, i) => (i === index ? fluor : existing));
        slotsRef.current = nextSlots;
        setSlots(nextSlots);
        syncWizardColorsWithPanel(nextSlots);
        writeLocalStorage('spectreasy_slots', JSON.stringify(nextSlots));
        setQueries(prev => ({ ...prev, [index]: '' }));
        setActiveSlot(null);
        await fetchPanel(cytometer, configuration, nextSlots.filter(Boolean)).catch(err => {
            setError(err instanceof Error ? err.message : 'Could not update panel.');
        });
    };

    const removeSlot = async (index: number) => {
        recordPanelEdit();
        const nextSlots = slotsRef.current.filter((_, slotIndex) => slotIndex !== index);
        const nextMarkers = Object.fromEntries(
            Object.entries(markersRef.current)
                .map(([key, value]) => [Number(key), value] as const)
                .filter(([slotIndex]) => slotIndex !== index)
                .map(([slotIndex, value]) => [slotIndex > index ? slotIndex - 1 : slotIndex, value]),
        );
        slotsRef.current = nextSlots;
        markersRef.current = nextMarkers;
        setSlots(nextSlots);
        setMarkers(nextMarkers);
        syncWizardColorsWithPanel(nextSlots, index);
        setQueries((current) => Object.fromEntries(
            Object.entries(current)
                .map(([key, value]) => [Number(key), value] as const)
                .filter(([slotIndex]) => slotIndex !== index)
                .map(([slotIndex, value]) => [slotIndex > index ? slotIndex - 1 : slotIndex, value]),
        ));
        setActiveSlot(null);
        writeLocalStorage('spectreasy_slots', JSON.stringify(nextSlots));
        writeLocalStorage('spectreasy_markers', JSON.stringify(nextMarkers));
        await fetchPanel(cytometer, configuration, nextSlots.filter(Boolean)).catch(err => {
            setError(err instanceof Error ? err.message : 'Could not update panel.');
        });
        await persistProjectState({ ...projectState, slots: nextSlots, markers: nextMarkers });
    };

    const addSlot = () => {
        if (payload && slotsRef.current.length >= payload.max_panel_size) {
            setError(`The selected configuration supports a maximum of ${payload.max_panel_size} colors because it has ${payload.max_panel_size} detectors.`);
            return;
        }
        recordPanelEdit();
        const nextSlots = [...slotsRef.current, ''];
        slotsRef.current = nextSlots;
        setSlots(nextSlots);
        syncWizardColorsWithPanel(nextSlots);
        writeLocalStorage('spectreasy_slots', JSON.stringify(nextSlots));
    };

    const updateMarkerWithHistory = useCallback((slotIndex: number, value: string) => {
        if ((markersRef.current[slotIndex] ?? '') === value) return;
        recordPanelEdit();
        const nextMarkers = { ...markersRef.current };
        if (value) nextMarkers[slotIndex] = value;
        else delete nextMarkers[slotIndex];
        markersRef.current = nextMarkers;
        setMarkers(nextMarkers);
        writeLocalStorage('spectreasy_markers', JSON.stringify(nextMarkers));
    }, [recordPanelEdit]);

    const clearPanelContent = async () => {
        const hasContent = slotsRef.current.some(Boolean)
            || Object.keys(markersRef.current).length > 0
            || wizardStateRef.current !== null;
        if (!hasContent) return;
        recordPanelEdit();
        const nextSlots = slotsRef.current.map(() => '');
        slotsRef.current = nextSlots;
        markersRef.current = {};
        wizardStateRef.current = null;
        setSlots(nextSlots);
        setMarkers({});
        setWizardState(null);
        setQueries({});
        setActiveSlot(null);
        writeLocalStorage('spectreasy_slots', JSON.stringify(nextSlots));
        writeLocalStorage('spectreasy_markers', '{}');
        await fetchPanel(cytometer, configuration, []).catch((clearError) => {
            setError(clearError instanceof Error ? clearError.message : 'Could not clear the panel.');
        });
        const activeCytometer = getCytometerName(cytometer);
        await persistProjectState({
            ...projectState,
            slots: nextSlots,
            markers: {},
            wizard: null,
            cytometerPanels: {
                ...projectState.cytometerPanels,
                [activeCytometer]: {
                    configuration: getCytometerName(configuration),
                    slots: nextSlots,
                    markers: {},
                    wizard: null,
                },
            },
        });
    };

    const confirmClearPanel = async () => {
        setClearingPanel(true);
        try {
            await clearPanelContent();
            setShowClearConfirmation(false);
        } finally {
            setClearingPanel(false);
        }
    };

    const applyWizardRecommendations = async ({
        markers: wizardMarkers,
        recommendations,
        desiredSize,
    }: WizardApplication) => {
        if (payload && desiredSize > payload.max_panel_size) {
            throw new Error(`The panel cannot exceed ${payload.max_panel_size} colors for this detector configuration.`);
        }
        recordPanelEdit();
        const recommendationByMarker = new Map(
            recommendations.map(recommendation => [recommendation.markerId, recommendation.fluorophore]),
        );
        const appliedMarkers = wizardMarkers.slice(0, desiredSize);
        const nextSlots = appliedMarkers.map(marker => (
            marker.currentFluorophore || recommendationByMarker.get(marker.id) || ''
        ));
        while (nextSlots.length < desiredSize) nextSlots.push('');

        const nextMarkers: Record<number, string> = {};
        appliedMarkers.forEach((marker, index) => {
            const name = marker.name.trim();
            if (name) nextMarkers[index] = name;
        });
        slotsRef.current = nextSlots;
        markersRef.current = nextMarkers;
        setSlots(nextSlots);
        setMarkers(nextMarkers);
        syncWizardColorsWithPanel(nextSlots, undefined, false);
        writeLocalStorage('spectreasy_slots', JSON.stringify(nextSlots));
        writeLocalStorage('spectreasy_markers', JSON.stringify(nextMarkers));
        await fetchPanel(cytometer, configuration, nextSlots.filter(Boolean)).catch((wizardError) => {
            throw wizardError instanceof Error ? wizardError : new Error('Could not apply the panel recommendations.');
        });
        await persistProjectState({ ...projectState, slots: nextSlots, markers: nextMarkers });
    };

    const filteredOptions = (slotIndex: number) => {
        if (!payload) return [];
        const query = queries[slotIndex] ?? '';
        const baseOptions = payload.fluorophores
            .filter(f => !selectedSet.has(f.fluorophore) || slots[slotIndex] === f.fluorophore);

        return rankUiSelectOptions(
            baseOptions.map(option => ({
                value: option.fluorophore,
                label: option.fluorophore,
                option,
            })),
            query,
        )
            .map(({ option }) => option)
            .slice(0, 80);
    };

    const exportPanelCsv = async () => {
        if (selectedRows.length === 0) {
            setError('Select at least one fluorophore before exporting a panel.');
            return;
        }
        const lines = [
            ['Marker', 'Fluorophore'].map(csvEscape).join(','),
            ...selectedRows.map(row => [row.marker, row.fluor].map(csvEscape).join(',')),
        ];
        await saveBlob(new Blob([`${lines.join('\n')}\n`], { type: 'text/csv;charset=utf-8' }), {
            suggestedName: `spectreasy_${cytometer}_${configuration}_panel.csv`,
            description: 'Panel CSV',
            mimeType: 'text/csv',
            extensions: ['.csv'],
        });
    };

    const exportPanelOverview = async () => {
        if (selectedRows.length === 0) {
            setError('Select at least one fluorophore before exporting a panel overview.');
            return;
        }
        setError('');
        setExporting(true);
        try {
            if (!payload) throw new Error('Panel data is not ready.')
            const { createPanelOverviewPdf } = await import('./pdfExport');
            const pdf = createPanelOverviewPdf(payload, selectedRows);
            await saveBlob(pdf, {
                suggestedName: `spectreasy_${cytometer}_${configuration}_panel_overview.pdf`,
                description: 'Panel overview PDF',
                mimeType: 'application/pdf',
                extensions: ['.pdf'],
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not export panel overview.');
        } finally {
            setExporting(false);
        }
    };

    const beginSidebarResize = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (sidebarCollapsed) return;
        event.preventDefault();
        sidebarResizeCleanupRef.current?.();

        const sidebar = sidebarRef.current;
        const handle = event.currentTarget;
        if (!sidebar) return;

        const startX = event.clientX;
        const startWidth = sidebarWidth;
        const pointerId = event.pointerId;
        const previousCursor = document.body.style.cursor;
        const previousUserSelect = document.body.style.userSelect;
        let nextWidth = startWidth;
        let animationFrame = 0;

        const applyWidth = () => {
            animationFrame = 0;
            sidebar.style.setProperty('--panel-sidebar-width', `${nextWidth}px`);
        };
        const queueWidth = () => {
            if (!animationFrame) animationFrame = window.requestAnimationFrame(applyWidth);
        };
        const move = (moveEvent: PointerEvent) => {
            nextWidth = Math.min(
                MAX_SIDEBAR_WIDTH,
                Math.max(MIN_SIDEBAR_WIDTH, startWidth + moveEvent.clientX - startX),
            );
            queueWidth();
        };
        const cleanup = () => {
            handle.removeEventListener('pointermove', move);
            handle.removeEventListener('pointerup', finish);
            handle.removeEventListener('pointercancel', finish);
            if (animationFrame) {
                window.cancelAnimationFrame(animationFrame);
                applyWidth();
            }
            if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
            sidebar.classList.remove('is-resizing');
            handle.classList.remove('is-resizing');
            document.body.style.cursor = previousCursor;
            document.body.style.userSelect = previousUserSelect;
            sidebarResizeCleanupRef.current = null;
        };
        const finish = () => {
            cleanup();
            setSidebarWidth(nextWidth);
        };

        sidebar.classList.add('is-resizing');
        handle.classList.add('is-resizing');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        handle.setPointerCapture(pointerId);
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', finish);
        handle.addEventListener('pointercancel', finish);
        sidebarResizeCleanupRef.current = cleanup;
    };

    const resizeSidebarByKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
        const direction = event.key === 'ArrowLeft'
            ? -SIDEBAR_KEYBOARD_STEP
            : event.key === 'ArrowRight'
                ? SIDEBAR_KEYBOARD_STEP
                : 0;
        if (!direction && event.key !== 'Home' && event.key !== 'End') return;
        event.preventDefault();
        setSidebarWidth(current => {
            if (event.key === 'Home') return MIN_SIDEBAR_WIDTH;
            if (event.key === 'End') return MAX_SIDEBAR_WIDTH;
            return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, current + direction));
        });
    };

    const importPanelCsv = async (file: File | null) => {
        if (!file || !payload) return;
        setError('');
        setImporting(true);
        try {
            const text = await file.text();
            const imported = detectImportedPanelRows(text, payload.fluorophores);
            if (imported.length > payload.max_panel_size) {
                throw new Error(`The imported panel contains ${imported.length} colors, but this configuration supports at most ${payload.max_panel_size} colors (${payload.max_panel_size} detectors).`);
            }
            recordPanelEdit();
            const nextSlots = imported.map(row => row.fluor);
            while (nextSlots.length < emptySlots) nextSlots.push('');
            const nextMarkers: Record<number, string> = {};
            imported.forEach((row, index) => {
                if (row.marker) nextMarkers[index] = row.marker;
            });
            slotsRef.current = nextSlots;
            markersRef.current = nextMarkers;
            wizardStateRef.current = null;
            setSlots(nextSlots);
            setMarkers(nextMarkers);
            setWizardState(null);
            writeLocalStorage('spectreasy_slots', JSON.stringify(nextSlots));
            writeLocalStorage('spectreasy_markers', JSON.stringify(nextMarkers));
            setQueries({});
            setActiveSlot(null);
            await fetchPanel(cytometer, configuration, imported.map(row => row.fluor));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not import panel CSV.');
        } finally {
            setImporting(false);
            if (importInputRef.current) importInputRef.current.value = '';
        }
    };

    const choosePanelCsv = async () => {
        const file = await openTextFile({
            description: 'Panel CSV',
            mimeType: 'text/csv',
            extensions: ['.csv', '.tsv', '.txt'],
        }, importInputRef.current);
        if (file) await importPanelCsv(file);
    };

    const currentProjectState = (): ProjectState => projectState;

    const exportProject = async () => {
        await saveBlob(new Blob([serializeProject(currentProjectState())], { type: 'application/json' }), {
            suggestedName: projectJsonFilename(panelName),
            description: 'OpenPanel project',
            mimeType: 'application/json',
            extensions: ['.json'],
        });
    };

    const importProject = async (file: File | null) => {
        if (!file) return;
        setError('');
        setImporting(true);
        try {
            const state = parseProject(await file.text());
            const nextPayload = await fetchPanel(
                state.cytometer,
                state.configuration,
                state.slots.filter(Boolean),
                true,
            );
            if (!nextPayload) return;
            clearPanelHistory();
            const available = new Set(nextPayload.fluorophores.map((item) => item.fluorophore));
            const nextSlots = state.slots.map((fluorophore) => available.has(fluorophore) ? fluorophore : '');
            const nextColorCount = new Set(nextSlots.filter(Boolean)).size;
            if (nextColorCount > nextPayload.max_panel_size) {
                throw new Error(panelCapacityMessage(nextColorCount, nextPayload.max_panel_size));
            }
            const nextMarkers = Object.fromEntries(
                Object.entries(state.markers).filter(([index]) => nextSlots[Number(index)]),
            ) as Record<number, string>;
            slotsRef.current = nextSlots;
            markersRef.current = nextMarkers;
            wizardStateRef.current = state.wizard;
            setSlots(nextSlots);
            setMarkers(nextMarkers);
            setTab(state.tab);
            setTheme(state.theme);
            setSidebarWidth(state.sidebarWidth);
            setSidebarCollapsed(state.sidebarCollapsed);
            setPlotScale(state.plotScale);
            setWizardState(state.wizard);
            const nextCytometerPanels = {
                ...state.cytometerPanels,
                [state.cytometer]: {
                    configuration: getCytometerName(nextPayload.configuration),
                    slots: nextSlots,
                    markers: nextMarkers,
                    wizard: state.wizard,
                },
            };
            setCytometerPanels(nextCytometerPanels);
            await persistProjectState({
                ...state,
                configuration: getCytometerName(nextPayload.configuration),
                slots: nextSlots,
                markers: nextMarkers,
                cytometerPanels: nextCytometerPanels,
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not import this OpenPanel project.');
        } finally {
            setImporting(false);
            if (projectInputRef.current) projectInputRef.current.value = '';
        }
    };

    const chooseProject = async () => {
        const file = await openTextFile({
            description: 'OpenPanel project',
            mimeType: 'application/json',
            extensions: ['.openpanel.json', '.json'],
        }, projectInputRef.current);
        if (file) await importProject(file);
    };

    if (loading) {
        return <ModuleLoadingState label="Loading Spectral Panel Builder" theme={embedded && cockpitTheme ? cockpitTheme : theme} />;
    }

    if (!payload) {
        return (
            <div className={`panel-builder panel-boot-failure ${embedded && cockpitTheme ? cockpitTheme : theme}`}>
                <div className="panel-boot-error" role="alert">
                    <strong>Spectral Panel Builder could not load</strong>
                    <span>{error || 'The bundled spectral data could not be opened.'}</span>
                    <button type="button" onClick={retryBoot}>Try again</button>
                    {embedded && onRequestExit && <button type="button" className="secondary" onClick={onRequestExit}>Return to cockpit</button>}
                </div>
            </div>
        );
    }

    return (
        <div className={`panel-builder ${embedded && cockpitTheme ? cockpitTheme : theme}`}>
            <header className="panel-topbar">
                <div className="panel-title-group">
                    {!embedded && onRequestExit && (
                        <button
                            type="button"
                            className="panel-back-button"
                            onClick={() => void exitToPanelLibrary()}
                            aria-label="Open panel library"
                            title="Panel library"
                        >
                            <ArrowLeft size={17} />
                        </button>
                    )}
                    <div>
                        <div className="panel-heading-row">
                            {!embedded && projectId && (
                                <input
                                    className="panel-name-input"
                                    value={panelName}
                                    onChange={(event) => setPanelName(event.target.value)}
                                    onBlur={() => {
                                        if (!panelName.trim()) setPanelName('Untitled panel');
                                    }}
                                    aria-label="Panel name"
                                    spellCheck={false}
                                />
                            )}
                        </div>
                    </div>
                </div>
                <div className="panel-primary-actions">
                    <button
                        type="button"
                        className="export-button wizard-launch-button panel-wizard-header-action"
                        onClick={() => setShowPanelWizard(true)}
                        onPointerEnter={() => void loadPanelWizard()}
                        onFocus={() => void loadPanelWizard()}
                        aria-label="Open panel wizard"
                        disabled={panelExceedsDetectorLimit}
                        title={panelExceedsDetectorLimit ? panelCapacityMessage(selectedColorCount, payload.max_panel_size) : 'Open panel wizard'}
                    >
                        <WandSparkles size={17} aria-hidden="true" />
                        <span>Panel wizard</span>
                    </button>
                </div>
                <div className="panel-actions">
                    <div className="history-controls" role="group" aria-label="Edit history">
                        <button
                            type="button"
                            className="export-button icon-only"
                            onClick={() => void undoPanelEdit()}
                            disabled={!historyAvailability.canUndo || historyBusy}
                            aria-label="Undo last edit"
                            title="Undo"
                        >
                            <Undo2 size={16} />
                        </button>
                        <button
                            type="button"
                            className="export-button icon-only"
                            onClick={() => void redoPanelEdit()}
                            disabled={!historyAvailability.canRedo || historyBusy}
                            aria-label="Redo last edit"
                            title="Redo"
                        >
                            <Redo2 size={16} />
                        </button>
                    </div>
                    <div className="plot-size-controls" role="group" aria-label="Plot size">
                        <button
                            type="button"
                            className="export-button icon-only"
                            onClick={() => setPlotScale((current) => Math.max(MIN_PLOT_SCALE, current - 10))}
                            disabled={plotScale <= MIN_PLOT_SCALE}
                            aria-label="Decrease plot size"
                            title="Decrease plot size"
                        >
                            <Minus size={16} />
                        </button>
                        <button
                            type="button"
                            className="export-button icon-only"
                            onClick={() => setPlotScale((current) => Math.min(MAX_PLOT_SCALE, current + 10))}
                            disabled={plotScale >= MAX_PLOT_SCALE}
                            aria-label="Increase plot size"
                            title="Increase plot size"
                        >
                            <Plus size={16} />
                        </button>
                    </div>
                    <button
                        type="button"
                        className="export-button icon-only panel-clear-button"
                        onClick={() => setShowClearConfirmation(true)}
                        disabled={!panelHasContent || clearingPanel}
                        aria-label="Clear project panel"
                        title="Clear panel"
                    >
                        <Trash2 size={16} />
                    </button>
                    {!embedded && <button
                        type="button"
                        className="export-button"
                        onClick={() => setTheme(prev => prev === 'light' ? 'dark' : 'light')}
                        aria-label="Toggle theme"
                        style={{ padding: '0 10px', width: '40px' }}
                    >
                        {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
                    </button>}
                    <input
                        ref={importInputRef}
                        type="file"
                        accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
                        className="hidden-file-input"
                        onChange={event => void importPanelCsv(event.target.files?.[0] || null)}
                    />
                    <input
                        ref={projectInputRef}
                        type="file"
                        accept=".openpanel.json,.json,application/json"
                        className="hidden-file-input"
                        onChange={event => void importProject(event.target.files?.[0] || null)}
                    />
                    <div className="file-action-groups" ref={fileActionsRef}>
                        <div className="file-action-menu">
                            <button
                                type="button"
                                className={`export-button file-action-trigger${fileMenu === 'import' ? ' is-open' : ''}`}
                                onClick={() => setFileMenu(current => current === 'import' ? null : 'import')}
                                disabled={importing}
                                aria-label={importing ? 'Importing file' : 'Import'}
                                aria-haspopup="menu"
                                aria-expanded={fileMenu === 'import'}
                                title={importing ? 'Importing…' : 'Import'}
                            >
                                <Upload size={16} />
                                <ChevronDown size={12} />
                            </button>
                            {fileMenu === 'import' && (
                                <div className="file-action-popout" role="menu" aria-label="Import options">
                                    <button type="button" role="menuitem" onClick={() => {
                                        setFileMenu(null);
                                        void choosePanelCsv();
                                    }}>
                                        <FileSpreadsheet size={17} />
                                        <span><strong>Import panel</strong><small>CSV file</small></span>
                                    </button>
                                    <button type="button" role="menuitem" onClick={() => {
                                        setFileMenu(null);
                                        void chooseProject();
                                    }}>
                                        <FileJson2 size={17} />
                                        <span><strong>Import project</strong><small>OpenPanel JSON</small></span>
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="file-action-menu">
                            <button
                                type="button"
                                className={`export-button file-action-trigger${fileMenu === 'export' ? ' is-open' : ''}`}
                                onClick={() => setFileMenu(current => current === 'export' ? null : 'export')}
                                aria-label="Export"
                                aria-haspopup="menu"
                                aria-expanded={fileMenu === 'export'}
                                title="Export"
                            >
                                <Download size={16} />
                                <ChevronDown size={12} />
                            </button>
                            {fileMenu === 'export' && (
                                <div className="file-action-popout" role="menu" aria-label="Export options">
                                    <button type="button" role="menuitem" onClick={() => {
                                        setFileMenu(null);
                                        void exportPanelCsv();
                                    }}>
                                        <FileSpreadsheet size={17} />
                                        <span><strong>Export panel</strong><small>CSV file</small></span>
                                    </button>
                                    <button type="button" role="menuitem" onClick={() => {
                                        setFileMenu(null);
                                        void exportProject();
                                    }}>
                                        <FileJson2 size={17} />
                                        <span><strong>Export project</strong><small>OpenPanel JSON</small></span>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                    <button type="button" className="export-button primary icon-only" onClick={() => {
                        if (selectedRows.length === 0) {
                            void exportPanelOverview();
                            return;
                        }
                        setShowPdfConfirm(true);
                    }} disabled={exporting} aria-label={exporting ? 'Exporting overview PDF' : 'Export overview PDF'} title={exporting ? 'Exporting…' : 'Export overview PDF'}>
                        <PdfIcon size={20} />
                    </button>
                    {embedded && onRequestExit && <button
                        type="button"
                        className="export-button applet-close-button"
                        onClick={onRequestExit}
                        aria-label="Close panel builder and return to cockpit"
                        autoFocus
                    >
                        <X size={16} /> Close
                    </button>}
                </div>
            </header>
            <div className="panel-shell">
                <aside
                    ref={sidebarRef}
                    className={`panel-sidebar ${sidebarCollapsed ? 'is-collapsed' : ''}`}
                    style={{ '--panel-sidebar-width': `${sidebarWidth}px` } as CSSProperties}
                >
                    <button
                        type="button"
                        className="panel-sidebar-toggle"
                        onClick={() => setSidebarCollapsed(previous => !previous)}
                        aria-label={sidebarCollapsed ? 'Show fluorophore sidebar' : 'Hide fluorophore sidebar'}
                        title={sidebarCollapsed ? 'Show fluorophore sidebar' : 'Hide fluorophore sidebar'}
                    >
                        {sidebarCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
                    </button>
                    <div className="selector-list">
                        {slots.map((fluor, index) => {
                            const display = activeSlot === index ? (queries[index] ?? fluor) : fluor;
                            const color = colorByFluor.get(fluor) || '#d1d5db';
                            const isHovered = hoveredFluor === fluor;
                            return (
                                <div
                                    className={`selector-row${fluor ? ' has-fluor' : ''}${isHovered ? ' is-fluor-hovered' : ''}`}
                                    key={`slot-${index}`}
                                    onMouseEnter={() => fluor && setHoveredFluor(fluor)}
                                    onMouseLeave={() => fluor && setHoveredFluor(null)}
                                    style={fluor ? ({ '--fluor-color': color } as CSSProperties) : undefined}
                                >
                                    <div className="selector-swatch" style={{ background: color }} />
                                    <div>
                                        <input
                                            className="selector-input"
                                            value={display}
                                            placeholder="Select fluorophore"
                                            onFocus={() => {
                                                setActiveSlot(index);
                                                setQueries(prev => ({ ...prev, [index]: fluor }));
                                            }}
                                            onChange={event => {
                                                setActiveSlot(index);
                                                setQueries(prev => ({ ...prev, [index]: event.target.value }));
                                            }}
                                            onKeyDown={event => {
                                                if (event.key !== 'Enter') return;
                                                const first = filteredOptions(index)[0];
                                                if (first) void updateSlot(index, first.fluorophore);
                                            }}
                                        />
                                        {activeSlot === index && (
                                            <div className="fluor-dropdown">
                                                {filteredOptions(index).map(option => (
                                                    <button
                                                        type="button"
                                                        className="fluor-option"
                                                        key={option.fluorophore}
                                                        onMouseDown={event => event.preventDefault()}
                                                        onClick={() => void updateSlot(index, option.fluorophore)}
                                                    >
                                                        <span className="fluor-option-swatch" style={{ background: option.peak_color || '#d1d5db' }} />
                                                        <span className="fluor-option-name">{option.fluorophore}</span>
                                                        {option.mapping_confidence === 'estimated' && (
                                                            <span
                                                                className="fluor-option-confidence"
                                                                title={option.mapping_note || 'Estimated from public fluorophore emission data and detector filters.'}
                                                            >
                                                                estimated
                                                            </span>
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <button className="clear-slot" type="button" onClick={() => void removeSlot(index)} aria-label="Remove fluorophore row">
                                        <X size={13} />
                                    </button>
                                </div>
                            );
                        })}
                        <button
                            type="button"
                            className="fluor-option"
                            onClick={addSlot}
                            disabled={slots.length >= payload.max_panel_size}
                            title={slots.length >= payload.max_panel_size ? `Maximum panel size: ${payload.max_panel_size} detectors` : 'Add fluorophore row'}
                        >
                            <span><Plus size={16} /> Add fluorophore row</span>
                        </button>
                    </div>
                    <div className="panel-sidebar-color-count" aria-live="polite">
                        ({selected.length} {selected.length === 1 ? 'color' : 'colors'})
                    </div>
                </aside>

                {!sidebarCollapsed && (
                    <div
                        className="panel-sidebar-resizer"
                        role="separator"
                        aria-label="Resize fluorophore sidebar"
                        aria-orientation="vertical"
                        aria-valuemin={MIN_SIDEBAR_WIDTH}
                        aria-valuemax={MAX_SIDEBAR_WIDTH}
                        aria-valuenow={Math.round(sidebarWidth)}
                        tabIndex={0}
                        onPointerDown={beginSidebarResize}
                        onKeyDown={resizeSidebarByKeyboard}
                    />
                )}

                <PanelVisualizations
                    payload={payload}
                    selected={selected}
                    selectedEntries={selectedEntries}
                    emissions={emissions}
                    lasers={lasers}
                    tab={tab}
                    setTab={setTab}
                    onMarkerChange={updateMarkerWithHistory}
                    spectraByName={spectraByName}
                    similarityByName={similarityByName}
                    colorByFluor={colorByFluor}
                    hoveredFluor={hoveredFluor}
                    theme={embedded && cockpitTheme ? cockpitTheme : theme}
                    error={error}
                    plotScale={plotScale}
                    onPlotScaleChange={setPlotScale}
                />
            </div>
            {showPanelWizard && (
                <Suspense fallback={<div className={`panel-wizard-backdrop ${embedded && cockpitTheme ? cockpitTheme : theme}`} />}>
                    <PanelWizard
                        key={`panel-wizard-${wizardSyncRevision}`}
                        cytometer={cytometer}
                        configuration={configuration}
                        configurationLabel={selectedConfigurationLabel}
                        availableFluorophores={payload.fluorophores.map((item) => item.fluorophore)}
                        maxPanelSize={payload.max_panel_size}
                        measurementMode={payload.measurement_mode}
                        slots={slots}
                        markerNames={markers}
                        theme={embedded && cockpitTheme ? cockpitTheme : theme}
                        initialState={wizardState}
                        onStateChange={handleWizardStateChange}
                        onClearPanel={clearPanelContent}
                        onClose={() => {
                            setShowPanelWizard(false);
                        }}
                        onApply={applyWizardRecommendations}
                    />
                </Suspense>
            )}
            {showClearConfirmation && (
                <ClearPanelConfirmation
                    busy={clearingPanel}
                    onCancel={() => setShowClearConfirmation(false)}
                    onConfirm={confirmClearPanel}
                />
            )}
            {showPdfConfirm && (
                <div className="panel-confirm-overlay" onMouseDown={() => setShowPdfConfirm(false)}>
                    <div className="panel-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="panel-pdf-confirm-title" onMouseDown={event => event.stopPropagation()}>
                        <h2 id="panel-pdf-confirm-title">Generate PDF report for panel?</h2>
                        <p>The report will contain the current panel overview and selected fluorophores.</p>
                        <div className="panel-confirm-actions">
                            <button type="button" className="panel-confirm-cancel" onClick={() => setShowPdfConfirm(false)}>Cancel</button>
                            <button type="button" className="panel-confirm-submit" onClick={() => {
                                setShowPdfConfirm(false);
                                void exportPanelOverview();
                            }}>Generate PDF</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PanelBuilder;
