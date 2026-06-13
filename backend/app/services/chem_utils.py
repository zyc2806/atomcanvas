from typing import Set

# Element classification for strategy routing
ELEMENT_CLASSES = {
    # Main Group
    'main_group_light': {'H', 'C', 'N', 'O', 'F'},
    'main_group_heavy': {'Si', 'P', 'S', 'Cl', 'Br', 'I', 'Se', 'Te', 'As', 'Sb', 'B', 'Al', 'Ga', 'Ge', 'Sn', 'Pb', 'Bi', 'Po', 'At'},
    
    # Noble Gases
    'noble_gas': {'He', 'Ne', 'Ar', 'Kr', 'Xe', 'Rn'},
    
    # Electron Deficient (subset of main group, often form 3c-2e)
    'electron_deficient': {'B', 'Al', 'Ga'},
    
    # Transition Metals
    'transition_metal': {
        'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn',
        'Y', 'Zr', 'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd',
        'La', 'Hf', 'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg'
    },
    
    # Lanthanides & Actinides
    'lanthanide_actinide': {
        'Ce', 'Pr', 'Nd', 'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb', 'Lu',
        'Th', 'Pa', 'U', 'Np', 'Pu', 'Am', 'Cm', 'Bk', 'Cf', 'Es', 'Fm', 'Md', 'No', 'Lr'
    },
    
    # Alkali & Alkaline Earth
    'alkali_alkaline': {'Li', 'Na', 'K', 'Rb', 'Cs', 'Fr', 'Be', 'Mg', 'Ca', 'Sr', 'Ba', 'Ra'}
}

def is_transition_metal(symbol: str) -> bool:
    return symbol in ELEMENT_CLASSES['transition_metal']

def is_lanthanide_actinide(symbol: str) -> bool:
    return symbol in ELEMENT_CLASSES['lanthanide_actinide']

def is_alkali_alkaline(symbol: str) -> bool:
    return symbol in ELEMENT_CLASSES['alkali_alkaline']

def is_metal(symbol: str) -> bool:
    return (is_transition_metal(symbol) or 
            is_lanthanide_actinide(symbol) or 
            is_alkali_alkaline(symbol) or 
            symbol in {'Al', 'Ga', 'In', 'Tl', 'Sn', 'Pb', 'Bi', 'Po'})

def is_ligand_donor(symbol: str) -> bool:
    """Check if the atom can act as a ligand donor atom (e.g., N, O, S)."""
    return symbol in {'N', 'O', 'P', 'S', 'F', 'Cl', 'Br', 'I', 'As', 'Se', 'Te'}
