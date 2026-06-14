import React, { useState } from 'react';
import { Box, Typography, Button, Select, MenuItem, TextField, FormControl, InputLabel } from '@mui/material';
import useStructureStore from '../../../../store/useStructureStore';
import { selectionService } from '../../../../services/selectionService';

interface PercentileTabProps {
    onSelect: (
        indices: number[],
        operation: 'replace' | 'add' | 'filter' | 'exclude',
        expression: string,
        originStructureId?: string | null,
    ) => void;
    operation?: 'replace' | 'add' | 'filter' | 'exclude';
}

const PercentileTab: React.FC<PercentileTabProps> = ({ onSelect, operation = 'replace' }) => {
    const { structureData, activeTabId } = useStructureStore();

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

    const [pctAxis, setPctAxis] = useState<'x' | 'y' | 'z'>('z');
    const [pctMin, setPctMin] = useState(0);
    const [pctMax, setPctMax] = useState(100);

    const handleSelectByPercentile = async (op: 'replace' | 'add' | 'filter' | 'exclude') => {
        if (!structureData) return;
        const originStructureId = getLatestActiveTabId();
        try {
            const expr = `pct:${pctAxis},${pctMin},${pctMax}`;
            const data = await selectionService.parseExpression(structureData.structure, expr);
            onSelect(data.indices, op, expr, originStructureId);
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <Box>
            <Typography variant="body2" sx={{ mb: 2 }}>
                Select atoms by coordinate percentile along an axis.
            </Typography>

            <FormControl fullWidth size="small" sx={{ mb: 1 }}>
                <InputLabel>Axis</InputLabel>
                <Select
                    value={pctAxis}
                    label="Axis"
                    onChange={e => setPctAxis(e.target.value as 'x' | 'y' | 'z')}
                >
                    <MenuItem value="x">X</MenuItem>
                    <MenuItem value="y">Y</MenuItem>
                    <MenuItem value="z">Z</MenuItem>
                </Select>
            </FormControl>

            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <TextField
                    fullWidth
                    type="number"
                    size="small"
                    label="Min %"
                    value={pctMin}
                    onChange={e => setPctMin(Math.max(0, Math.min(100, +e.target.value)))}
                />
                <TextField
                    fullWidth
                    type="number"
                    size="small"
                    label="Max %"
                    value={pctMax}
                    onChange={e => setPctMax(Math.max(0, Math.min(100, +e.target.value)))}
                />
            </Box>

            <Button fullWidth variant="contained" size="small" onClick={() => handleSelectByPercentile(operation)}>
                Apply
            </Button>
        </Box>
    );
};

export default PercentileTab;
