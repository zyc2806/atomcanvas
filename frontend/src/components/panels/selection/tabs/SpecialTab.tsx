import React, { useState } from 'react';
import { Box, Typography, Button } from '@mui/material';
import useStructureStore from '../../../../store/useStructureStore';
import { selectionService } from '../../../../services/selectionService';
import { applyButtonLabel } from '../applyButtonLabel';

interface SpecialTabProps {
    onSelect: (
        indices: number[],
        operation: 'replace' | 'add' | 'filter' | 'exclude',
        expression: string,
        originStructureId?: string | null,
    ) => void;
    operation?: 'replace' | 'add' | 'filter' | 'exclude';
}

const SpecialTab: React.FC<SpecialTabProps> = ({ onSelect, operation = 'replace' }) => {
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

    const handleSelectFixed = async (op: 'replace' | 'add' | 'filter' | 'exclude') => {
        if (!structureData) return;
        const originStructureId = getLatestActiveTabId();
        setLoading(true);
        try {
            const expr = 'fixed';
            const data = await selectionService.parseExpression(structureData.structure, expr);
            onSelect(data.indices, op, expr, originStructureId);
        } catch (e) {
            console.error('Error selecting fixed atoms:', e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Fixed Atoms
            </Typography>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Select atoms that are frozen / fixed in place (FixAtoms constraint).
            </Typography>

            <Button
                fullWidth
                variant="contained"
                size="small"
                onClick={() => handleSelectFixed(operation)}
                disabled={loading}
            >
                {applyButtonLabel(operation)}
            </Button>
        </Box>
    );
};

export default SpecialTab;
