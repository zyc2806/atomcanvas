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
}

const BondedTab: React.FC<BondedTabProps> = ({ onSelect }) => {
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
            <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                    fullWidth
                    variant="outlined"
                    size="small"
                    onClick={() => handleSelectBonded('replace')}
                    disabled={!hasSelection || loading}
                >
                    Replace
                </Button>
                <Button
                    fullWidth
                    variant="outlined"
                    size="small"
                    onClick={() => handleSelectBonded('add')}
                    disabled={!hasSelection || loading}
                >
                    Add
                </Button>
                <Button
                    fullWidth
                    variant="outlined"
                    size="small"
                    onClick={() => handleSelectBonded('filter')}
                    disabled={!hasSelection || loading}
                >
                    Filter
                </Button>
                <Button
                    fullWidth
                    variant="outlined"
                    size="small"
                    color="error"
                    onClick={() => handleSelectBonded('exclude')}
                    disabled={!hasSelection || loading}
                >
                    Exclude
                </Button>
            </Box>
        </Box>
    );
};

export default BondedTab;
