"""Generate the Step 3 traceability matrix and missing-items list.

Writes two files into artifacts/:

- matrix.json: rows of [use case or step ID, goal ID]; a use case, step or goal
  without a mapping appears with "None" in the opposing column.
- missing.json: {"goals": [...], "steps": [...]} listing goals and use case
  steps not stated in any transcript.

With --check, nothing is written; the command fails if either file differs
from what would be generated.
"""

import json
import sys
from pathlib import Path
from typing import Any

ARTIFACTS = Path(__file__).parent / "artifacts"
sys.path.insert(0, str(ARTIFACTS))

from goal_model_combined import MERGES, build, ends, goal_id, reachable  # noqa: E402

# Use case or step -> goal IDs it realizes. Use-case-level entries cover goals
# satisfied by the process as a whole or by its pre/post-conditions.
TRACE: dict[str, list[int]] = {
    "UC-1": [2, 3, 19, 23, 25, 29],
    "UC-1@1": [4],
    "UC-1@2": [24, 31, 32, 33],
    "UC-1@3": [7],
    "UC-1@4": [6],
    "UC-1@5": [26],
    "UC-1@6": [5, 27],
    "UC-1@7": [8, 30],
    "UC-1@8": [10],
    "UC-2": [1],
    "UC-2@1": [22],
    "UC-2@2": [15],
    "UC-2@3": [19],
    "UC-2@4": [17],
    "UC-2@5": [16, 18],
    "UC-2@6": [13],
    "UC-2@7": [20, 21],
    "UC-2@8": [14],
    "UC-3": [17, 35, 39, 40],
    "UC-3@2": [41],
    "UC-3@3": [36, 37],
    "UC-3@4": [42, 43],
    "UC-3@5": [32, 45, 46],
    "UC-3@6": [44, 48, 49],
    "UC-4": [68, 69, 81, 83, 84],
    "UC-4@1": [17],
    "UC-4@2": [64],
    "UC-4@3": [70, 71, 72, 73],
    "UC-4@4": [78, 79, 80, 82],
    "UC-4@5": [74],
    "UC-4@6": [76],
    "UC-4@7": [75, 77],
    "UC-5": [50, 52, 56, 62],
    "UC-5@1": [58],
    "UC-5@2": [59],
    "UC-5@3": [57],
    "UC-5@4": [60],
    "UC-5@5": [8, 61, 66],
    "UC-5@6": [53, 54, 55],
    "UC-5@7": [51, 63, 65],
}

# Not stated in any transcript: tacit goals (marked "src: tacit" in the models)
# and steps whose main event or conditional branch was derived by refinement.
MISSING_GOALS = [38, 43]
MISSING_STEPS = ["UC-1@4", "UC-2@5", "UC-2@8"]


def trace_ids(use_cases: list[dict[str, Any]]) -> list[str]:
    return [
        trace_id
        for uc in use_cases
        for trace_id in [
            uc["uc_id"],
            *(f"{uc['uc_id']}@{m}" for m in range(1, len(uc["flow_of_events"]) + 1)),
        ]
    ]


def main(check: bool) -> int:
    use_cases = json.loads((ARTIFACTS / "use_cases.json").read_text())
    ids = trace_ids(use_cases)
    roots, links = build()
    goals = sorted(
        goal_id(g)
        for g in reachable([*roots, *(e for link in links for e in ends(link))])
    )
    absorbed = {absorbed for absorbed, _ in MERGES.values()}

    unknown_ids = set(TRACE) - set(ids)
    unknown_goals = {g for gs in TRACE.values() for g in gs} - set(goals)
    assert not unknown_ids, f"trace IDs not in use_cases.json: {unknown_ids}"
    assert not unknown_goals, f"goals not in the combined model: {unknown_goals}"
    assert set(MISSING_STEPS) <= set(ids), "missing steps must exist"
    assert set(MISSING_GOALS) <= set(goals) | absorbed, "missing goals must exist"

    mapped = {g for gs in TRACE.values() for g in gs}
    rows = [
        *([i, f"G-{g}"] for i in ids for g in TRACE.get(i, [])),
        *([i, "None"] for i in ids if i not in TRACE),
        *(["None", f"G-{g}"] for g in goals if g not in mapped),
    ]
    missing = {"goals": [f"G-{g}" for g in MISSING_GOALS], "steps": MISSING_STEPS}
    outputs = {
        ARTIFACTS / "matrix.json": json.dumps(rows, indent=2) + "\n",
        ARTIFACTS / "missing.json": json.dumps(missing, indent=2) + "\n",
    }

    if check:
        stale = [
            p.name
            for p, text in outputs.items()
            if not p.exists() or p.read_text() != text
        ]
        for name in stale:
            print(f"error: {name} is out of date; run `just trace`", file=sys.stderr)
        return 1 if stale else 0

    for path, text in outputs.items():
        path.write_text(text)
    print(
        f"matrix.json: {len(rows)} rows, "
        f"{len(goals) - len(mapped)} unmapped goals, "
        f"{sum(i not in TRACE for i in ids)} unmapped use cases or steps"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(check="--check" in sys.argv[1:]))
