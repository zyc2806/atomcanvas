import React, { useState, useMemo } from 'react';
import {
    TextField,
    Autocomplete,
    InputAdornment,
    IconButton,
    Box,
    Tooltip,
    CircularProgress,
} from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import { useStructureStore } from '../../store/useStructureStore';
import { selectionService } from '../../services/selectionService';

const KEYWORDS = ['elem:', 'pos:', 'slab:', 'AND', 'OR', 'NOT', '(', ')'];

const toErrorMessage = (err: unknown): string => {
    if (err && typeof err === 'object') {
        const maybe = err as { response?: { data?: { detail?: unknown } } };
        const detail = maybe.response?.data?.detail;
        if (typeof detail === 'string') {
            return detail;
        }
    }
    return err instanceof Error ? err.message : 'Failed to parse expression';
};

/**
 * Expression-based atom selection input. Parses the selection DSL via
 * selectionService.parseExpression and writes the resulting indices into the
 * UI slice (updateSelection / setSelectionExpression).
 */
export const SelectionInput: React.FC = () => {
    const structureData = useStructureStore((s) => s.structureData);
    const selectionExpression = useStructureStore((s) => s.selectionExpression);
    const setSelectionExpression = useStructureStore((s) => s.setSelectionExpression);
    const updateSelection = useStructureStore((s) => s.updateSelection);
    const bondOverrides = useStructureStore((s) => s.bondOverrides);
    const bondThreshold = useStructureStore((s) => s.visParams.bondThreshold);

    const [inputValue, setInputValue] = useState(selectionExpression);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // Keep the local input in sync when the store's expression changes externally
    // (canvas selection, undo/redo, tab switch) without a cascading effect: adjust
    // state during render via a "previous value" sentinel.
    const [lastSyncedExpression, setLastSyncedExpression] = useState(selectionExpression);
    if (selectionExpression !== lastSyncedExpression) {
        setLastSyncedExpression(selectionExpression);
        setInputValue(selectionExpression);
    }

    const executeApply = async (expression: string) => {
        const trimmedExpression = expression.trim();
        if (!trimmedExpression) {
            setSelectionExpression('');
            updateSelection([], 'replace');
            setError(null);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            if (!structureData) throw new Error('No structure data');

            const result = await selectionService.parseExpression(
                structureData.structure,
                trimmedExpression,
                bondOverrides,
                bondThreshold,
            );

            if (result.error) {
                setError(result.error);
            } else {
                setSelectionExpression(trimmedExpression);
                updateSelection(result.indices, 'replace');
            }
        } catch (err: unknown) {
            console.error('Selection parse error:', err);
            setError(toErrorMessage(err));
        } finally {
            setLoading(false);
        }
    };

    const handleApply = async () => {
        await executeApply(inputValue);
    };

    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            handleApply();
        }
    };

    const handleInvert = () => {
        const newValue = inputValue.trim();
        let updatedValue = '';

        if (!newValue) {
            updatedValue = '*';
        } else if (newValue === '*') {
            updatedValue = 'NOT *';
        } else {
            // Check if already wrapped in NOT (...)
            const match = newValue.match(/^NOT\s*\((.*)\)$/);
            if (match) {
                updatedValue = match[1];
            } else {
                updatedValue = `NOT (${newValue})`;
            }
        }
        setInputValue(updatedValue);
        executeApply(updatedValue);
    };

    const elementOptions = useMemo(() => {
        if (!structureData) return [];
        return [...new Set(structureData.structure.symbols)].map((s) => `elem:${s}`);
    }, [structureData]);

    const options = useMemo(() => [...KEYWORDS, ...elementOptions], [elementOptions]);

    return (
        <Box sx={{ width: '100%', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Autocomplete
                    fullWidth
                    freeSolo
                    options={options}
                    value={inputValue}
                    onInputChange={(_, newValue) => {
                        setInputValue(newValue);
                        if (error) setError(null);
                    }}
                    renderInput={(params) => (
                        <TextField
                            {...params}
                            label="Selection Expression"
                            placeholder="e.g. elem:C AND pos:z>10"
                            error={!!error}
                            helperText={error}
                            onKeyDown={handleKeyDown}
                            size="small"
                            InputProps={{
                                ...params.InputProps,
                                endAdornment: (
                                    <>
                                        {params.InputProps.endAdornment}
                                        <InputAdornment position="end">
                                            <Tooltip title="Invert Selection">
                                                <span>
                                                    <IconButton
                                                        aria-label="Invert Selection"
                                                        onClick={handleInvert}
                                                        edge="end"
                                                        size="small"
                                                        sx={{ mr: 1 }}
                                                    >
                                                        <SwapHorizIcon />
                                                    </IconButton>
                                                </span>
                                            </Tooltip>
                                            <Tooltip title="Apply Selection">
                                                <span>
                                                    <IconButton
                                                        aria-label="Apply Selection"
                                                        onClick={handleApply}
                                                        edge="end"
                                                        disabled={loading}
                                                        size="small"
                                                    >
                                                        {loading ? <CircularProgress size={20} /> : <CheckIcon />}
                                                    </IconButton>
                                                </span>
                                            </Tooltip>
                                        </InputAdornment>
                                    </>
                                ),
                            }}
                        />
                    )}
                />
            </Box>
        </Box>
    );
};

export default SelectionInput;
