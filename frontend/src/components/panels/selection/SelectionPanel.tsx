import React, { useState, useEffect, useMemo } from 'react';
import {
    Box, Typography, Tabs, Tab, Button, Select, MenuItem, TextField,
    FormControl, InputLabel, Divider, FormHelperText, Switch, FormControlLabel, Paper
} from '@mui/material';
import useStructureStore from '../../../store/useStructureStore';
import { selectionService } from '../../../services/selectionService';
import SelectionInput from './SelectionInput';
import SphereTab from './tabs/SphereTab';
import BondedTab from './tabs/BondedTab';
import PercentileTab from './tabs/PercentileTab';
import ExtendTab from './tabs/ExtendTab';
import SpecialTab from './tabs/SpecialTab';
import ConnectedTab from './tabs/ConnectedTab';

interface TabPanelProps { children?: React.ReactNode; index: number; value: number; }
function TabPanel(props: TabPanelProps) {
    const { children, value, index, ...other } = props;
    return <div role="tabpanel" hidden={value !== index} {...other}>{value === index && <Box sx={{ p: 2 }}>{children}</Box>}</div>;
}

const distinctColors = ['#FF5733', '#33FF57', '#3357FF', '#FF33A1', '#A133FF', '#33FFA1', '#FFC300', '#C70039', '#900C3F', '#581845'];

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
        selectionExpression, setSelectionExpression, visParams, activeTabId
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

    const [advancedSelection, setAdvancedSelection] = useState(false);
    const [selectionTabValue, setSelectionTabValue] = useState(0);

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

    const isCartoon = visParams.renderStyle === 'cartoon';

    const effectiveSelectElement = uniqueSymbols.includes(selectElement)
        ? selectElement
        : (uniqueSymbols[0] || '');

    const effectiveSelectionTabValue = selectionTabValue;

    // Effect to reset/set mode
    useEffect(() => {
        if (!advancedSelection) {
            setSelectionMode('single');
            setColorOverrides(null);
            setClusterIndices(null);
            setSlabTarget(null);
        } else {
            if (effectiveSelectionTabValue === 3) { // Slab
                setSelectionMode('slab');
            } else {
                setSelectionMode('disabled');
                if (!isCartoon) {
                    setColorOverrides(null);
                }
                setSlabTarget(null);
            }
        }
    }, [
        advancedSelection,
        effectiveSelectionTabValue,
        isCartoon,
        setSelectionMode,
        setColorOverrides,
        setClusterIndices,
        setSlabTarget,
    ]);

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
    };

    const handleSelectByElement = (operation: 'replace' | 'add' | 'filter' | 'exclude') => {
        if (!structureData) return;
        if (!effectiveSelectElement) return;

        const indices = structureData.structure.symbols
            .map((s, i) => s === effectiveSelectElement ? i : -1)
            .filter(i => i !== -1);
        processSelection(indices, operation, `elem:${effectiveSelectElement}`);
    };

    const handleAdvancedSelectionChange = (checked: boolean) => {
        setAdvancedSelection(checked);
        setAnalysisMessage(null);
        if (!checked) {
            setSelectionTabValue(0);
        }
    };

    const handleSelectionTabChange = (value: number) => {
        setSelectionTabValue(value);
        if (value !== 3) {
            setAnalysisMessage(null);
        }
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

        setColorOverrides(null);
        setClusterIndices(null);
        setSlabTarget(null);
        setAnalysisMessage('Layer selected. Colors restored.');
    };

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                 <Typography variant="body2">{selectedAtoms.length} atoms selected</Typography>
            </Paper>

            <FormControlLabel
                sx={{ mt: 2, ml: 1 }}
                control={<Switch checked={advancedSelection} onChange={e => handleAdvancedSelectionChange(e.target.checked)} />}
                label="Advanced Selection"
            />

            {!advancedSelection && <Box sx={{ p: 2, mt: 1, opacity: 0.7 }}><Typography variant="body2">Click atoms to select/deselect.</Typography></Box>}

            {advancedSelection && (
                <Paper variant="outlined" sx={{ mt: 1 }}>
                    <Box sx={{ p: 2, pb: 0 }}>
                        <SelectionInput />
                    </Box>
                    <Tabs
                        value={effectiveSelectionTabValue}
                        onChange={(_, val) => handleSelectionTabChange(val)}
                        variant="scrollable"
                        scrollButtons="auto"
                    >
                        <Tab label="Element" /> <Tab label="Label" /> <Tab label="Position" /> <Tab label="Slab" />
                        <Tab label="Sphere" /> <Tab label="Bonded" /> <Tab label="Percentile" /> <Tab label="Extend" /> <Tab label="Special" /> <Tab label="Connected" />
                    </Tabs>
                    <Divider />

                    <TabPanel value={effectiveSelectionTabValue} index={0}>
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
                        <Box sx={{ display: 'flex', gap: 1 }}><Button fullWidth variant="outlined" size="small" onClick={() => handleSelectByElement('replace')}>Replace</Button><Button fullWidth variant="outlined" size="small" onClick={() => handleSelectByElement('add')}>Add</Button><Button fullWidth variant="outlined" size="small" onClick={() => handleSelectByElement('filter')}>Filter</Button><Button fullWidth variant="outlined" size="small" color="error" onClick={() => handleSelectByElement('exclude')}>Exclude</Button></Box>
                    </TabPanel>
                    <TabPanel value={effectiveSelectionTabValue} index={1}>
                        <TextField fullWidth size="small" label="Labels (e.g., C1-5, O2)" value={labelInput} onChange={e => setLabelInput(e.target.value)} sx={{ mb: 2 }} />
                        <Box sx={{ display: 'flex', gap: 1 }}><Button fullWidth variant="outlined" size="small" onClick={() => handleSelectByLabel('replace')}>Replace</Button><Button fullWidth variant="outlined" size="small" onClick={() => handleSelectByLabel('add')}>Add</Button><Button fullWidth variant="outlined" size="small" onClick={() => handleSelectByLabel('filter')}>Filter</Button><Button fullWidth variant="outlined" size="small" color="error" onClick={() => handleSelectByLabel('exclude')}>Exclude</Button></Box>
                    </TabPanel>
                    <TabPanel value={effectiveSelectionTabValue} index={2}>
                        <FormControl fullWidth size="small" sx={{ mb: 1 }}><InputLabel>Coordinates</InputLabel><Select value={positionCoordType} label="Coordinates" onChange={e => setPositionCoordType(e.target.value as 'cartesian' | 'fractional')}><MenuItem value="cartesian">Cartesian</MenuItem><MenuItem value="fractional">Fractional</MenuItem></Select></FormControl>
                        <TextField fullWidth size="small" label="Criteria (e.g., z > 10.5)" value={positionInput} onChange={e => setPositionInput(e.target.value)} sx={{ mb: 2 }} />
                        <Box sx={{ display: 'flex', gap: 1 }}><Button fullWidth variant="outlined" size="small" onClick={() => handleSelectByPosition('replace')}>Replace</Button><Button fullWidth variant="outlined" size="small" onClick={() => handleSelectByPosition('add')}>Add</Button><Button fullWidth variant="outlined" size="small" onClick={() => handleSelectByPosition('filter')}>Filter</Button><Button fullWidth variant="outlined" size="small" color="error" onClick={() => handleSelectByPosition('exclude')}>Exclude</Button></Box>
                    </TabPanel>
                    <TabPanel value={effectiveSelectionTabValue} index={3}>
                        <Box sx={{ display: 'flex', gap: 1, mb: 1 }}><TextField fullWidth type="number" size="small" label="Layers" value={slabClusters} onChange={e => setSlabClusters(Math.max(2, +e.target.value))} /><Select value={slabAxis} size="small" onChange={e => setSlabAxis(e.target.value as 'x' | 'y' | 'z')}><MenuItem value="x">X</MenuItem><MenuItem value="y">Y</MenuItem><MenuItem value="z">Z</MenuItem></Select></Box>
                        <Button fullWidth onClick={handleAnalyzeClusters}>Analyze</Button>
                        {analysisMessage && <FormHelperText sx={{ mt: 1, textAlign: 'center' }}>{analysisMessage}</FormHelperText>}
                        <Divider sx={{ my: 2 }} />
                        <Typography variant="body2" align="center" sx={{ mb: 1, height: '20px' }}>{slabTarget !== null ? `Target: Layer ${slabTarget + 1}` : 'No layer picked'}</Typography>
                        <Box sx={{ display: 'flex', gap: 1 }}><Button fullWidth variant="outlined" size="small" onClick={() => handleSlabSelection('replace')} disabled={slabTarget === null}>Replace</Button><Button fullWidth variant="outlined" size="small" onClick={() => handleSlabSelection('add')} disabled={slabTarget === null}>Add</Button><Button fullWidth variant="outlined" size="small" onClick={() => handleSlabSelection('filter')} disabled={slabTarget === null}>Filter</Button><Button fullWidth variant="outlined" size="small" color="error" onClick={() => handleSlabSelection('exclude')} disabled={slabTarget === null}>Exclude</Button></Box>
                    </TabPanel>

                    {/* Sphere Selection Tab */}
                    <TabPanel value={effectiveSelectionTabValue} index={4}>
                        <SphereTab onSelect={processSelection} />
                    </TabPanel>

                    {/* Bonded Selection Tab */}
                    <TabPanel value={effectiveSelectionTabValue} index={5}>
                        <BondedTab onSelect={processSelection} />
                    </TabPanel>

                    {/* Percentile Selection Tab */}
                    <TabPanel value={effectiveSelectionTabValue} index={6}>
                        <PercentileTab onSelect={processSelection} />
                    </TabPanel>

                    {/* Extend Selection Tab */}
                    <TabPanel value={effectiveSelectionTabValue} index={7}>
                        <ExtendTab onSelect={processSelection} />
                    </TabPanel>

                    {/* Special Selection Tab (Fixed Atoms) */}
                    <TabPanel value={effectiveSelectionTabValue} index={8}>
                        <SpecialTab onSelect={processSelection} />
                    </TabPanel>

                    <TabPanel value={effectiveSelectionTabValue} index={9}>
                        <ConnectedTab onSelect={processSelection} />
                    </TabPanel>
                </Paper>
            )}
        </Box>
    );
};

export default SelectionPanel;
