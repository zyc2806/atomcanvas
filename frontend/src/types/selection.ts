export type LogicOperator = 'AND' | 'OR' | 'NOT';

export interface LogicNode {
  type: 'logic';
  operator: LogicOperator;
  operands?: ASTNode[];
  operand?: ASTNode;
  span?: [number, number];
}

export type SelectorKind = 'all' | 'elem' | 'label' | 'pos' | 'frac' | 'slab' | 'sphere' | 'bonded' | 'connected' | 'pct' | 'extend' | 'fixed' | 'ids' | 'pin';

export interface SelectorNode {
  type: 'selector';
  kind: SelectorKind;
  value?: string | number;
  values?: string[];
  axis?: string;
  op?: string;
  n_clusters?: number;
  layer_index?: number;
  center?: number[];
  radius?: number;
  targets?: number[];
  min?: number;
  max?: number;
  hops?: number;
  operand?: ASTNode;
  span?: [number, number];
}

export type ASTNode = LogicNode | SelectorNode;

export interface SelectionASTResponse {
  ast: ASTNode;
}
