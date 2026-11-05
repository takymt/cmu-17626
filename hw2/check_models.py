"""Check individual goal models against the assignment's structural requirements.

Usage: python hw2/check_models.py MODEL.py [MODEL.py ...]

Each model module must expose ``build() -> (roots, links)``. Goal IDs are
checked across all given models together, so pass only the individual
(per-transcript) models, not the combined one.
"""

import importlib.util
import re
import sys
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from itertools import chain
from pathlib import Path
from typing import Any

from goalmodeling.schema import (
    BehavioralGoal,
    ConflictLink,
    Goal,
    ObstructionLink,
    ResolutionLink,
    SoftGoal,
)

REQUIRED_CODES = frozenset(
    [f"H{n}" for n in range(3, 13)] + [f"P{n}" for n in range(1, 8)]
)
GOAL_ID = re.compile(r"^G-(\d+):")
GOAL_ASSIGNMENT = re.compile(r"^\s*g\d+ = \w+\(")


@dataclass(frozen=True)
class Model:
    path: Path
    goals: tuple[Any, ...]
    links: tuple[Any, ...]


def load(path: Path) -> Model:
    spec = importlib.util.spec_from_file_location(path.stem, path)
    assert spec and spec.loader, f"cannot import {path}"
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    roots, links = module.build()
    return Model(
        path, reachable([*roots, *chain.from_iterable(map(ends, links))]), tuple(links)
    )


def ends(link: Any) -> list[Any]:
    if isinstance(link, ConflictLink):
        return [link.goal1, link.goal2]
    return [link.goal]


def reachable(roots: Iterable[Any]) -> tuple[Any, ...]:
    # Goals may have several parents, so deduplicate by node identity.
    seen: dict[int, Any] = {}
    stack = list(roots)
    while stack:
        vertex = stack.pop()
        if isinstance(vertex, Goal) and vertex.node_id not in seen:
            seen[vertex.node_id] = vertex
            stack.extend(c for r in vertex.disjunctions for c in r.children)
    return tuple(seen.values())


def all_goals(models: list[Model]) -> list[Any]:
    return [g for m in models for g in m.goals]


def check_ids(models: list[Model]) -> list[str]:
    goals = all_goals(models)
    unnamed = [
        f"goal without a G-n ID: {g.name}" for g in goals if not GOAL_ID.match(g.name)
    ]
    ids = sorted(int(m.group(1)) for g in goals if (m := GOAL_ID.match(g.name)))
    expected = list(range(1, len(ids) + 1))
    gaps = (
        []
        if ids == expected
        else [f"IDs must be G-1..G-{len(ids)} without gaps or duplicates"]
    )
    return unnamed + gaps


def check_codes(models: list[Model]) -> list[str]:
    annotations = chain(
        (r.annotation for g in all_goals(models) for r in g.disjunctions),
        (
            link.obstacle.annotation
            for m in models
            for link in m.links
            if isinstance(link, ObstructionLink | ResolutionLink)
        ),
    )
    used = {code.strip() for a in annotations for code in a.split(",") if code.strip()}
    missing = sorted(REQUIRED_CODES - used, key=lambda c: (c[0], int(c[1:])))
    return (
        [f"heuristic/pattern codes never used: {', '.join(missing)}"] if missing else []
    )


def check_coverage(models: list[Model]) -> list[str]:
    goals = all_goals(models)
    links = [link for m in models for link in m.links]
    required: list[tuple[str, bool]] = [
        (
            "at least one behavioral goal",
            any(isinstance(g, BehavioralGoal) for g in goals),
        ),
        ("at least one soft goal", any(isinstance(g, SoftGoal) for g in goals)),
        ("at least one OR-refinement", any(len(g.disjunctions) > 1 for g in goals)),
        (
            "at least one conflict",
            any(isinstance(link, ConflictLink) for link in links),
        ),
    ]
    return [f"missing {what}" for what, present in required if not present]


def check_leaves(models: list[Model]) -> list[str]:
    return [
        f"{m.path.name}: leaf goal has no responsible agent: {g.name}"
        for m in models
        for g in m.goals
        if not g.disjunctions and not g.performs
    ]


def check_sources(models: list[Model]) -> list[str]:
    return [
        f"{m.path.name}:{n}: goal has no '# src:' comment above it"
        for m in models
        for n, comments in goal_comment_blocks(m.path.read_text().splitlines())
        if not any("src:" in c for c in comments)
    ]


def goal_comment_blocks(lines: list[str]) -> list[tuple[int, list[str]]]:
    def comments_above(index: int) -> list[str]:
        block = []
        for line in reversed(lines[:index]):
            if not line.strip().startswith("#"):
                break
            block.append(line)
        return block

    return [
        (i + 1, comments_above(i))
        for i, line in enumerate(lines)
        if GOAL_ASSIGNMENT.match(line)
    ]


CHECKS: list[Callable[[list[Model]], list[str]]] = [
    check_ids,
    check_codes,
    check_coverage,
    check_leaves,
    check_sources,
]


def main(paths: list[str]) -> int:
    if not paths:
        print(__doc__, file=sys.stderr)
        return 2
    models = [load(Path(p)) for p in paths]
    errors = [e for check in CHECKS for e in check(models)]
    for error in errors:
        print(f"error: {error}", file=sys.stderr)
    if not errors:
        print(f"ok: {len(all_goals(models))} goals in {len(models)} models")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
