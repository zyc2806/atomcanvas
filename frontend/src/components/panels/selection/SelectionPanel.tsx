import React, { useState, useEffect, useMemo } from 'react';
import {
    Box, Typography, Button, Select, MenuItem, TextField,
    FormControl, InputLabel, Divider, FormHelperText, Paper
} from '@mui/material';
import Collapse from '@mui/material/Collapse';
import Chip from '@mui/material/Chip';
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

const distinctColors = ['#FF5733', '#33FF57', '#3357FF', '#FF33A1', '#A133FF', '#33FFA1', '#FFC300', '#C70039', '#900C3F', '#581845'];

const METHODS = [
    { id: 'element', label: 'Element' }, { id: 'label', label: 'Label' },
    { id: 'position', label: 'Position' }, { id: 'slab', label: 'Slab' },
    { id: 'sphere', label: 'Sphere' }, { id: 'bonded', label: 'Bonded' },
    { id: 'percentile', label: 'Percentile' }, { id: 'extend', label: 'Extend' },
    { id: 'special', label: 'Special' }, { id: 'connected', label: 'Connected' },
] as const;

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

        handleSelectionAction(finalIndices, finalOp);
        setSelectionExpression(combineExpressions(operation === 'exclude' && finalOp === 'replace' ? '' : selectionExpression, expressionPart, operation));

        const count = useStructureStore.getState().selectedAtoms.length;
        notify(`Selected ${count} atom${count === 1 ? '' : 's'}`);
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
            console.error(e);
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
            console.error(e);
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
            console.error(e);
            setAnalysisMessage("Analysis failed.");
        }
    };

    const handleSlabSelection = (operation: 'replace' | 'add' | 'filter' | 'exclude') => {
        if (slabTarget === null || !clusterIndices) return;
        const indices = clusterIndices.map((id, i) => id === slabTarget ? i : -1).filter(i => i !== -1);

        processSelection(indices, operation, `slab:${slabAxis},${slabClusters},${slabTarget + 1}`);

        setColorOverrides(useStructureStore.getState().perAtomColorOverrides ?? null);
        setClusterIndices(null);
        setSlabTarget(null);
        setAnalysisMessage('Layer selected.');
    };

    return (
        <Box sx={{ p: 2, width: 340, boxSizing: 'border-box', minWidth: 0, overflowX: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                 <Typography variant="body2">{selectedAtoms.length} atoms selected</Typography>
            </Paper>

            <Box sx={{ mt: 2 }}>
                <OperationModeSelector value={operation} onChange={setOperation} />
            </Box>

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 2 }}>
                {METHODS.map((m) => (
                    <Chip
                        key={m.id}
                        label={m.label}
                        size="small"
                        color={activeMethod === m.id ? 'primary' : 'default'}
                        variant={activeMethod === m.id ? 'filled' : 'outlined'}
                        onClick={() => setActiveMethod(m.id)}
                        sx={{ height: 24, fontSize: '0.72rem' }}
                    />
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
                        <Button fullWidth variant="contained" size="small" onClick={() => handleSelectByElement(operation)}>Apply</Button>
                    </Box>
                )}
                {activeMethod === 'label' && (
                    <Box>
                        <TextField fullWidth size="small" label="Labels (e.g., C1-5, O2)" value={labelInput} onChange={e => setLabelInput(e.target.value)} sx={{ mb: 2 }} />
                        <Button fullWidth variant="contained" size="small" onClick={() => handleSelectByLabel(operation)}>Apply</Button>
                    </Box>
                )}
                {activeMethod === 'position' && (
                    <Box>
                        <FormControl fullWidth size="small" sx={{ mb: 1 }}><InputLabel>Coordinates</InputLabel><Select value={positionCoordType} label="Coordinates" onChange={e => setPositionCoordType(e.target.value as 'cartesian' | 'fractional')}><MenuItem value="cartesian">Cartesian</MenuItem><MenuItem value="fractional">Fractional</MenuItem></Select></FormControl>
                        <TextField fullWidth size="small" label="Criteria (e.g., z > 10.5)" value={positionInput} onChange={e => setPositionInput(e.target.value)} sx={{ mb: 2 }} />
                        <Button fullWidth variant="contained" size="small" onClick={() => handleSelectByPosition(operation)}>Apply</Button>
                    </Box>
                )}
                {activeMethod === 'slab' && (
                    <Box>
                        <Box sx={{ display: 'flex', gap: 1, mb: 1 }}><TextField fullWidth type="number" size="small" label="Layers" value={slabClusters} onChange={e => setSlabClusters(Math.max(2, +e.target.value))} /><Select value={slabAxis} size="small" onChange={e => setSlabAxis(e.target.value as 'x' | 'y' | 'z')}><MenuItem value="x">X</MenuItem><MenuItem value="y">Y</MenuItem><MenuItem value="z">Z</MenuItem></Select></Box>
                        <Button fullWidth onClick={handleAnalyzeClusters}>Analyze</Button>
                        {analysisMessage && <FormHelperText sx={{ mt: 1, textAlign: 'center' }}>{analysisMessage}</FormHelperText>}
                        <Divider sx={{ my: 2 }} />
                        <Typography variant="body2" align="center" sx={{ mb: 1, height: '20px' }}>{slabTarget !== null ? `Target: Layer ${slabTarget + 1}` : 'No layer picked'}</Typography>
                        <Button fullWidth variant="contained" size="small" onClick={() => handleSlabSelection(operation)} disabled={slabTarget === null}>Apply</Button>
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
                <Collapse in={showExpression} unmountOnExit><Box sx={{ p: 1 }}><SelectionInput /></Box></Collapse>
            </Box>
        </Box>
    );
};

export default SelectionPanel;
