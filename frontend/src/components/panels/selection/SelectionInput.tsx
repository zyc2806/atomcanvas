import React, { useState, useEffect, useMemo } from 'react';
import {
    TextField,
    Autocomplete,
    InputAdornment,
    IconButton,
    Box,
    Tooltip,
    CircularProgress,
    Collapse,
} from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import useStructureStore from '../../../store/useStructureStore';
import { selectionService } from '../../../services/selectionService';
import SelectionExpressionTree from './SelectionExpressionTree';
import type { ASTNode, SelectorNode } from '../../../types/selection';

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

/** Quick bracket balance check to avoid sending obviously incomplete expressions. */
const isBalanced = (s: string): boolean => {
    let depth = 0;
    for (const ch of s) {
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (depth < 0) return false;
    }
    return depth === 0;
};

export const SelectionInput: React.FC = () => {
    const {
        structureData,
        activeTabId,
        selectionExpression,
        setSelectionExpression,
        updateSelection,
        bondOverrides,
        visParams
    } = useStructureStore();

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

    const [inputValue, setInputValue] = useState(selectionExpression);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // Tree Visualization State
    const [astData, setAstData] = useState<ASTNode | null>(null);
    const [showTree, setShowTree] = useState(false);
    const [treeLoading, setTreeLoading] = useState(false);

    // Mirror the store-driven expression into the editable input. Adjusting state
    // during render (React's documented pattern) avoids the cascading-render cost
    // of doing this sync in an effect.
    const [prevExpression, setPrevExpression] = useState(selectionExpression);
    if (selectionExpression !== prevExpression) {
        setPrevExpression(selectionExpression);
        setInputValue(selectionExpression);
    }

    useEffect(() => {
        // Debounce both the clear and the fetch so neither setState runs
        // synchronously in the effect body.
        const timer = setTimeout(async () => {
            if (!inputValue.trim() || !isBalanced(inputValue)) {
                setAstData(null);
                return;
            }
            setTreeLoading(true);
            try {
                const response = await selectionService.getAST(inputValue);
                setAstData(response.ast);
            } catch (err) {
                // Silent failure for AST preview
                console.warn("Failed to fetch AST preview:", err);
                setAstData(null);
            } finally {
                setTreeLoading(false);
            }
        }, 300); // 300ms debounce

        return () => clearTimeout(timer);
    }, [inputValue]);

    const executeApply = async (expression: string) => {
        const originStructureId = getLatestActiveTabId();
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
            if (!structureData) throw new Error("No structure data");

            const result = await selectionService.parseExpression(
                structureData.structure,
                trimmedExpression,
                bondOverrides,
                visParams.bondThreshold
            );

            const latestStructureId = getLatestActiveTabId();
            if (!originStructureId || latestStructureId !== originStructureId) {
                return;
            }

            if (result.error) {
                setError(result.error);
            } else {
                setSelectionExpression(trimmedExpression);
                updateSelection(result.indices, 'replace');
            }
        } catch (err: unknown) {
            console.error("Selection parse error:", err);
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

    const handleNodePin = (node: ASTNode) => {
        if (!node.span) return;
        const [start, end] = node.span;

        if (node.type === 'selector' && node.kind === 'pin') {
            const pinNode = node as SelectorNode;
            if (pinNode.operand?.span) {
                const [innerStart, innerEnd] = pinNode.operand.span;
                const newValue = inputValue.slice(0, start)
                    + inputValue.slice(innerStart, innerEnd)
                    + inputValue.slice(end);
                setInputValue(newValue);
                executeApply(newValue);
            }
        } else {
            const subExpr = inputValue.slice(start, end);
            const newValue = inputValue.slice(0, start)
                + `pin(${subExpr})`
                + inputValue.slice(end);
            setInputValue(newValue);
            executeApply(newValue);
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
        return [...new Set(structureData.structure.symbols)].map(s => `elem:${s}`);
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
                                )
                            }}
                        />
                    )}
                />
                <Tooltip title={showTree ? "Hide Logic Tree" : "Show Logic Tree"}>
                    <IconButton
                        onClick={() => setShowTree(!showTree)}
                        color={showTree ? "primary" : "default"}
                        size="small"
                    >
                        {showTree ? <ExpandLessIcon /> : <AccountTreeIcon />}
                    </IconButton>
                </Tooltip>
            </Box>

            <Collapse in={showTree}>
                <Box sx={{ mt: 2 }}>
                    {treeLoading ? (
                         <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                             <CircularProgress size={24} />
                         </Box>
                    ) : (
                        <SelectionExpressionTree ast={astData} onNodeDoubleClick={handleNodePin} />
                    )}
                </Box>
            </Collapse>
        </Box>
    );
};

export default SelectionInput;
