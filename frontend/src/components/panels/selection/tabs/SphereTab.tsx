import React, { useState } from 'react';
import { Box, TextField, Button, Select, MenuItem, FormControl, InputLabel, Typography } from '@mui/material';
import useStructureStore from '../../../../store/useStructureStore';
import { selectionService } from '../../../../services/selectionService';
import { applyButtonLabel } from '../applyButtonLabel';

interface SphereTabProps {
    onSelect: (
        indices: number[],
        operation: 'replace' | 'add' | 'filter' | 'exclude',
        expression: string,
        originStructureId?: string | null,
    ) => void;
    operation?: 'replace' | 'add' | 'filter' | 'exclude';
}

const SphereTab: React.FC<SphereTabProps> = ({ onSelect, operation = 'replace' }) => {
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
    const [radius, setRadius] = useState(5);
    const [centerMode, setCenterMode] = useState<'coords' | 'atom'>('atom');
    const [coords, setCoords] = useState({ x: 0, y: 0, z: 0 });
    const [atomIdx, setAtomIdx] = useState(0);

    const handleSelect = async (op: 'replace' | 'add' | 'filter' | 'exclude') => {
        if (!structureData) return;
        const originStructureId = getLatestActiveTabId();
        try {
            const expr = centerMode === 'coords'
                ? `sphere:${coords.x},${coords.y},${coords.z},${radius}`
                : `sphere:@${atomIdx},${radius}`;
            const data = await selectionService.parseExpression(structureData.structure, expr);
            onSelect(data.indices, op, expr, originStructureId);
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <Box>
            <FormControl fullWidth size="small" sx={{ mb: 1 }}>
                <InputLabel>Center Mode</InputLabel>
                <Select
                    value={centerMode}
                    label="Center Mode"
                    onChange={e => setCenterMode(e.target.value as 'coords' | 'atom')}
                >
                    <MenuItem value="coords">Coordinates</MenuItem>
                    <MenuItem value="atom">Atom Index</MenuItem>
                </Select>
            </FormControl>
            {centerMode === 'coords' ? (
                <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                    <TextField
                        type="number"
                        size="small"
                        label="X"
                        value={coords.x}
                        onChange={e => setCoords(p => ({ ...p, x: +e.target.value }))}
                    />
                    <TextField
                        type="number"
                        size="small"
                        label="Y"
                        value={coords.y}
                        onChange={e => setCoords(p => ({ ...p, y: +e.target.value }))}
                    />
                    <TextField
                        type="number"
                        size="small"
                        label="Z"
                        value={coords.z}
                        onChange={e => setCoords(p => ({ ...p, z: +e.target.value }))}
                    />
                </Box>
            ) : (
                <TextField
                    fullWidth
                    type="number"
                    size="small"
                    label="Atom Index"
                    value={atomIdx}
                    onChange={e => setAtomIdx(Math.max(0, +e.target.value))}
                    sx={{ mb: 1 }}
                />
            )}
            <TextField
                fullWidth
                type="number"
                size="small"
                label="Radius (Å)"
                value={radius}
                onChange={e => setRadius(Math.max(0, +e.target.value))}
                sx={{ mb: 2 }}
            />
            <Button fullWidth variant="contained" size="small" onClick={() => handleSelect(operation)}>
                {applyButtonLabel(operation)}
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                Center (XYZ coords or atom index) + radius (Å).
            </Typography>
        </Box>
    );
};

export default SphereTab;
