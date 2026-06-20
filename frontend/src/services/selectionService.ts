import apiClient from './apiClient';
import { type Structure } from '../types/store';
import { type SelectionASTResponse, type ASTNode, type SelectorNode } from '../types/selection';

// Bounded LRU so a long session of editing + pinned queries cannot grow the
// cache without limit. Map preserves insertion order, so we evict the oldest
// entry whenever we exceed the cap.
const PINNED_CACHE_LIMIT = 256;
const pinnedCache = new Map<string, number[]>();

const setPinnedCache = (key: string, indices: number[]): void => {
    if (pinnedCache.has(key)) {
        pinnedCache.delete(key);
    } else if (pinnedCache.size >= PINNED_CACHE_LIMIT) {
        const oldestKey = pinnedCache.keys().next().value;
        if (oldestKey !== undefined) {
            pinnedCache.delete(oldestKey);
        }
    }
    pinnedCache.set(key, indices);
};

const getPinnedCache = (key: string): number[] | undefined => {
    const indices = pinnedCache.get(key);
    if (indices !== undefined) {
        // Touch: re-insert to move to the MRU end of insertion order.
        pinnedCache.delete(key);
        pinnedCache.set(key, indices);
    }
    return indices;
};

const buildStructureFingerprint = (structure: Structure): string => {
    if (!structure || !Array.isArray(structure.symbols) || !Array.isArray(structure.positions)) {
        return 'unknown-structure';
    }

    const atomCount = structure.symbols.length;
    if (atomCount === 0) {
        return 'empty';
    }

    const sampleIndices = Array.from(new Set([0, Math.floor(atomCount / 2), atomCount - 1]));
    const sample = sampleIndices
        .map((index) => {
            const symbol = structure.symbols[index] ?? 'X';
            const pos = structure.positions[index] ?? [0, 0, 0];
            return `${symbol}:${pos.map((v) => Number(v).toFixed(3)).join(',')}`;
        })
        .join('|');

    const cell = structure.cell?.flat() ?? [];
    const pbc = structure.pbc?.join(',') ?? 'false,false,false';
    return `${atomCount}|${sample}|cell:${cell.slice(0, 9).join(',')}|pbc:${pbc}`;
};


// Helper to traverse AST and find pins
const findPins = (node: ASTNode): SelectorNode[] => {
    const pins: SelectorNode[] = [];
    if (node.type === 'selector' && node.kind === 'pin') {
        pins.push(node);
    }
    // Traverse operands
    if (node.type === 'logic') {
        if (node.operands) {
            node.operands.forEach(operand => pins.push(...findPins(operand)));
        }
        if (node.operand) {
            pins.push(...findPins(node.operand));
        }
    }
    if (node.type === 'selector' && node.operand) {
        pins.push(...findPins(node.operand));
    }
    return pins;
};

const rewriteQuery = async (
    structure: Structure,
    expression: string,
    ast: ASTNode,
    resolve: (expr: string) => Promise<{ indices: number[] }>
): Promise<string> => {
    const pins = findPins(ast);
    if (pins.length === 0) return expression;

    const structureFingerprint = buildStructureFingerprint(structure);

    // Sort pins by span start (descending) to replace from right to left
    pins.sort((a, b) => {
        if (!a.span || !b.span) return 0;
        return b.span[0] - a.span[0];
    });

    let newExpression = expression;

    for (const pin of pins) {
        if (!pin.span || !pin.operand || !pin.operand.span) continue;
        
        const pinStart = pin.span[0];
        const pinEnd = pin.span[1];
        
        const innerStart = pin.operand.span[0];
        const innerEnd = pin.operand.span[1];
        
        const innerExpression = expression.substring(innerStart, innerEnd);
        
        const cacheKey = `${structureFingerprint}::${innerExpression}`;
        let indices = getPinnedCache(cacheKey);

        if (!indices) {
            try {
                const result = await resolve(innerExpression);
                indices = result.indices;
                setPinnedCache(cacheKey, indices);
            } catch (error) {
                console.error('Failed to resolve pinned query:', innerExpression, error);
                throw error;
            }
        }

        const replacement = `ids:${indices.join(',')}`;
        newExpression = newExpression.slice(0, pinStart) + replacement + newExpression.slice(pinEnd);
    }
    
    return newExpression;
};

export const selectionService = {
    clearCache: () => {
        pinnedCache.clear();
    },

    parseLabels: async (structure: Structure, labelsStr: string) => {
        const response = await apiClient.post('/selection/parse_labels', { structure, labels_str: labelsStr });
        return response.data;
    },

    filterPosition: async (structure: Structure, criteriaStr: string, coordType: 'cartesian' | 'fractional') => {
        const response = await apiClient.post('/selection/filter_position', { 
            structure,
            criteria_str: criteriaStr, 
            coord_type: coordType 
        });
        return response.data;
    },

    analyzeClusters: async (structure: Structure, nClusters: number, axisIndex: number) => {
        const response = await apiClient.post('/selection/analyze_clusters', { 
            structure,
            n_clusters: nClusters, 
            axis: axisIndex 
        });
        return response.data;
    },

    detectRing: async (
        structure: Structure,
        indices: number[],
        bondTopologyOverrides?: Record<string, string> | null,
        bondScale?: number,
    ) => {
        const response = await apiClient.post('/selection/detect_ring', {
            structure,
            indices,
            bond_overrides: bondTopologyOverrides || undefined,
            bond_scale: bondScale,
        });
        return response.data;
    },

    parseExpression: async (
        structure: Structure,
        expression: string,
        bondTopologyOverrides?: Record<string, string> | null,
        bondScale?: number
    ) => {
        const astResponse = await selectionService.getAST(expression);
        const rewrittenExpression = await rewriteQuery(
            structure,
            expression,
            astResponse.ast,
            async (innerExpr) => {
                return await selectionService.parseExpression(
                    structure,
                    innerExpr,
                    bondTopologyOverrides,
                    bondScale
                );
            }
        );

        const response = await apiClient.post('/selection/parse_expression', {
            structure,
            expression: rewrittenExpression,
            bond_overrides: bondTopologyOverrides || undefined,
            bond_scale: bondScale
        });
        return response.data;
    },

    getAST: async (expression: string): Promise<SelectionASTResponse> => {

        const response = await apiClient.post('/selection/parse_ast', {
            expression
        });
        return response.data;
    }
};
