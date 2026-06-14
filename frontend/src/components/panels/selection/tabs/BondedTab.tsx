import React, { useState } from 'react';
import { Box, Typography, Button } from '@mui/material';
import useStructureStore from '../../../../store/useStructureStore';
import { selectionService } from '../../../../services/selectionService';

interface BondedTabProps {
    onSelect: (
        indices: number[],
        operation: 'replace' | 'add' | 'filter' | 'exclude',
        expression: string,
        originStructureId?: string | null,
    ) => void;
    operation?: 'replace' | 'add' | 'filter' | 'exclude';
}

const BondedTab: React.FC<BondedTabProps> = ({ onSelect, operation = 'replace' }) => {
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

    const handleSelectBonded = async (operation: 'replace' | 'add' | 'filter' | 'exclude') => {
        if (!structureData || selectedAtoms.length === 0) return;
        const originStructureId = getLatestActiveTabId();
        setLoading(true);
        try {
            const atomIdx = selectedAtoms[0];
            const expr = `bonded:@${atomIdx}`;
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
                Select the atoms directly bonded to the currently selected atom.
            </Typography>
            <Typography variant="body2" align="center" sx={{ mb: 2, fontWeight: 'bold' }}>
                {hasSelection ? `Selected: Atom ${selectedAtoms[0]}` : 'No atom selected'}
            </Typography>
            <Button
                fullWidth
                variant="contained"
                size="small"
                onClick={() => handleSelectBonded(operation)}
                disabled={!hasSelection || loading}
            >
                Apply
            </Button>
        </Box>
    );
};

export default BondedTab;
