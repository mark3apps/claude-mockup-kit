#!/usr/bin/env python3
"""Cost chart starter: a row per thing, its price split by resource and by part, rows by tier, every
number editable on the chart, the changes sent as picks (README: Cost charts). Copy this as make.py,
rename the title, edit the words marked EDIT and replace the data (several charts can share a page)."""
import sys
sys.path.insert(0, '/home/user/claude-mockup-kit')  # EDIT if the kit's clone is elsewhere
from pagekit import Page

p = Page('Cost Chart', round=1, sub='EDIT: WHAT IS PRICED, AND FROM WHICH COMMIT', width=1280, app_css=False)
p.lede('EDIT: what each bar is. Drag the end of a piece to change that resource, drag the knob above a part to '
       'scale it, use − and + to move a row to another tier, drop a chip on a part to add it, and click a name '
       'to type every number.')
# {title, how, hint, unit, resources: [{key, name, color}], pips: [{key, color, rarity 1-5, where}], pipName,
# group: {name, min, max}, kinds: {KIND: {name, color}}, weights: {RES: n}, pipWeight, sort: "total" | "none",
# palette: false, rows: [{id, name, sub, group, tip, segs: [{id, kind, label, group, costs: {RES: n},
# pips: {KEY: n}, fixed, placeholder}]}]}. A part with `group` carries its own tier (an Mk); `fixed` parts
# follow a rule and have no handles. A path to a .json file works too.
p.costs({
    'title': 'EDIT: Price to own one', 'unit': '',
    'resources': [{'key': 'ore', 'name': 'ORE', 'color': 'rgb(255,180,94)'}, {'key': 'pyre', 'name': 'PYRE', 'color': 'rgb(255,122,77)'},
                  {'key': 'water', 'name': 'WATER', 'color': 'rgb(86,224,196)'}, {'key': 'volt', 'name': 'VOLT', 'color': 'rgb(190,255,120)'}],
    'pips': [{'key': 'PLATE', 'color': 'rgb(201,212,232)', 'rarity': 2, 'where': 'wrecks'},
             {'key': 'CORE', 'color': 'rgb(255,154,106)', 'rarity': 2, 'where': 'storm rocks'},
             {'key': 'RELIC', 'color': 'rgb(255,214,138)', 'rarity': 4, 'where': 'the outer dark'}],
    'group': {'name': 'TIER', 'min': 0, 'max': 5},
    'kinds': {'research': {'name': 'Research', 'color': '#3987e5'}, 'build': {'name': 'Build', 'color': '#c98500'},
              'up': {'name': 'Upgrades, a piece per level', 'color': '#9b8cff'}},
    'rows': [
        {'id': 'refinery', 'name': 'REFINERY', 'group': 1, 'segs': [
            {'id': 'refinery.r', 'kind': 'research', 'costs': {'ore': 100, 'water': 20}},
            {'id': 'refinery.b', 'kind': 'build', 'costs': {'ore': 35}},
            {'id': 'refinery.L2', 'kind': 'up', 'fixed': True, 'costs': {'ore': 18, 'water': 7}},
            {'id': 'refinery.L3', 'kind': 'up', 'fixed': True, 'costs': {'ore': 26, 'water': 7}}]},
        {'id': 'battery', 'name': 'MISSILE BATTERY', 'group': 2, 'segs': [
            {'id': 'battery.r', 'kind': 'research', 'costs': {'ore': 220, 'pyre': 80}},
            {'id': 'battery.b', 'kind': 'build', 'costs': {'ore': 60, 'pyre': 20}}]},
        {'id': 'mass', 'name': 'MASS DRIVER', 'group': 3, 'segs': [
            {'id': 'mass.r', 'kind': 'research', 'costs': {'ore': 220, 'pyre': 70, 'volt': 30}, 'pips': {'CORE': 2}},
            {'id': 'mass.b', 'kind': 'build', 'costs': {'ore': 90, 'pyre': 30}}]},
    ]}, item='C1')
p.picks(heading='YOUR CHANGES')
p.cli()
