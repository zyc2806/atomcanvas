// Bond-order constants shared by BondEditPanel and SelectionActionBar.
export const BOND_ORDERS = ['1.0', '1.5', '2.0', '3.0'] as const;
export type BondOrder = (typeof BOND_ORDERS)[number];

export const ORDER_LABELS: Record<BondOrder, string> = {
    '1.0': 'Single (1)',
    '1.5': 'Aromatic (1.5)',
    '2.0': 'Double (2)',
    '3.0': 'Triple (3)',
};
