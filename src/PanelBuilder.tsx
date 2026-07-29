import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { ArrowLeft, ChevronDown, Download, FileJson2, FileSpreadsheet, Minus, Moon, PanelLeftClose, PanelLeftOpen, Plus, Sun, Trash2, Upload, WandSparkles, X } from 'lucide-react';
import './PanelBuilder.css';
import { ModuleLoadingState } from './ModuleLoadingState';
import { PanelWizard } from './PanelWizard';
import type { WizardApplication } from './PanelWizard';
import { PanelVisualizations } from './PanelVisualizations';
import { UiSelect } from './UiSelect';
import { rankUiSelectOptions } from './uiSelectSearch';
import { openTextFile, projectJsonFilename, saveBlob } from './browserFiles';
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
        if (initialProject?.theme) return initialProject.theme;
        const stored = localStorage.getItem('spectreasy-theme') || localStorage.getItem('spectreasy_theme');
        if (stored === 'light' || stored === 'dark') return stored;
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    });
    const [guiStateLoaded, setGuiStateLoaded] = useState(false);
    const [sidebarWidth, setSidebarWidth] = useState(initialProject?.sidebarWidth ?? 214);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(initialProject?.sidebarCollapsed ?? false);
    const [plotScale, setPlotScale] = useState(
        initialProject?.plotScaleMode === 'fit-width' ? initialProject.plotScale : DEFAULT_PLOT_SCALE,
    );
    const [showPdfConfirm, setShowPdfConfirm] = useState(false);
    const [showPanelWizard, setShowPanelWizard] = useState(false);
    const [wizardState, setWizardState] = useState<WizardProjectState | null>(() => initialProject?.wizard ?? null);
    const [cytometerPanels, setCytometerPanels] = useState<Record<string, CytometerPanelState>>(
        () => initialProject?.cytometerPanels ?? {},
    );
    const [fileMenu, setFileMenu] = useState<'import' | 'export' | null>(null);
    const [bootAttempt, setBootAttempt] = useState(0);

    useEffect(() => () => sidebarResizeCleanupRef.current?.(), []);

    useEffect(() => {
        localStorage.setItem('spectreasy_cytometer', getCytometerName(cytometer));
    }, [cytometer]);

    useEffect(() => {
        localStorage.setItem('spectreasy_configuration', getCytometerName(configuration));
    }, [configuration]);

    useEffect(() => {
        if (embedded) return;
        localStorage.setItem('spectreasy-theme', theme);
        localStorage.removeItem('spectreasy_theme');
        document.documentElement.dataset.theme = theme;
    }, [embedded, theme]);

    useEffect(() => {
        localStorage.setItem('spectreasy_slots', JSON.stringify(slots));
    }, [slots]);

    useEffect(() => {
        localStorage.setItem('spectreasy_markers', JSON.stringify(markers));
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

    useEffect(() => {
        if (!guiStateLoaded) return;
        const timer = window.setTimeout(() => {
            void persistProjectState().catch(() => null);
        }, 500);
        return () => window.clearTimeout(timer);
    }, [guiStateLoaded, persistProjectState]);

    const selected = useMemo(() => slots.filter(Boolean), [slots]);

    useEffect(() => {
        slotsRef.current = slots;
    }, [slots]);

    const selectedSet = useMemo(() => new Set(selected), [selected]);

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
            if (event.key === 'Escape') setFileMenu(null);
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, []);

    const updateSlot = async (index: number, fluor: string) => {
        const currentSlots = slotsRef.current;
        if (fluor && currentSlots.some((existing, i) => i !== index && existing === fluor)) return;
        const nextSlots = currentSlots.map((existing, i) => (i === index ? fluor : existing));
        slotsRef.current = nextSlots;
        setSlots(nextSlots);
        localStorage.setItem('spectreasy_slots', JSON.stringify(nextSlots));
        setQueries(prev => ({ ...prev, [index]: '' }));
        setActiveSlot(null);
        await fetchPanel(cytometer, configuration, nextSlots.filter(Boolean)).catch(err => {
            setError(err instanceof Error ? err.message : 'Could not update panel.');
        });
    };

    const removeSlot = async (index: number) => {
        const nextSlots = slotsRef.current.filter((_, slotIndex) => slotIndex !== index);
        const nextMarkers = Object.fromEntries(
            Object.entries(markers)
                .map(([key, value]) => [Number(key), value] as const)
                .filter(([slotIndex]) => slotIndex !== index)
                .map(([slotIndex, value]) => [slotIndex > index ? slotIndex - 1 : slotIndex, value]),
        );
        slotsRef.current = nextSlots;
        setSlots(nextSlots);
        setMarkers(nextMarkers);
        setQueries((current) => Object.fromEntries(
            Object.entries(current)
                .map(([key, value]) => [Number(key), value] as const)
                .filter(([slotIndex]) => slotIndex !== index)
                .map(([slotIndex, value]) => [slotIndex > index ? slotIndex - 1 : slotIndex, value]),
        ));
        setActiveSlot(null);
        localStorage.setItem('spectreasy_slots', JSON.stringify(nextSlots));
        localStorage.setItem('spectreasy_markers', JSON.stringify(nextMarkers));
        await fetchPanel(cytometer, configuration, nextSlots.filter(Boolean)).catch(err => {
            setError(err instanceof Error ? err.message : 'Could not update panel.');
        });
        await persistProjectState({ ...projectState, slots: nextSlots, markers: nextMarkers });
    };

    const addSlot = () => setSlots(prev => {
        const next = [...prev, ''];
        slotsRef.current = next;
        localStorage.setItem('spectreasy_slots', JSON.stringify(next));
        return next;
    });

    const applyWizardRecommendations = async ({
        markers: wizardMarkers,
        recommendations,
        desiredSize,
    }: WizardApplication) => {
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
        setSlots(nextSlots);
        setMarkers(nextMarkers);
        localStorage.setItem('spectreasy_slots', JSON.stringify(nextSlots));
        localStorage.setItem('spectreasy_markers', JSON.stringify(nextMarkers));
        await fetchPanel(cytometer, configuration, nextSlots.filter(Boolean)).catch((wizardError) => {
            throw wizardError instanceof Error ? wizardError : new Error('Could not apply the panel recommendations.');
        });
        await persistProjectState({ ...projectState, slots: nextSlots, markers: nextMarkers });
    };

    const changeCytometer = async (nextCytometer: string) => {
        try {
            const savedPanels = projectState.cytometerPanels;
            const savedPanel = savedPanels[nextCytometer];
            const requestedSlots = savedPanel ? [...savedPanel.slots] : Array(emptySlots).fill('');
            const requestedMarkers = savedPanel ? { ...savedPanel.markers } : {};
            const requestedWizard = savedPanel?.wizard ?? null;
            const nextPayload = await fetchPanel(
                nextCytometer,
                savedPanel?.configuration || '',
                requestedSlots.filter(Boolean),
                true,
            );
            if (!nextPayload) return;
            const availableSet = new Set(nextPayload.fluorophores.map(f => f.fluorophore));
            const nextSlots = requestedSlots.map(fluor => (availableSet.has(fluor) ? fluor : ''));
            const nextMarkers: Record<number, string> = {};
            Object.entries(requestedMarkers).forEach(([key, val]) => {
                const idx = parseInt(key, 10);
                if (nextSlots[idx]) nextMarkers[idx] = val;
            });
            slotsRef.current = nextSlots;
            setSlots(nextSlots);
            setMarkers(nextMarkers);
            setCytometerPanels(savedPanels);
            localStorage.setItem('spectreasy_slots', JSON.stringify(nextSlots));
            localStorage.setItem('spectreasy_markers', JSON.stringify(nextMarkers));
            setPayload(nextPayload);
            setWizardState(requestedWizard);
            setQueries({});
            setActiveSlot(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not switch cytometer.');
        }
    };

    const applyPayloadAvailability = (nextPayload: PanelPayload) => {
        const availableSet = new Set(nextPayload.fluorophores.map(f => f.fluorophore));
        const nextSlots = slotsRef.current.map(fluor => (availableSet.has(fluor) ? fluor : ''));
        const nextMarkers: Record<number, string> = {};
        Object.entries(markers).forEach(([key, val]) => {
            const idx = parseInt(key, 10);
            if (nextSlots[idx]) nextMarkers[idx] = val;
        });
        slotsRef.current = nextSlots;
        setSlots(nextSlots);
        setMarkers(nextMarkers);
        localStorage.setItem('spectreasy_slots', JSON.stringify(nextSlots));
        localStorage.setItem('spectreasy_markers', JSON.stringify(nextMarkers));
        setPayload(nextPayload);
    };

    const changeConfiguration = async (nextConfiguration: string) => {
        try {
            const nextPayload = await fetchPanel(cytometer, nextConfiguration, slotsRef.current.filter(Boolean), true);
            if (!nextPayload) return;
            applyPayloadAvailability(nextPayload);
            setWizardState(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not switch Aurora configuration.');
        }
    };

    const clearSelection = async () => {
        setError('');
        const emptySlotsArray = Array(emptySlots).fill('');
        slotsRef.current = emptySlotsArray;
        setSlots(emptySlotsArray);
        setMarkers({});
        setWizardState(null);
        localStorage.setItem('spectreasy_slots', JSON.stringify(emptySlotsArray));
        localStorage.setItem('spectreasy_markers', JSON.stringify({}));
        setQueries({});
        setActiveSlot(null);
        try {
            await fetchPanel(cytometer, configuration, [], true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not clear selection.');
        }
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
            const nextSlots = imported.map(row => row.fluor);
            while (nextSlots.length < emptySlots) nextSlots.push('');
            slotsRef.current = nextSlots;
            setSlots(nextSlots);
            const nextMarkers: Record<number, string> = {};
            imported.forEach((row, index) => {
                if (row.marker) nextMarkers[index] = row.marker;
            });
            setMarkers(nextMarkers);
            setWizardState(null);
            localStorage.setItem('spectreasy_slots', JSON.stringify(nextSlots));
            localStorage.setItem('spectreasy_markers', JSON.stringify(nextMarkers));
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
            const available = new Set(nextPayload.fluorophores.map((item) => item.fluorophore));
            const nextSlots = state.slots.map((fluorophore) => available.has(fluorophore) ? fluorophore : '');
            const nextMarkers = Object.fromEntries(
                Object.entries(state.markers).filter(([index]) => nextSlots[Number(index)]),
            ) as Record<number, string>;
            slotsRef.current = nextSlots;
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

    const exitToPanelLibrary = async () => {
        await persistProjectState();
        await onRequestExit?.();
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
                <button
                    type="button"
                    className="export-button wizard-launch-button panel-wizard-header-action"
                    onClick={() => setShowPanelWizard(true)}
                    aria-label="Open panel wizard"
                >
                    <WandSparkles size={17} aria-hidden="true" />
                    <span>Panel wizard</span>
                </button>
                <div className="panel-actions">
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
                    {!embedded && <button
                        type="button"
                        className="export-button"
                        onClick={() => setTheme(prev => prev === 'light' ? 'dark' : 'light')}
                        aria-label="Toggle theme"
                        style={{ padding: '0 10px', width: '40px' }}
                    >
                        {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
                    </button>}
                    <button
                        type="button"
                        className="export-button icon-only"
                        onClick={clearSelection}
                        disabled={selected.length === 0}
                        aria-label="Clear selection"
                        title="Clear selection"
                        style={{ color: 'var(--accent-2)' }}
                    >
                        <Trash2 size={16} />
                    </button>
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
                    <div className="panel-sidebar-head">
                        <UiSelect
                            className="panel-sidebar-select"
                            label="Cytometer"
                            hideLabel
                            value={cytometer}
                            options={payload.libraries.map((library) => ({
                                value: library.id,
                                label: library.label,
                            }))}
                            onChange={(value) => void changeCytometer(value)}
                            portalMenu
                            menuClassName="panel-sidebar-select-menu"
                        />
                        {payload.configurations.length > 1 && (
                            <UiSelect
                                className="panel-sidebar-select configuration-sidebar-select"
                                label="Detector configuration"
                                hideLabel
                                value={configuration}
                                options={payload.configurations.map((config) => ({
                                    value: config.id,
                                    label: config.label,
                                }))}
                                onChange={(value) => void changeConfiguration(value)}
                                portalMenu
                                menuClassName="panel-sidebar-select-menu"
                            />
                        )}
                    </div>
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
                                                        {option.fluorophore}
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
                        <button type="button" className="fluor-option" onClick={addSlot}>
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
                    setMarkers={setMarkers}
                    spectraByName={spectraByName}
                    similarityByName={similarityByName}
                    colorByFluor={colorByFluor}
                    hoveredFluor={hoveredFluor}
                    theme={embedded && cockpitTheme ? cockpitTheme : theme}
                    error={error}
                    plotScale={plotScale}
                />
            </div>
            {showPanelWizard && (
                <PanelWizard
                    cytometer={cytometer}
                    configuration={configuration}
                    configurationLabel={selectedConfigurationLabel}
                    availableFluorophores={payload.fluorophores.map((item) => item.fluorophore)}
                    maxPanelSize={Math.max(
                        selected.length,
                        Math.min(payload.fluorophores.length, payload.detectors.length),
                    )}
                    slots={slots}
                    markerNames={markers}
                    theme={embedded && cockpitTheme ? cockpitTheme : theme}
                    initialState={wizardState}
                    onStateChange={setWizardState}
                    onClose={() => setShowPanelWizard(false)}
                    onApply={applyWizardRecommendations}
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
