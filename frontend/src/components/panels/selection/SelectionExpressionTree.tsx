import React, { useState } from 'react';
import { Box, Typography, Chip, useTheme, alpha, Paper, IconButton, Collapse } from '@mui/material';
import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRight from '@mui/icons-material/KeyboardArrowRight';
import PushPin from '@mui/icons-material/PushPin';
import type { ASTNode, SelectorNode } from '../../../types/selection';

interface SelectionExpressionTreeProps {
  ast?: ASTNode | null;
  onNodeDoubleClick?: (node: ASTNode) => void;
}

// --- Helper Functions ---

const getNodeProps = (node: ASTNode) => {
  if (node.type === 'logic') {
    return {
      label: node.operator,
      color: 'secondary' as const,
      variant: 'filled' as const,
    };
  }

  const selector = node as SelectorNode;
  let label = `${selector.kind}`;
  let color: 'primary' | 'success' | 'warning' | 'info' | 'default' | 'secondary' = 'default';
  let icon: React.ReactElement | undefined;

  switch (selector.kind) {
    case 'elem':
      color = 'primary';
      label = `Elem: ${selector.values?.join(', ') || selector.value || '?'}`;
      break;
    case 'pos':
    case 'frac':
      color = 'success';
      label = `${selector.kind === 'pos' ? 'Pos' : 'Frac'} ${selector.axis || '?'} ${selector.op || '='} ${selector.value || '?'}`;
      break;
    case 'slab':
      color = 'warning';
      label = `Slab ${selector.axis || '?'} (Layers: ${selector.n_clusters ?? '?'})`;
      break;
    case 'label':
      color = 'info';
      label = `Label: ${selector.values?.join(', ') || selector.value || '?'}`;
      break;
    case 'all':
      color = 'default';
      label = 'All Atoms';
      break;
    case 'sphere':
      color = 'primary';
      label = selector.center
        ? `Sphere [${selector.center.map(c => c.toFixed(1)).join(',')}] R=${selector.radius ?? '?'}`
        : `Sphere @${selector.targets?.join(',') || '?'} R=${selector.radius ?? '?'}`;
      break;
    case 'bonded':
      color = 'info';
      label = `Bonded @${selector.targets?.join(',') || '?'}`;
      break;
    case 'connected':
      color = 'secondary';
      label = `Connected @${selector.targets?.join(',') || '?'}`;
      break;
    case 'pct':
      color = 'success';
      label = `Pct ${selector.axis || '?'}: ${selector.min ?? 0}%-${selector.max ?? 100}%`;
      break;
    case 'extend':
      color = 'warning';
      label = `Extend @${selector.targets?.join(',') || '?'} (${selector.hops ?? 1} hops)`;
      break;
    case 'fixed':
      color = 'default';
      label = 'Fixed Atoms';
      break;
    case 'ids':
      color = 'default';
      label = `Indices: [${selector.targets?.slice(0, 5).join(', ') || ''}${selector.targets && selector.targets.length > 5 ? '...' : ''}]`;
      break;
    case 'pin':
      color = 'secondary';
      label = 'Pinned';
      icon = <PushPin fontSize="small" />;
      break;
    default:
      color = 'default';
      label = selector.kind;
  }

  return { label, color, variant: 'outlined' as const, icon };
};

const getChildren = (node: ASTNode): ASTNode[] => {
  const children: ASTNode[] = [];
  if (node.type === 'logic') {
    if (node.operands) children.push(...node.operands);
    if (node.operand) children.push(node.operand);
  } else if (node.type === 'selector' && node.kind === 'pin' && node.operand) {
    children.push(node.operand);
  }
  return children;
};

// --- Sub-components ---

// Renders a vertical line or empty space for indentation
const IndentBlock: React.FC<{ isLine: boolean }> = ({ isLine }) => {
  const theme = useTheme();
  return (
    <Box
      sx={{
        width: 24,
        height: 40, // Match row height
        position: 'relative',
        flexShrink: 0,
        '&::before': isLine ? {
          content: '""',
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: '50%',
          borderLeft: `1px solid ${theme.palette.divider}`,
        } : undefined,
      }}
    />
  );
};

// Renders the connector (├─ or └─) for the current node
const ConnectorBlock: React.FC<{ isLast: boolean }> = ({ isLast }) => {
  const theme = useTheme();
  return (
    <Box
      sx={{
        width: 24,
        height: 40,
        position: 'relative',
        flexShrink: 0,
        // Vertical line (full for middle child, half for last child)
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          height: isLast ? '50%' : '100%',
          left: '50%',
          borderLeft: `1px solid ${theme.palette.divider}`,
        },
        // Horizontal line
        '&::after': {
          content: '""',
          position: 'absolute',
          top: '50%',
          left: '50%',
          right: 0,
          borderTop: `1px solid ${theme.palette.divider}`,
        },
      }}
    />
  );
};

interface TreeNodeProps {
  node: ASTNode;
  path: string;
  depth: number;
  isLast: boolean;
  ancestorLines: boolean[];
  collapsedPaths: Set<string>;
  onToggle: (path: string) => void;
  onNodeDoubleClick?: (node: ASTNode) => void;
}

const TreeNode: React.FC<TreeNodeProps> = ({
  node,
  path,
  depth,
  isLast,
  ancestorLines,
  collapsedPaths,
  onToggle,
  onNodeDoubleClick
}) => {
  const theme = useTheme();
  const { label, color, variant, icon } = getNodeProps(node);

  const children = getChildren(node);
  const hasChildren = children.length > 0;
  const isCollapsed = collapsedPaths.has(path);

  const getColor = (colorKey: string): string => {
    if (colorKey === 'default') return theme.palette.text.primary;
    const paletteColors: Record<string, { main: string } | undefined> = {
      primary: theme.palette.primary,
      secondary: theme.palette.secondary,
      success: theme.palette.success,
      warning: theme.palette.warning,
      error: theme.palette.error,
      info: theme.palette.info,
    };
    return paletteColors[colorKey]?.main || theme.palette.text.primary;
  };
  const themeColor = getColor(color);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      {/* Node Row */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          height: 40,
          borderRadius: 1,
          pr: 1,
          '&:hover': {
            backgroundColor: theme.palette.action.hover,
          },
        }}
      >
        {/* Indentation for Ancestors */}
        {ancestorLines.map((isLine, index) => (
          <IndentBlock key={index} isLine={isLine} />
        ))}

        {/* Connector for Current Node (skip for root) */}
        {depth > 0 && <ConnectorBlock isLast={isLast} />}

        {/* Expand/Collapse Toggle or Spacer */}
        <Box sx={{ width: 28, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
          {hasChildren ? (
            <IconButton
              size="small"
              onClick={() => onToggle(path)}
              sx={{ padding: 0.5 }}
            >
              {isCollapsed ?
                <KeyboardArrowRight fontSize="small" /> :
                <KeyboardArrowDown fontSize="small" />
              }
            </IconButton>
          ) : (
            // Placeholder if no children/not collapsible
            <Box sx={{ width: 24 }} />
          )}
        </Box>

        {/* Node Content */}
        <Chip
          label={label}
          color={color}
          variant={variant}
          size="small"
          onClick={hasChildren ? () => onToggle(path) : undefined}
          onDoubleClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onNodeDoubleClick?.(node);
          }}
          icon={icon}
          sx={{
            fontWeight: 600,
            cursor: 'pointer',
            backgroundColor: variant === 'filled' ? undefined : alpha(themeColor, 0.1),
            borderColor: variant === 'outlined' ? themeColor : undefined,
            userSelect: 'none',
            '&:hover': { boxShadow: `0 0 0 2px ${alpha(themeColor, 0.3)}` },
          }}
        />
      </Box>

      {/* Children */}
      <Collapse in={!isCollapsed} timeout="auto" unmountOnExit>
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          {children.map((child, index) => {
            const childIsLast = index === children.length - 1;
            // Next level logic: if I am NOT last, my vertical line continues down
            // But if I am last, my vertical line stops here.
            // Exception: Logic applies to the *parent's* line.
            // If current node (parent of these children) isLast, it does NOT pass a line.
            // If current node is NOT isLast, it DOES pass a line.

            // NOTE: Root (depth 0) is effectively "last" (unique), but we don't draw root line.
            // We need to pass the state of *this* level to the children.
            // If depth === 0, we effectively pass "false" (no line from root).
            const nextAncestorLines = [...ancestorLines, !isLast && depth > 0];

            return (
              <TreeNode
                key={`${path}-${index}`}
                node={child}
                path={`${path}-${index}`}
                depth={depth + 1}
                isLast={childIsLast}
                ancestorLines={nextAncestorLines}
                collapsedPaths={collapsedPaths}
                onToggle={onToggle}
                onNodeDoubleClick={onNodeDoubleClick}
              />
            );
          })}
        </Box>
      </Collapse>
    </Box>
  );
};

export const SelectionExpressionTree: React.FC<SelectionExpressionTreeProps> = ({ ast, onNodeDoubleClick }) => {
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set());

  const handleToggle = (path: string) => {
    setCollapsedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  if (!ast) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No selection expression
        </Typography>
      </Box>
    );
  }

  return (
    <Paper
      elevation={0}
      variant="outlined"
      sx={{
        p: 2,
        overflowX: 'auto',
        // Make sure container allows tree to expand
        minHeight: 100,
        backgroundColor: 'background.default',
      }}
    >
      <TreeNode
        node={ast}
        path="0"
        depth={0}
        isLast={true}
        ancestorLines={[]}
        collapsedPaths={collapsedPaths}
        onToggle={handleToggle}
        onNodeDoubleClick={onNodeDoubleClick}
      />
    </Paper>
  );
};

export default SelectionExpressionTree;
