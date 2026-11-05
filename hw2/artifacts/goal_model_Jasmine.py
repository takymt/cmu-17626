"""Goal model extracted from the Jasmine Ford interview (transcripts/jasmine.csv).

Each goal is tagged with ``src:`` lines in jasmine.csv (``tacit`` marks goals
introduced by refinement heuristics or patterns) and a heuristic score:
V business value, E transcript evidence, P prescriptive precision,
R realizability by a single agent, U uniqueness (0-2 each, total out of 10).
"""

from goalmodeling.schema import (
    AchieveGoal,
    Agent,
    AgentType,
    AvoidGoal,
    ConflictLink,
    DomainProperty,
    Goal,
    MaintainGoal,
    Obstacle,
    ObstructionLink,
    PerformanceLink,
    Refinement,
    ResolutionLink,
    SoftGoal,
    Vertex,
    generate_graph,
    generate_pako_link,
)

DASHBOARD = Agent("Dashboard", AgentType.SOFTWARE_AGENT)
SMART_METER = Agent("SmartMeter", AgentType.ENVIRONMENT_AGENT)
RENTER = Agent("Renter", AgentType.ENVIRONMENT_AGENT)


def by(agent: Agent) -> list[PerformanceLink]:
    return [PerformanceLink(agent, None)]


def refine(
    parent: Goal, children: list[Vertex], code: str = "", complete: bool = False
) -> None:
    # The schema only accepts refinements at construction time; appending lets
    # the model read top-down in goal-ID order.
    parent.disjunctions.append(Refinement(complete, children, annotation=code))


def build() -> tuple[list[Goal], list[ConflictLink | ObstructionLink | ResolutionLink]]:
    # Why avoid bill surprises? So the bill can be paid from the next paycheck
    # without deferring other expenses (H12).
    # src: L51 | score 8 (V2 E1 P1 R2 U2)
    g35 = SoftGoal("G-35: Improve[HouseholdBudgetPredictability]")

    # "Unexpected" is interpreted as a bill more than 10% above the latest
    # estimate shown before it was issued.
    # src: L51, L67 | score 10 (V2 E2 P2 R2 U2)
    g36 = AvoidGoal("G-36: UnexpectedBillAmount")
    # src: L48, L51
    dp1 = DomainProperty(
        "The bill is issued only after the billing month ends", leaf=True
    )
    # The estimate projects usage to date through the end of the cycle at the
    # renter's tariff, which the utility already holds.
    # src: L106, L110 | score 10 (V2 E2 P2 R2 U2)
    g37 = AchieveGoal(
        "G-37: BillEstimateShown <b>Before</b> BillIssued", by(DASHBOARD), leaf=True
    )
    # src: tacit | score 7 (V2 E0 P2 R2 U1)
    g38 = MaintainGoal("G-38: UsageToDateAccurate", by(SMART_METER), leaf=True)

    # src: L6, L67 | score 9 (V2 E2 P1 R2 U2)
    g39 = SoftGoal("G-39: Reduce[MonthlyElectricBill]")
    # src: L6, L67, L74 | score 10 (V2 E2 P2 R2 U2)
    g40 = AchieveGoal("G-40: BillIncreaseDriversExplained")
    # "High-use day" is interpreted as a day whose kWh exceeds 125% of the
    # renter's trailing 30-day median; daily temperature sits beside each day.
    # src: L79, L84, L90, L106, L110 | score 10 (V2 E2 P2 R2 U2)
    g41 = AchieveGoal(
        "G-41: DailyKWhAndTemperatureShownWithHighUseDaysMarked",
        by(DASHBOARD),
        leaf=True,
    )
    # src: L74, L79, L106 | score 10 (V2 E2 P2 R2 U2)
    g42 = AchieveGoal("G-42: UsageIncreaseAttributedToHeatingOrOtherLoads")
    # src: L74, L84
    dp2 = DomainProperty(
        "Baseboard heating load rises as outdoor temperature falls", leaf=True
    )
    # Appliance-level loads are unmonitorable without submetering, so heating is
    # estimated from usage-temperature correlation (P6).
    # src: tacit | score 8 (V2 E0 P2 R2 U2)
    g43 = AchieveGoal(
        "G-43: HeatingShareEstimatedFromTemperatureCorrelation",
        by(DASHBOARD),
        leaf=True,
    )

    # src: L95, L102 | score 9 (V2 E2 P1 R2 U2)
    g44 = SoftGoal("G-44: Reduce[ControllableUsage]")
    # src: L37, L95, L113 | score 10 (V2 E2 P2 R2 U2)
    g45 = AchieveGoal("G-45: ControllableUsageIdentified")
    # Tips never propose a setpoint below the comfort range of G-49.
    # src: L37, L95, L102 | score 10 (V2 E2 P2 R2 U2)
    g46 = AchieveGoal(
        "G-46: ActionableTipShown <b>If</b> UsageControllableByRenter",
        by(DASHBOARD),
        leaf=True,
    )
    # src: L13, L15, L23, L95 | score 9 (V2 E2 P2 R2 U1)
    g47 = AchieveGoal(
        "G-47: NoEquipmentOrInsulationChangeRecommended <b>If Not</b> UsageControllableByRenter",
        by(DASHBOARD),
        leaf=True,
    )
    # Covers turning the heat down and closing curtains when away, and deferring
    # laundry, the oven and the window AC.
    # src: L26, L102 | score 9 (V1 E2 P2 R2 U2)
    g48 = AchieveGoal(
        "G-48: ControllableLoadsCutOrDeferred <b>If</b> TipShown",
        by(RENTER),
        leaf=True,
    )

    # The comfort range is the renter's own setpoint band, e.g. 18-22 C.
    # src: L34, L102 | score 9 (V2 E2 P1 R2 U2)
    g49 = MaintainGoal(
        "G-49: IndoorTemperatureWithinComfortRange <b>While</b> Home",
        by(RENTER),
        leaf=True,
    )

    refine(g35, [g36, g39], "H12")
    refine(g36, [dp1, g37, g38], "P6")
    refine(g39, [g40, g44], "H4")
    refine(g40, [g41, g42], "H4")
    refine(g42, [dp2, g43], "P6")
    # The dashboard identifies controllable loads; only the renter can act.
    refine(g44, [g45, g48], "H5")
    refine(g45, [g46, g47], "P3", complete=True)

    # src: L13, L15, L23
    o1 = Obstacle("RenterCannotModifyHeatingOrInsulation", annotation="H8")
    links: list[ConflictLink | ObstructionLink | ResolutionLink] = [
        ObstructionLink(g39, o1),
        ResolutionLink(g47, o1),
        # Weak conflict: on very cold days, cutting the dominant (heating) load
        # pushes the apartment below the comfort range.
        # src: L34, L102
        ConflictLink(g44, g49),
    ]
    return [g35, g49], links


if __name__ == "__main__":
    graph = generate_graph(*build())
    print(graph)
    print(generate_pako_link(graph))
