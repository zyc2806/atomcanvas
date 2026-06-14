import React, { useState } from 'react';
import { Box, Typography, Button } from '@mui/material';
import useStructureStore from '../../../../store/useStructureStore';
import { selectionService } from '../../../../services/selectionService';

interface SpecialTabProps {
    onSelect: (
        indices: number[],
        operation: 'replace' | 'add' | 'filter' | 'exclude',
        expression: string,
        originStructureId?: string | null,
    ) => void;
}

const SpecialTab: React.FC<SpecialTabProps> = ({ onSelect }) => {
    const { structureData, activeTabId } = useStructureStore();
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

    const handleSelectFixed = async (operation: 'replace' | 'add' | 'filter' | 'exclude') => {
        if (!structureData) return;
        const originStructureId = getLatestActiveTabId();
        setLoading(true);
        try {
            const expr = 'fixed';
            const data = await selectionService.parseExpression(structureData.structure, expr);
            onSelect(data.indices, operation, expr, originStructureId);
        } catch (e) {
            console.error('Error selecting fixed atoms:', e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box>
            <Typography variant="body2" sx={{ mb: 2 }}>
                Select atoms with special properties.
            </Typography>

            <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Fixed Atoms
            </Typography>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Select atoms that have FixAtoms constraints applied.
            </Typography>

            <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                    fullWidth
                    variant="outlined"
                    size="small"
                    onClick={() => handleSelectFixed('replace')}
                    disabled={loading}
                >
                    Replace
                </Button>
                <Button
                    fullWidth
                    variant="outlined"
                    size="small"
                    onClick={() => handleSelectFixed('add')}
                    disabled={loading}
                >
                    Add
                </Button>
                <Button
                    fullWidth
                    variant="outlined"
                    size="small"
                    onClick={() => handleSelectFixed('filter')}
                    disabled={loading}
                >
                    Filter
                </Button>
                <Button
                    fullWidth
                    variant="outlined"
                    size="small"
                    color="error"
                    onClick={() => handleSelectFixed('exclude')}
                    disabled={loading}
                >
                    Exclude
                </Button>
            </Box>
        </Box>
    );
};

export default SpecialTab;
