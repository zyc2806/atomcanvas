import React, { useState, useEffect, useMemo } from 'react';
import {
    Box, Typography, Button, Select, MenuItem, TextField,
    FormControl, InputLabel, Divider, FormHelperText, Paper, Tooltip
} from '@mui/material';
import Collapse from '@mui/material/Collapse';
import Chip from '@mui/material/Chip';
import axios from 'axios';
import useStructureStore from '../../../store/useStructureStore';
import { selectionService } from '../../../services/selectionService';
import SelectionInput from './SelectionInput';
import SphereTab from './tabs/SphereTab';
import BondedTab from './tabs/BondedTab';
import PercentileTab from './tabs/PercentileTab';
import ExtendTab from './tabs/ExtendTab';
import SpecialTab from './tabs/SpecialTab';
import ConnectedTab from './tabs/ConnectedTab';
import { OperationModeSelector, type OpMode } from './OperationModeSelector';
import { applyButtonLabel } from './applyButtonLabel';

const distinctColors = ['#FF5733', '#33FF57', '#3357FF', '#FF33A1', '#A133FF', '#33FFA1', '#FFC300', '#C70039', '#900C3F', '#581845'];

// Internal method ids (used by selection logic / expression prefixes) stay fixed;
// only the visible chip labels are friendlier (`slab` → "Layers", `special` → "Fixed").
const METHODS = [
    { id: 'element',    label: 'Element',    hint: 'Select all atoms of a chemical element' },
    { id: 'label',      label: 'Label',      hint: 'Select by atom index/label' },
    { id: 'position',   label: 'Position',   hint: 'Select by a coordinate threshold' },
    { id: 'slab',       label: 'Layers',     hint: 'Divide the cell into N layers along an axis and pick a layer' },
    { id: 'sphere',     label: 'Sphere',     hint: 'Select atoms within a radius of a point/atom' },
    { id: 'bonded',     label: 'Bonded',     hint: 'Atoms directly bonded to the selected atom' },
    { id: 'percentile', label: 'Percentile', hint: 'Atoms in the top/bottom % along an axis' },
    { id: 'extend',     label: 'Extend',     hint: 'Grow the current selection N bonds outward' },
    { id: 'special',    label: 'Fixed',      hint: 'Atoms frozen in place (FixAtoms constraint)' },
    { id: 'connected',  label: 'Connected',  hint: 'The whole fragment touching this atom' },
] as const;

// Plain-English name for each operation mode, matching the OperationModeSelector
// labels so the (silently sticky) active mode reads the same everywhere.
const OP_MODE_LABELS: Record<OpMode, string> = {
    replace: 'Replace',
    add: 'Add',
    filter: 'Intersect',
    exclude: 'Exclude',
};

// Backend selection errors put their message under response.data.detail, which can
// be a plain string or a structured object (e.g. FastAPI validation errors). Mirror
// TransformPanel's errorDetail normalization but render objects readably.
function errorDetail(error: unknown): string {
    if (axios.isAxiosError(error)) {
        const detail = error.response?.data?.detail;
        if (typeof detail === 'string' && detail) return detail;
        if (detail != null) {
            try { return JSON.stringify(detail); } catch { /* fall through */ }
        }
        return error.message;
    }
    return error instanceof Error ? error.message : 'An unknown error occurred';
}

const combineExpressions = (oldExpr: string, newExpr: string, operation: 'replace' | 'add' | 'filter' | 'exclude') => {
    if (operation === 'replace' || !oldExpr) {
        return operation === 'exclude' ? `NOT (${newExpr})` : newExpr;
    }
    if (operation === 'add') {
        return `(${oldExpr}) OR (${newExpr})`;
    }
    if (operation === 'filter') {
        return `(${oldExpr}) AND (${newExpr})`;
    }
    if (operation === 'exclude') {
         return `(${oldExpr}) AND (NOT (${newExpr}))`;
    }
    return newExpr;
};

const SelectionPanel: React.FC = () => {
    const {
        structureData, selectedAtoms, updateSelection,
        setClusterIndices, setColorOverrides, clusterIndices,
        slabTarget, setSlabTarget, setSelectionMode,
        selectionExpression, setSelectionExpression, activeTabId, notify
    } = useStructureStore();

    const getLatestActiveTabId = (): string | null => {
        const storeApi = useStructureStore as unknown as {
            getState?: () => { activeTabId?: string | null }
        };
        if (typeof storeApi.getState === 'function') {
            const snapshot = storeApi.getState();
            if (snapshot && typeof snapshot === 'object') {
                return snapshot.activeTabId ?? null;
            }
        }
        return activeTabId ?? null;
    };

    const [operation, setOperation] = useState<OpMode>('replace');
    const [activeMethod, setActiveMethod] = useState<string>('element');
    const [showExpression, setShowExpression] = useState(false);

    // Local Inputs
    const [selectElement, setSelectElement] = useState('H');
    const [labelInput, setLabelInput] = useState('');
    const [positionInput, setPositionInput] = useState('');
    const [positionCoordType, setPositionCoordType] = useState<'cartesian' | 'fractional'>('cartesian');
    const [slabClusters, setSlabClusters] = useState(2);
    const [slabAxis, setSlabAxis] = useState<'x' | 'y' | 'z'>('z');
    const [analysisMessage, setAnalysisMessage] = useState<string | null>(null);

    const uniqueSymbols = useMemo(() => {
        if (!structureData) return [];
        return [...new Set(structureData.structure.symbols)].sort();
    }, [structureData]);

    const effectiveSelectElement = uniqueSymbols.includes(selectElement)
        ? selectElement
        : (uniqueSymbols[0] || '');

    // Effect to set selection mode based on the active method.
    useEffect(() => {
        if (activeMethod === 'slab') {
            setSelectionMode('slab');
        } else {
            setSelectionMode('disabled');
            setClusterIndices(null);
            setSlabTarget(null);
        }
    }, [activeMethod, setSelectionMode, setClusterIndices, setSlabTarget]);

    const handleSelectionAction = (indices: number[], operation: 'replace' | 'add' | 'filter') => updateSelection(indices, operation);

    const processSelection = (
        indices: number[],
        operation: 'replace' | 'add' | 'filter' | 'exclude',
        expressionPart: string,
        originStructureId?: string | null,
    ) => {
        if (!structureData) return;
        if (originStructureId && getLatestActiveTabId() !== originStructureId) {
            return;
        }

        let finalIndices = indices;
        const finalOp: 'replace' | 'add' | 'filter' = operation === 'exclude' ? 'replace' : operation;

        if (operation === 'exclude') {
             const excluded = new Set(indices);
             const atomCount = structureData.structure.symbols.length;
             const complement: number[] = [];

             for (let i = 0; i < atomCount; i++) {
                 if (!excluded.has(i)) {
                     complement.push(i);
                 }
             }

             finalIndices = complement;
        }

        // A successful query that matched nothing is a real outcome the user
        // should see — not a silent no-op. (Exclude inverts the match set, so an
        // empty match there means "select all" — a visible result, not a no-op.)
        if (indices.length === 0 && operation !== 'exclude') {
            notify('No atoms matched', 'warning');
            return;
        }

        handleSelectionAction(finalIndices, finalOp);
        setSelectionExpression(combineExpressions(operation === 'exclude' && finalOp === 'replace' ? '' : selectionExpression, expressionPart, operation));

        const count = useStructureStore.getState().selectedAtoms.length;
        // Surface the active operation mode so a user who left it on Intersect /
        // Exclude can see why the count changed the way it did.
        notify(`Selected ${count} atom${count === 1 ? '' : 's'} (mode: ${OP_MODE_LABELS[operation]})`);
    };

    const handleSelectByElement = (operation: 'replace' | 'add' | 'filter' | 'exclude') => {
        if (!structureData) return;
        if (!effectiveSelectElement) return;

        const indices = structureData.structure.symbols
            .map((s, i) => s === effectiveSelectElement ? i : -1)
            .filter(i => i !== -1);
        processSelection(indices, operation, `elem:${effectiveSelectElement}`);
    };

    const handleSelectByLabel = async (operation: 'replace' | 'add' | 'filter' | 'exclude') => {
        if (!labelInput || !structureData) return;
        const originStructureId = getLatestActiveTabId();
        try {
            const data = await selectionService.parseLabels(structureData.structure, labelInput);
            processSelection(data.indices, operation, `label:${labelInput}`, originStructureId);
        } catch (e) {
            notify(`Label selection failed: ${errorDetail(e)}`, 'error');
        }
    };

    const handleSelectByPosition = async (operation: 'replace' | 'add' | 'filter' | 'exclude') => {
        if (!positionInput || !structureData) return;
        const originStructureId = getLatestActiveTabId();
        try {
            const data = await selectionService.filterPosition(structureData.structure, positionInput, positionCoordType);
            const prefix = positionCoordType === 'cartesian' ? 'pos' : 'frac';
            processSelection(data.indices, operation, `${prefix}:${positionInput}`, originStructureId);
        } catch (e) {
            notify(`Position selection failed: ${errorDetail(e)}`, 'error');
        }
    };

    const handleAnalyzeClusters = async () => {
        if (!structureData) return;
        const originStructureId = getLatestActiveTabId();
        setSelectionMode('slab');
        setSlabTarget(null);
        try {
            const data = await selectionService.analyzeClusters(structureData.structure, slabClusters, ['x', 'y', 'z'].indexOf(slabAxis));
            if (originStructureId && getLatestActiveTabId() !== originStructureId) {
                return;
            }
            const ids: number[] = data.cluster_ids;
            setClusterIndices(ids);
            const overrides: { [index: number]: string } = {};
            ids.forEach((id, index) => { overrides[index] = distinctColors[id % distinctColors.length]; });
            setColorOverrides(overrides);
            setAnalysisMessage(`Analysis complete. ${new Set(ids).size} layers found. Pick an atom in the viewer.`);
        } catch (e) {
            const message = errorDetail(e);
            notify(`Layer analysis failed: ${message}`, 'error');
        }
    };

    const handleSlabSelection = (operation: 'replace' | 'add' | 'filter' | 'exclude') => {
        if (!structureData) return;
        if (slabTarget === null || !clusterIndices) return;
        try {
            const indices = clusterIndices.map((id, i) => id === slabTarget ? i : -1).filter(i => i !== -1);

            processSelection(indices, operation, `slab:${slabAxis},${slabClusters},${slabTarget + 1}`);

            setColorOverrides(useStructureStore.getState().perAtomColorOverrides ?? null);
            setClusterIndices(null);
            setSlabTarget(null);
        } catch (e) {
            notify(`Layer apply failed: ${errorDetail(e)}`, 'error');
        }
    };

    return (
        <Box sx={{ p: 2, width: 340, boxSizing: 'border-box', minWidth: 0, overflowX: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                 <Typography variant="body2">{selectedAtoms.length} atoms selected</Typography>
                 <Typography variant="caption" color="text.secondary">Mode: {OP_MODE_LABELS[operation]}</Typography>
            </Paper>

            <Box sx={{ mt: 2 }}>
                <OperationModeSelector value={operation} onChange={setOperation} />
            </Box>

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 2 }}>
                {METHODS.map((m) => (
                    <Tooltip key={m.id} title={m.hint}>
                        {/* The span sits between Tooltip and Chip so the aria-label from
                            the Tooltip title lands on the span, leaving the Chip's own
                            accessible name (derived from its label) intact. This ensures
                            getByRole('button', {name: 'Layers'}) etc. keep working. */}
                        <span aria-label={m.hint}>
                            <Chip
                                label={m.label}
                                size="small"
                                color={activeMethod === m.id ? 'primary' : 'default'}
                                variant={activeMethod === m.id ? 'filled' : 'outlined'}
                                onClick={() => setActiveMethod(m.id)}
                                sx={{ height: 24, fontSize: '0.72rem' }}
                            />
                        </span>
                    </Tooltip>
                ))}
            </Box>

            <Box sx={{ mt: 2 }}>
                {activeMethod === 'element' && (
                    <Box>
                        <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                            <InputLabel id="element-select-label">Element</InputLabel>
                            <Select
                                labelId="element-select-label"
                                value={effectiveSelectElement}
                                label="Element"
                                onChange={e => setSelectElement(e.target.value)}
                            >
                                {uniqueSymbols.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                            </Select>
                        </FormControl>
                        <Button fullWidth variant="contained" size="small" onClick={() => handleSelectByElement(operation)}>{applyButtonLabel(operation)}</Button>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                            Choose an element symbol, e.g. C, Fe, O.
                        </Typography>
                    </Box>
                )}
                {activeMethod === 'label' && (
                    <Box>
                        <TextField fullWidth size="small" label="Labels (e.g., C1-5, O2)" value={labelInput} onChange={e => setLabelInput(e.target.value)} sx={{ mb: 2 }} />
                        <Button fullWidth variant="contained" size="small" onClick={() => handleSelectByLabel(operation)}>{applyButtonLabel(operation)}</Button>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                            Atom indices or ranges, e.g. 0, 3, 5-9.
                        </Typography>
                    </Box>
                )}
                {activeMethod === 'position' && (
                    <Box>
                        <FormControl fullWidth size="small" sx={{ mb: 1 }}><InputLabel>Coordinates</InputLabel><Select value={positionCoordType} label="Coordinates" onChange={e => setPositionCoordType(e.target.value as 'cartesian' | 'fractional')}><MenuItem value="cartesian">Cartesian</MenuItem><MenuItem value="fractional">Fractional</MenuItem></Select></FormControl>
                        <TextField fullWidth size="small" label="Criteria (e.g., z > 10.5)" value={positionInput} onChange={e => setPositionInput(e.target.value)} sx={{ mb: 2 }} />
                        <Button fullWidth variant="contained" size="small" onClick={() => handleSelectByPosition(operation)}>{applyButtonLabel(operation)}</Button>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                            e.g. z &gt; 10.5 — Cartesian (Å) or fractional.
                        </Typography>
                    </Box>
                )}
                {activeMethod === 'slab' && (
                    <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>
                            1. Analyze layers
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1, mb: 1 }}><TextField fullWidth type="number" size="small" label="Layers" value={slabClusters} onChange={e => setSlabClusters(Math.max(2, +e.target.value))} /><Select value={slabAxis} size="small" onChange={e => setSlabAxis(e.target.value as 'x' | 'y' | 'z')}><MenuItem value="x">X</MenuItem><MenuItem value="y">Y</MenuItem><MenuItem value="z">Z</MenuItem></Select></Box>
                        <Button fullWidth variant="outlined" onClick={handleAnalyzeClusters}>Analyze</Button>
                        {analysisMessage && <FormHelperText sx={{ mt: 1, textAlign: 'center' }}>{analysisMessage}</FormHelperText>}
                        <Divider sx={{ my: 2 }} />
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>
                            2. Click a layer in the viewer
                        </Typography>
                        <Typography variant="body2" align="center" sx={{ mb: 1, height: '20px' }}>{slabTarget !== null ? `Target: Layer ${slabTarget + 1}` : 'No layer picked'}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>
                            3. Apply
                        </Typography>
                        <Button fullWidth variant="contained" size="small" onClick={() => handleSlabSelection(operation)} disabled={slabTarget === null}>{applyButtonLabel(operation)}</Button>
                    </Box>
                )}
                {activeMethod === 'sphere' && <SphereTab onSelect={processSelection} operation={operation} />}
                {activeMethod === 'bonded' && <BondedTab onSelect={processSelection} operation={operation} />}
                {activeMethod === 'percentile' && <PercentileTab onSelect={processSelection} operation={operation} />}
                {activeMethod === 'extend' && <ExtendTab onSelect={processSelection} operation={operation} />}
                {activeMethod === 'special' && <SpecialTab onSelect={processSelection} operation={operation} />}
                {activeMethod === 'connected' && <ConnectedTab onSelect={processSelection} operation={operation} />}
            </Box>

            <Box sx={{ mt: 2, borderTop: 1, borderColor: 'divider', pt: 1 }}>
                <Button size="small" onClick={() => setShowExpression((v) => !v)}>
                    {showExpression ? '▾' : '▸'} Expression (advanced)
                </Button>
                <Collapse in={showExpression} unmountOnExit><Box sx={{ p: 1 }}><SelectionInput operation={operation} onSelect={processSelection} /></Box></Collapse>
            </Box>
        </Box>
    );
};

export default SelectionPanel;
