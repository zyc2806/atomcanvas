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
    Popover,
    Typography,
    Divider,
} from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import useStructureStore from '../../../store/useStructureStore';
import { selectionService } from '../../../services/selectionService';
import SelectionExpressionTree from './SelectionExpressionTree';
import type { ASTNode, SelectorNode } from '../../../types/selection';
import { EXPRESSION_KEYWORDS, GRAMMAR_ENTRIES } from './expressionSyntax';
import type { OpMode } from './OperationModeSelector';

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

interface SelectionInputProps {
    /**
     * Active operation mode (Replace / Add / Intersect / Exclude). Passed down
     * from SelectionPanel so a typed expression honors the same mode the method
     * tabs do, instead of silently replacing. Defaults to 'replace'.
     */
    operation?: OpMode;
    /**
     * The SHARED combine callback (SelectionPanel.processSelection). Routing the
     * typed expression's resulting indices through this — exactly as every method
     * tab does — gives one code path for replace/add/filter/exclude (incl. the
     * exclude-complement, the empty-match warning, and the count toast), so the
     * advanced input and the tabs cannot drift. When absent, the input falls back
     * to a direct replace (preserves bare `<SelectionInput />` usage).
     */
    onSelect?: (
        indices: number[],
        operation: OpMode,
        expression: string,
        originStructureId?: string | null,
    ) => void;
}

export const SelectionInput: React.FC<SelectionInputProps> = ({ operation = 'replace', onSelect }) => {
    const {
        structureData,
        activeTabId,
        selectionExpression,
        setSelectionExpression,
        updateSelection,
        topologyOverrides,
        visParams
    } = useStructureStore();

    // Syntax help popover state
    const [helpAnchor, setHelpAnchor] = useState<HTMLButtonElement | null>(null);
    const helpOpen = Boolean(helpAnchor);
    const handleHelpOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
        setHelpAnchor(event.currentTarget);
    };
    const handleHelpClose = () => {
        setHelpAnchor(null);
    };

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
                topologyOverrides,
                visParams.bondThreshold
            );

            const latestStructureId = getLatestActiveTabId();
            if (!originStructureId || latestStructureId !== originStructureId) {
                return;
            }

            if (result.error) {
                setError(result.error);
            } else if (onSelect) {
                // Funnel through the SAME combine path the method tabs use, so the
                // active operation (replace/add/filter/exclude) is honored — incl.
                // the exclude-complement and the synced combined `selectionExpression`.
                onSelect(result.indices, operation, trimmedExpression, originStructureId);
            } else {
                // Bare usage with no combine callback: preserve the original
                // replace-only behavior.
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

    // Build options from the shared constant (single source of truth) + element options
    const options = useMemo(
        () => [...EXPRESSION_KEYWORDS, ...elementOptions],
        [elementOptions]
    );

    return (
        <Box sx={{ width: '100%', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {/* Syntax help button */}
                <Tooltip title="Syntax help">
                    <IconButton
                        aria-label="Syntax help"
                        onClick={handleHelpOpen}
                        size="small"
                        color={helpOpen ? 'primary' : 'default'}
                    >
                        <InfoOutlinedIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
                <Popover
                    open={helpOpen}
                    anchorEl={helpAnchor}
                    onClose={handleHelpClose}
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                    transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                >
                    <Box sx={{ p: 2, maxWidth: 420, maxHeight: 420, overflowY: 'auto' }}>
                        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
                            Expression DSL — Syntax Reference
                        </Typography>
                        <Divider sx={{ mb: 1 }} />
                        {GRAMMAR_ENTRIES.map((entry, i) => (
                            <Box key={i} sx={{ mb: 0.75 }}>
                                <Typography
                                    component="span"
                                    variant="body2"
                                    sx={{ fontFamily: 'monospace', fontWeight: 600, mr: 1 }}
                                >
                                    {entry.label}
                                </Typography>
                                <Typography component="span" variant="body2" color="text.secondary">
                                    {entry.description}
                                </Typography>
                            </Box>
                        ))}
                    </Box>
                </Popover>
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
                        aria-label={showTree ? 'Hide logic tree' : 'Show logic tree'}
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
