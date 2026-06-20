import pytest
from app.services.selection_parser import get_selection_ast

def test_ast_has_spans():
    expr = "elem:C"
    ast = get_selection_ast(expr)
    assert "span" in ast, f"AST root should have span. Got: {ast}"
    assert ast["span"] == [0, 6] # "elem:C" is 6 chars

    expr = "elem:C AND label:C1"
    ast = get_selection_ast(expr)
    # The top level is an AND operation
    assert ast["type"] == "logic"
    assert ast["operator"] == "AND"
    assert "span" in ast
    # elem:C (0-6)
    #  AND (7-10)
    assert ast["span"] == [0, 19]
    
    operand1 = ast["operands"][0]
    assert operand1["kind"] == "elem"
    assert operand1["span"] == [0, 6]
    
    operand2 = ast["operands"][1]
    assert operand2["kind"] == "label"
    # "elem:C " is 7 chars. "AND " is 4 chars.
    # "elem:C" 0-6
    # " " 6-7
    # "AND" 7-10
    # " " 10-11
    assert operand2["span"] == [11, 19]

def test_pin_span():
    expr = "pin(elem:C)"
    # pin(elem:C)
    # 01234567890
    # 0123: pin(
    # 4-10: elem:C
    # 10: )
    # len: 11
    ast = get_selection_ast(expr)
    assert ast["kind"] == "pin"
    assert ast["span"] == [0, 11]
    assert ast["operand"]["kind"] == "elem"
    assert ast["operand"]["span"] == [4, 10]
