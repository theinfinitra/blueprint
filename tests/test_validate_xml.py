"""Unit tests for draw.io XML validator."""

import json
import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from src.tools.validate_xml import validate_drawio_xml

VALID_DRAWIO = """<mxfile>
  <diagram id="d1" name="Test">
    <mxGraphModel>
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <mxCell id="svc1" value="Service" style="fontSize=14;fontStyle=1;strokeWidth=3;" vertex="1" parent="1">
          <mxGeometry x="100" y="100" width="78" height="78" as="geometry"/>
        </mxCell>
        <mxCell id="svc2" value="DB" style="fontSize=14;fontStyle=1;strokeWidth=3;" vertex="1" parent="1">
          <mxGeometry x="300" y="100" width="78" height="78" as="geometry"/>
        </mxCell>
        <mxCell id="e1" edge="1" source="svc1" target="svc2" style="strokeWidth=3;" parent="1">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>"""


def _call(xml: str) -> dict:
    result = validate_drawio_xml.__wrapped__(xml)
    return json.loads(result)


def test_valid_xml():
    r = _call(VALID_DRAWIO)
    assert r["status"] == "valid"
    assert r["warnings"] == []


def test_malformed_xml():
    r = _call("<mxfile><unclosed>")
    assert r["status"] == "error"
    assert "Malformed XML" in r["details"]


def test_wrong_root_element():
    r = _call("<notmxfile><diagram id='d'><mxGraphModel><root><mxCell id='0'/></root></mxGraphModel></diagram></notmxfile>")
    assert r["status"] == "error"
    assert "mxfile" in r["details"]


def test_missing_diagram():
    r = _call("<mxfile></mxfile>")
    assert r["status"] == "error"
    assert "No <diagram>" in r["details"]


def test_missing_graph_model():
    r = _call("<mxfile><diagram id='d'></diagram></mxfile>")
    assert r["status"] == "error"
    assert "mxGraphModel" in r["details"]


def test_duplicate_ids():
    xml = """<mxfile><diagram id="d"><mxGraphModel><root>
        <mxCell id="0"/><mxCell id="1" parent="0"/>
        <mxCell id="dup" vertex="1" parent="1"><mxGeometry width="78" height="78" as="geometry"/></mxCell>
        <mxCell id="dup" vertex="1" parent="1"><mxGeometry width="78" height="78" as="geometry"/></mxCell>
    </root></mxGraphModel></diagram></mxfile>"""
    r = _call(xml)
    assert r["status"] == "error"
    assert "Duplicate" in r["details"]


def test_broken_edge_reference():
    xml = """<mxfile><diagram id="d"><mxGraphModel><root>
        <mxCell id="0"/><mxCell id="1" parent="0"/>
        <mxCell id="a" vertex="1" parent="1"><mxGeometry width="78" height="78" as="geometry"/></mxCell>
        <mxCell id="e1" edge="1" source="a" target="nonexistent" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    </root></mxGraphModel></diagram></mxfile>"""
    r = _call(xml)
    assert r["status"] == "error"
    assert "nonexistent" in r["details"]


def test_soft_warning_wrong_size():
    xml = """<mxfile><diagram id="d"><mxGraphModel><root>
        <mxCell id="0"/><mxCell id="1" parent="0"/>
        <mxCell id="s1" value="X" style="fontSize=14;fontStyle=1;" vertex="1" parent="1">
          <mxGeometry width="60" height="60" as="geometry"/>
        </mxCell>
    </root></mxGraphModel></diagram></mxfile>"""
    r = _call(xml)
    assert r["status"] == "valid"
    assert any("60x60" in w for w in r["warnings"])


def test_soft_warning_wrong_font_size():
    xml = """<mxfile><diagram id="d"><mxGraphModel><root>
        <mxCell id="0"/><mxCell id="1" parent="0"/>
        <mxCell id="s1" value="X" style="fontSize=12;fontStyle=1;" vertex="1" parent="1">
          <mxGeometry width="78" height="78" as="geometry"/>
        </mxCell>
    </root></mxGraphModel></diagram></mxfile>"""
    r = _call(xml)
    assert r["status"] == "valid"
    assert any("fontSize=12" in w for w in r["warnings"])
