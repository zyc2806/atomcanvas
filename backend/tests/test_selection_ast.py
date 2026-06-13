import pytest
from app.services.selection_parser import get_selection_ast


def _strip_spans(node):
    if isinstance(node, dict):
        return {k: _strip_spans(v) for k, v in node.items() if k != "span"}
    if isinstance(node, list):
        return [_strip_spans(v) for v in node]
    return node

def test_ast_elem():
    expr = "elem:C"
    ast = get_selection_ast(expr)
    assert _strip_spans(ast) == {"type": "selector", "kind": "elem", "value": "C"}

def test_ast_pos():
    expr = "pos:x>5"
    ast = get_selection_ast(expr)
    assert _strip_spans(ast) == {
        "type": "selector", 
        "kind": "pos", 
        "axis": "x", 
        "op": ">", 
        "value": 5.0
    }

def test_ast_or():
    expr = "elem:C OR elem:O"
    ast = get_selection_ast(expr)
    assert _strip_spans(ast) == {
        "type": "logic",
        "operator": "OR",
        "operands": [
            {"type": "selector", "kind": "elem", "value": "C"},
            {"type": "selector", "kind": "elem", "value": "O"}
        ]
    }

def test_ast_and_nested():
    expr = "elem:C AND (pos:x>0 OR pos:y<0)"
    ast = get_selection_ast(expr)
    # AND has higher precedence or logic dictates structure
    # infixNotation usually groups based on precedence.
    # The parser defines AND and OR with same precedence (2), but AND usually binds tighter? 
    # In the code:
    # (pp.CaselessLiteral("AND"), 2, pp.opAssoc.LEFT),
    # (pp.CaselessLiteral("OR"), 2, pp.opAssoc.LEFT),
    # They have same precedence. So it's left-associative.
    
    # Expected structure for "A AND (B OR C)"
    assert _strip_spans(ast) == {
        "type": "logic",
        "operator": "AND",
        "operands": [
            {"type": "selector", "kind": "elem", "value": "C"},
            {
                "type": "logic",
                "operator": "OR",
                "operands": [
                    {"type": "selector", "kind": "pos", "axis": "x", "op": ">", "value": 0.0},
                    {"type": "selector", "kind": "pos", "axis": "y", "op": "<", "value": 0.0}
                ]
            }
        ]
    }

def test_ast_not():
    expr = "NOT elem:H"
    ast = get_selection_ast(expr)
    assert _strip_spans(ast) == {
        "type": "logic",
        "operator": "NOT",
        "operand": {"type": "selector", "kind": "elem", "value": "H"}
    }

def test_ast_invalid():
    with pytest.raises(ValueError):
        get_selection_ast("elem:C OR")

def test_ast_complex_chain():
    # A OR B OR C -> (A OR B) OR C due to Left associativity
    expr = "elem:C OR elem:N OR elem:O"
    ast = get_selection_ast(expr)
    assert _strip_spans(ast) == {
        "type": "logic",
        "operator": "OR",
        "operands": [
            {"type": "selector", "kind": "elem", "value": "C"},
            {"type": "selector", "kind": "elem", "value": "N"},
            {"type": "selector", "kind": "elem", "value": "O"}
        ]
    } 
