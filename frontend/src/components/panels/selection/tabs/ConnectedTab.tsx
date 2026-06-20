import React, { useState } from 'react';
import { Box, Typography, Button } from '@mui/material';
import useStructureStore from '../../../../store/useStructureStore';
import { selectionService } from '../../../../services/selectionService';
import { applyButtonLabel } from '../applyButtonLabel';

interface ConnectedTabProps {
    onSelect: (
        indices: number[],
        operation: 'replace' | 'add' | 'filter' | 'exclude',
        expression: string,
        originStructureId?: string | null,
    ) => void;
    operation?: 'replace' | 'add' | 'filter' | 'exclude';
}

const ConnectedTab: React.FC<ConnectedTabProps> = ({ onSelect, operation = 'replace' }) => {
    const { structureData, selectedAtoms, topologyOverrides, visParams, activeTabId } = useStructureStore();
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

    const handleSelectConnected = async (op: 'replace' | 'add' | 'filter' | 'exclude') => {
        if (!structureData || selectedAtoms.length === 0) return;
        const originStructureId = getLatestActiveTabId();
        setLoading(true);
        try {
            const expr = `connected:${selectedAtoms.map(idx => `@${idx}`).join(',')}`;
            const data = await selectionService.parseExpression(
                structureData.structure,
                expr,
                topologyOverrides,
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
                Select all atoms in the same connected component
            </Typography>
            <Typography variant="body2" align="center" sx={{ mb: 2, fontWeight: 'bold' }}>
                {hasSelection ? `Selected: ${selectedAtoms.length} atom(s)` : 'Click an atom in the viewer, then Apply.'}
            </Typography>
            <Button
                fullWidth
                variant="contained"
                size="small"
                onClick={() => handleSelectConnected(operation)}
                disabled={!hasSelection || loading}
            >
                {applyButtonLabel(operation)}
            </Button>
        </Box>
    );
};

export default ConnectedTab;
