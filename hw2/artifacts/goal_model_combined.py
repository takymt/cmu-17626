"""Combined goal model merging the Marissa, Jasmine and Tom models (Step 2).

Goal IDs are those of the individual models. When two goals duplicate each
other, the retained goal is rewritten to carry both goals' information and the
absorbed goal's ID becomes a gap (see MERGES).
"""

import re
from collections.abc import Iterable
from typing import Any

import goal_model_Jasmine
import goal_model_Marissa
import goal_model_Tom
from goalmodeling.schema import (
    ConflictLink,
    Goal,
    ObstructionLink,
    Refinement,
    generate_graph,
    generate_pako_link,
)

# Retained goal ID -> (absorbed goal ID, rewritten retained goal).
MERGES: dict[int, tuple[int, str]] = {
    # Marissa's meter expectation and Jasmine's usage-to-date accuracy are the
    # same SmartMeter expectation.
    # src: marissa.csv L48, L52; jasmine.csv tacit
    17: (38, "G-17: IntervalUsageRecordedAccuratelyAndTransmittedPer15Min"),
    # Tom delaying EV charging on a utility nudge is one instance of a customer
    # shifting flexible load out of the peak window.
    # src: marissa.csv L79, L117, L130; tom.csv L161, L166
    8: (
        67,
        "G-8: FlexibleLoadIncludingEVChargingShiftedOutOfPeakWindow <b>If</b> NudgeReceived",
    ),
    # Customers with limited control (e.g., renters who cannot change heating,
    # insulation or equipment) get only low-effort options and never upgrade
    # recommendations.
    # src: marissa.csv L92, L130; jasmine.csv L13, L15, L23, L95
    32: (47, "G-32: OnlyLowEffortOptionsOffered <b>If</b> LimitedControl"),
}

GOAL_ID = re.compile(r"^G-(\d+):")


def goal_id(goal: Any) -> int:
    match = GOAL_ID.match(goal.name)
    assert match, f"goal without a G-n ID: {goal.name}"
    return int(match.group(1))


def ends(link: Any) -> list[Any]:
    if isinstance(link, ConflictLink):
        return [link.goal1, link.goal2]
    return [link.goal]


def reachable(roots: Iterable[Any]) -> list[Any]:
    # Goals may have several parents, so deduplicate by node identity.
    seen: dict[int, Any] = {}
    stack = list(roots)
    while stack:
        vertex = stack.pop()
        if isinstance(vertex, Goal) and vertex.node_id not in seen:
            seen[vertex.node_id] = vertex
            stack.extend(c for r in vertex.disjunctions for c in r.children)
    return list(seen.values())


def build() -> tuple[list[Any], list[Any]]:
    parts = [
        m.build() for m in (goal_model_Marissa, goal_model_Jasmine, goal_model_Tom)
    ]
    roots = [r for rs, _ in parts for r in rs]
    links = [link for _, ls in parts for link in ls]
    goals = {
        goal_id(g): g
        for g in reachable([*roots, *(e for link in links for e in ends(link))])
    }

    replacement = {
        id(goals[absorbed]): goals[kept] for kept, (absorbed, _) in MERGES.items()
    }
    for kept, (_, name) in MERGES.items():
        goals[kept].name = name

    def swap(vertex: Any) -> Any:
        return replacement.get(id(vertex), vertex)

    for goal in goals.values():
        for refinement in goal.disjunctions:
            refinement.children = [swap(c) for c in refinement.children]
    for link in links:
        if isinstance(link, ConflictLink):
            link.goal1, link.goal2 = swap(link.goal1), swap(link.goal2)
        else:
            link.goal = swap(link.goal)

    # Each model defines its own agents; unify same-named roles (Dashboard,
    # SmartMeter) so the combined model has one node per agent.
    agents: dict[str, Any] = {}
    for goal in goals.values():
        for performance in goal.performs:
            performance.agent = agents.setdefault(
                performance.agent.name, performance.agent
            )

    # Tom's internal conflict G-66 vs. G-67 now reads G-66 vs. G-8 through the
    # merge: the utility wants EV charging moved out of the peak window, while
    # Tom wants to charge whenever solar surplus is available. It stays with
    # Tom, who weighs the nudge against his surplus forecast (G-60).
    links.append(
        # Summer thermostat nudges can push a renter outside her comfort range;
        # G-32 limits such customers to low-effort options.
        # src: marissa.csv L79, L130; jasmine.csv L34, L102
        ConflictLink(goals[8], goals[49])
    )

    # The renter's inability to change heating or insulation is one cause of
    # customers ignoring nudges (H8).
    obstacles = {
        link.obstacle.name: link.obstacle
        for link in links
        if isinstance(link, ObstructionLink)
    }
    obstacles["CustomerIgnoresNudge"].refinements.append(
        Refinement(False, [obstacles["RenterCannotModifyHeatingOrInsulation"]])
    )

    # Unstated condition: Tom wants to inspect an alert "while the event is
    # still recent" (tom.csv L86), but AMI data arrives only the next day
    # (marissa.csv L48). G-70 already triggers on data arrival, so "recent" is
    # interpreted as "as soon as the next-day data arrives".
    return list(dict.fromkeys(swap(r) for r in roots)), links


if __name__ == "__main__":
    graph = generate_graph(*build())
    print(graph)
    print(generate_pako_link(graph))
