import React, { useState } from 'react';
import { Box, Typography, Button, TextField } from '@mui/material';
import useStructureStore from '../../../../store/useStructureStore';
import { selectionService } from '../../../../services/selectionService';

interface ExtendTabProps {
    onSelect: (
        indices: number[],
        operation: 'replace' | 'add' | 'filter' | 'exclude',
        expression: string,
        originStructureId?: string | null,
    ) => void;
    operation?: 'replace' | 'add' | 'filter' | 'exclude';
}

const ExtendTab: React.FC<ExtendTabProps> = ({ onSelect, operation = 'replace' }) => {
    const { structureData, selectedAtoms, bondOverrides, visParams, activeTabId } = useStructureStore();
    const [extendHops, setExtendHops] = useState(1);
    const [loading, setLoading] = useState(false);

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

    const handleExtendSelection = async (op: 'replace' | 'add' | 'filter' | 'exclude') => {
        if (!structureData || selectedAtoms.length === 0) return;
        const originStructureId = getLatestActiveTabId();
        setLoading(true);
        try {
            const atomIdx = selectedAtoms[0];
            const expr = `extend:@${atomIdx};${extendHops}`;
            const data = await selectionService.parseExpression(
                structureData.structure,
                expr,
                bondOverrides,
                visParams.bondThreshold
            );
            onSelect(data.indices, op, expr, originStructureId);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const hasSelection = selectedAtoms.length > 0;

    return (
        <Box>
            <Typography variant="body2" sx={{ mb: 2 }}>
                Expand selection by N bond hops from the currently selected atom.
            </Typography>
            <Typography variant="body2" align="center" sx={{ mb: 1, fontWeight: 'bold' }}>
                {hasSelection ? `Selected: Atom ${selectedAtoms[0]}` : 'No atom selected'}
            </Typography>
            <TextField
                fullWidth
                type="number"
                size="small"
                label="Hops"
                value={extendHops}
                onChange={e => setExtendHops(Math.max(1, +e.target.value))}
                sx={{ mb: 2 }}
                disabled={loading}
            />
            <Button
                fullWidth
                variant="contained"
                size="small"
                onClick={() => handleExtendSelection(operation)}
                disabled={!hasSelection || loading}
            >
                Apply
            </Button>
        </Box>
    );
};

export default ExtendTab;
