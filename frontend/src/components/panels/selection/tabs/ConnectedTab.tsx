import React, { useState } from 'react';
import { Box, Typography, Button } from '@mui/material';
import useStructureStore from '../../../../store/useStructureStore';
import { selectionService } from '../../../../services/selectionService';

interface ConnectedTabProps {
    onSelect: (
        indices: number[],
        operation: 'replace' | 'add' | 'filter' | 'exclude',
        expression: string,
        originStructureId?: string | null,
    ) => void;
}

const ConnectedTab: React.FC<ConnectedTabProps> = ({ onSelect }) => {
    const { structureData, selectedAtoms, bondOverrides, visParams, activeTabId } = useStructureStore();
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

    const handleSelectConnected = async (operation: 'replace' | 'add' | 'filter' | 'exclude') => {
        if (!structureData || selectedAtoms.length === 0) return;
        const originStructureId = getLatestActiveTabId();
        setLoading(true);
        try {
            const expr = `connected:${selectedAtoms.map(idx => `@${idx}`).join(',')}`;
            const data = await selectionService.parseExpression(
                structureData.structure,
                expr,
                bondOverrides,
                visParams.bondThreshold
            );
            onSelect(data.indices, operation, expr, originStructureId);
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
                Select all atoms in the same connected component
            </Typography>
            <Typography variant="body2" align="center" sx={{ mb: 2, fontWeight: 'bold' }}>
                {hasSelection ? `Selected: ${selectedAtoms.length} atom(s)` : 'No atom selected'}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                    fullWidth
                    variant="outlined"
                    size="small"
                    onClick={() => handleSelectConnected('replace')}
                    disabled={!hasSelection || loading}
                >
                    Replace
                </Button>
                <Button
                    fullWidth
                    variant="outlined"
                    size="small"
                    onClick={() => handleSelectConnected('add')}
                    disabled={!hasSelection || loading}
                >
                    Add
                </Button>
                <Button
                    fullWidth
                    variant="outlined"
                    size="small"
                    onClick={() => handleSelectConnected('filter')}
                    disabled={!hasSelection || loading}
                >
                    Filter
                </Button>
                <Button
                    fullWidth
                    variant="outlined"
                    size="small"
                    color="error"
                    onClick={() => handleSelectConnected('exclude')}
                    disabled={!hasSelection || loading}
                >
                    Exclude
                </Button>
            </Box>
        </Box>
    );
};

export default ConnectedTab;
