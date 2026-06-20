import pytest
from ase import Atoms
from app.services.selection_parser import get_selection_ast, parse_selection_expression

@pytest.fixture
def atoms():
    return Atoms('CO', positions=[(0, 0, 0), (0, 0, 1.2)])

def test_sphere_atom_index_ast_structure():
    ast = get_selection_ast("sphere:@5,5")
    assert ast["kind"] == "sphere"
    assert "targets" in ast
    assert ast["targets"] == [5]

def test_bonded_parsing_crash(atoms):
    ast = get_selection_ast("bonded:@0")
    assert ast["kind"] == "bonded"
    assert ast["targets"] == [0]
    indices = parse_selection_expression(atoms, "bonded:@0")
    assert isinstance(indices, list)

def test_extend_parsing_success(atoms):
    # New syntax with semicolon should work
    ast = get_selection_ast("extend:@0;2")
    assert ast["kind"] == "extend"
    assert ast["targets"] == [0]
    assert ast["hops"] == 2
    indices = parse_selection_expression(atoms, "extend:@0;2")
    assert isinstance(indices, list)

def test_extend_parsing_fail_old_syntax(atoms):
    # Old syntax with comma should fail
    with pytest.raises(ValueError, match="Invalid selection syntax"):
        get_selection_ast("extend:@0,2")
