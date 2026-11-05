"""Goal model extracted from the Marissa Cole interview (transcripts/marissa.csv).

Each goal is tagged with ``src:`` lines in marissa.csv (``tacit`` marks goals
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
PROGRAM_STAFF = Agent("ProgramStaff", AgentType.ENVIRONMENT_AGENT)
FORECASTING_TEAM = Agent("ForecastingTeam", AgentType.ENVIRONMENT_AGENT)
EVALUATOR = Agent("Evaluator", AgentType.ENVIRONMENT_AGENT)
SMART_METER = Agent("SmartMeter", AgentType.ENVIRONMENT_AGENT)
CUSTOMER = Agent("Customer", AgentType.ENVIRONMENT_AGENT)


def by(agent: Agent) -> list[PerformanceLink]:
    return [PerformanceLink(agent, None)]


def refine(
    parent: Goal, children: list[Vertex], code: str = "", complete: bool = False
) -> None:
    # The schema only accepts refinements at construction time; appending lets
    # the model read top-down in goal-ID order.
    parent.disjunctions.append(Refinement(complete, children, annotation=code))


def build() -> tuple[list[Goal], list[ConflictLink | ObstructionLink | ResolutionLink]]:
    # src: L7, L12 | score 10 (V2 E2 P2 R2 U2)
    g1 = AchieveGoal("G-1: StateEfficiencyTargetsMet")

    # The regulator sets the kW target and defines the coincident peak window
    # (e.g., 4-8 p.m. on hot summer weekdays), so the goal is measurable.
    # src: L7, L14, L35, L61 | score 10 (V2 E2 P2 R2 U2)
    g2 = AchieveGoal("G-2: CoincidentPeakReductionTargetMet")
    # src: L79 | score 10 (V2 E2 P2 R2 U2)
    g3 = AchieveGoal("G-3: CustomerNudged <b>If</b> UpcomingSystemPeak")
    # src: L48, L59, L79
    dp1 = DomainProperty(
        "AMI interval data becomes available only the day after usage", leaf=True
    )
    # src: L85, L88 | score 9 (V2 E2 P1 R2 U2)
    g4 = MaintainGoal("G-4: PeakForecastAccurate", by(FORECASTING_TEAM), leaf=True)
    # src: L79, L85 | score 10 (V2 E2 P2 R2 U2)
    g5 = AchieveGoal("G-5: PeakNudgeDelivered <b>If</b> PeakForecasted")
    # "Iff" also forbids sending without a forecast (the converse, H9), so no
    # separate Avoid goal is needed.
    # src: L85 | score 10 (V2 E2 P2 R2 U2)
    g6 = AchieveGoal(
        "G-6: NudgeScheduled <b>Iff</b> PeakForecasted And NudgeApproved",
        by(DASHBOARD),
        leaf=True,
    )
    # Approval covers staff review, modification or pausing before sending.
    # src: L85 | score 10 (V2 E2 P2 R2 U2)
    g7 = AchieveGoal(
        "G-7: NudgeApproved <b>If</b> PeakForecasted", by(PROGRAM_STAFF), leaf=True
    )
    # Delaying laundry, precooling and modest thermostat changes are operations
    # that satisfy this expectation, not separate goals (H13).
    # src: L79, L117, L130 | score 10 (V2 E2 P2 R2 U2)
    g8 = AchieveGoal(
        "G-8: FlexibleLoadShiftedOutOfPeakWindow <b>If</b> NudgeReceived",
        by(CUSTOMER),
        leaf=True,
    )

    # "Net savings" is the weather-normalized kWh reduction attributable to
    # the program relative to the control group, not raw consumption change.
    # src: L14, L18, L117 | score 10 (V2 E2 P2 R2 U2)
    g9 = AchieveGoal("G-9: NetKWhSavingsTargetMet")
    # Uses next-day interval data, labeled apart from forecast-based nudges so
    # it never claims to show live demand: the household's usage in the peak
    # window compared with its own history and similar homes.
    # src: L7, L59, L88, L117 | score 10 (V2 E2 P2 R2 U2)
    g10 = AchieveGoal(
        "G-10: PeakWindowUsageComparedWithHistoryAndPeersShown",
        by(DASHBOARD),
        leaf=True,
    )
    # src: L117, L120 | score 8 (V1 E2 P1 R2 U2)
    g11 = AchieveGoal(
        "G-11: RebatesAndSeasonalEducationPromoted", by(PROGRAM_STAFF), leaf=True
    )
    # src: L77, L126 | score 10 (V2 E2 P2 R2 U2)
    g12 = AchieveGoal(
        "G-12: MessageRevised <b>If</b> MeasuredIneffectiveOrFrictionReported",
        by(PROGRAM_STAFF),
        leaf=True,
    )
    # Engagement = logins, insight views, nudge responses, click-throughs and
    # return visits; satisfaction requires in-app feedback the dashboard collects.
    # src: L88, L92, L96, L103, L106, L126 | score 9 (V2 E2 P2 R1 U2)
    g13 = MaintainGoal(
        "G-13: EngagementSatisfactionAndSavingsMeasuredBySegment",
        by(DASHBOARD),
        leaf=True,
    )

    # src: L14, L113 | score 10 (V2 E2 P2 R2 U2)
    g14 = AchieveGoal("G-14: EvaluatedImpactsReportedToRegulator")
    # src: L23, L26 | score 10 (V2 E2 P2 R2 U2)
    g15 = AchieveGoal(
        "G-15: EligibleCustomersRandomlyAssignedToTreatmentOrControl",
        by(DASHBOARD),
        leaf=True,
    )
    # src: L18, L23, L35, L45 | score 10 (V2 E2 P2 R2 U2)
    g16 = AchieveGoal("G-16: NetImpactsEstimatedForCoincidentPeakWindow")
    # src: L48, L52 | score 9 (V2 E2 P2 R2 U1)
    g17 = MaintainGoal(
        "G-17: IntervalUsageRecordedAndTransmittedPer15Min", by(SMART_METER), leaf=True
    )
    # src: L35, L45 | score 10 (V2 E2 P2 R2 U2)
    g18 = AchieveGoal(
        "G-18: WeatherNormalizedTreatmentControlDifferentialComputed",
        by(EVALUATOR),
        leaf=True,
    )
    # Converse of "interventions shown if treatment" (H9).
    # src: L23, L26 | score 10 (V2 E2 P2 R2 U2)
    g19 = MaintainGoal(
        "G-19: InterventionsShown <b>OnlyIf</b> TreatmentGroup",
        by(DASHBOARD),
        leaf=True,
    )
    # Contents: participation, engagement, evaluated kWh and coincident kW with
    # confidence intervals, by treatment status, channel, housing type, income
    # segment and evaluation period.
    # src: L103, L113 | score 10 (V2 E2 P2 R2 U2)
    g20 = AchieveGoal("G-20: AuditReadyReportExported", by(DASHBOARD), leaf=True)
    # "Identifiable" is interpreted as any reported segment below a minimum
    # household count, which is then suppressed.
    # src: L103, L106, L113 | score 9 (V2 E2 P1 R2 U2)
    g21 = AvoidGoal(
        "G-21: IndividualHouseholdIdentifiableInReports", by(DASHBOARD), leaf=True
    )
    # src: L66, L77 | score 9 (V2 E2 P1 R2 U2)
    g22 = MaintainGoal(
        "G-22: RegulatoryDefinitionsConfigurableWithoutCodeChange",
        by(DASHBOARD),
        leaf=True,
    )
    # src: L66, L72, L77 | score 10 (V2 E2 P2 R2 U2)
    g23 = MaintainGoal("G-23: CustomerContentCompliant")
    # src: L72, L77 | score 10 (V2 E2 P2 R2 U2)
    g24 = MaintainGoal(
        "G-24: CustomerMessagesDrawnOnlyFromApprovedLibrary", by(DASHBOARD), leaf=True
    )
    # src: L77 | score 10 (V2 E2 P2 R2 U2)
    g25 = MaintainGoal("G-25: RequiredDisclosuresIncluded", by(DASHBOARD), leaf=True)
    # src: L77, L85, L88 | score 10 (V2 E2 P2 R2 U2)
    g26 = MaintainGoal(
        "G-26: MessageVersionAndTriggerAuditTrailRecorded", by(DASHBOARD), leaf=True
    )
    # "Accessible" is interpreted as meeting WCAG 2.1 AA on mobile browsers.
    # src: L66 | score 9 (V2 E2 P1 R2 U2)
    g27 = MaintainGoal("G-27: DashboardAccessibleOnMobile", by(DASHBOARD), leaf=True)

    # src: L7, L12, L126 | score 9 (V2 E2 P1 R2 U2)
    g28 = SoftGoal("G-28: Increase[CustomerSatisfaction]")
    # src: L126, L130 | score 9 (V2 E2 P1 R2 U2)
    g29 = SoftGoal("G-29: Reduce[NudgeFriction]")
    # src: L130 | score 9 (V1 E2 P2 R2 U2)
    g30 = AchieveGoal(
        "G-30: NudgesDismissedOrPaused <b>If</b> CustomerRequests",
        by(DASHBOARD),
        leaf=True,
    )
    # src: L92, L130 | score 10 (V2 E2 P2 R2 U2)
    g31 = AchieveGoal("G-31: NudgeTailoredToHousingSegment")
    # src: L92, L130 | score 9 (V2 E2 P2 R2 U1)
    g32 = AchieveGoal(
        "G-32: LowEffortOptionsOffered <b>If</b> RenterOrLimitedControl",
        by(DASHBOARD),
        leaf=True,
    )
    # src: L92 | score 9 (V1 E2 P2 R2 U2)
    g33 = AchieveGoal(
        "G-33: ApplianceAndThermostatTipsOffered <b>If</b> Homeowner",
        by(DASHBOARD),
        leaf=True,
    )

    # src: L14, L77, L96 | score 9 (V2 E2 P1 R2 U2)
    g34 = SoftGoal("G-34: Increase[CustomerEngagement]")

    refine(g1, [g2, g9, g14, g21, g22, g23, g27], "H4")
    refine(g2, [g3, g8], "H5")
    refine(g3, [dp1, g4, g5], "P6")
    refine(g5, [g6, g7], "P4")
    refine(g9, [g10, g11, g12, g13], "H4")
    refine(g14, [g15, g16, g20], "P1")
    refine(g16, [g17, g18, g19], "H5, H9")
    refine(g23, [g24, g25, g26], "P5")
    refine(g28, [g10, g29, g13], "H4")
    refine(g29, [g30, g31], "H4")
    refine(g31, [g32, g33], "P2")
    refine(g34, [g31, g10, g12], "H4")

    # G-2 depends on customers acting on nudges, which the system cannot force;
    # tailoring and lower friction mitigate non-compliance (H8).
    # src: L92, L126
    o1 = Obstacle("CustomerIgnoresNudge", annotation="H8")
    links: list[ConflictLink | ObstructionLink | ResolutionLink] = [
        ObstructionLink(g8, o1),
        ResolutionLink(g31, o1),
        ResolutionLink(g29, o1),
        # Engaging wording competes with regulator-approved claims (H8).
        # src: L77
        ConflictLink(g34, g24),
        # Linking engagement to measured savings needs household-level joins,
        # which small segments can expose.
        # src: L103, L106
        ConflictLink(g13, g21),
        # More nudges raise clicks but add friction for households.
        # src: L126
        ConflictLink(g34, g29),
    ]
    return [g1, g28, g34], links


if __name__ == "__main__":
    graph = generate_graph(*build())
    print(graph)
    print(generate_pako_link(graph))
