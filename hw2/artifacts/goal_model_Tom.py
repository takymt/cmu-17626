"""Goal model extracted from the Tom Brandt interview (transcripts/tom.csv).

Each goal is tagged with ``src:`` lines in tom.csv (``tacit`` marks goals
introduced by refinement heuristics or patterns) and a heuristic score:
V business value, E transcript evidence, P prescriptive precision,
R realizability by a single agent, U uniqueness (0-2 each, total out of 10).
"""

from goalmodeling.schema import (
    AchieveGoal,
    Agent,
    AgentType,
    ConflictLink,
    DomainProperty,
    Goal,
    MaintainGoal,
    PerformanceLink,
    Refinement,
    SoftGoal,
    Vertex,
    generate_graph,
    generate_pako_link,
)

DASHBOARD = Agent("Dashboard", AgentType.SOFTWARE_AGENT)
INVERTER = Agent("Inverter", AgentType.ENVIRONMENT_AGENT)
OWNER = Agent("Homeowner", AgentType.ENVIRONMENT_AGENT)


def by(agent: Agent) -> list[PerformanceLink]:
    return [PerformanceLink(agent, None)]


def refine(
    parent: Goal, children: list[Vertex], code: str = "", complete: bool = False
) -> None:
    # The schema only accepts refinements at construction time; appending lets
    # the model read top-down in goal-ID order.
    parent.disjunctions.append(Refinement(complete, children, annotation=code))


def build() -> tuple[list[Goal], list[ConflictLink]]:
    # src: L11, L175, L212 | score 9 (V2 E2 P1 R2 U2)
    g50 = SoftGoal("G-50: Maximize[ValueOfOnSiteSolarGeneration]")

    # "Separately" means gross import and export, solar production and onsite
    # use, battery charge/discharge and state of charge, and EV charging load,
    # each per 15-minute interval instead of the utility's single net-use figure.
    # src: L11, L17, L20, L25, L30, L48, L200 | score 10 (V2 E2 P2 R2 U2)
    g51 = MaintainGoal("G-51: GrossEnergyFlowsShownPer15Min", by(DASHBOARD), leaf=True)

    # src: L36, L178, L212 | score 10 (V2 E2 P2 R2 U2)
    g52 = AchieveGoal("G-52: SurplusSentToHighestValueUse")
    # src: L36, L38 | score 9 (V1 E2 P2 R2 U2)
    g53 = AchieveGoal(
        "G-53: SurplusExported <b>If</b> BatteryFull", by(INVERTER), leaf=True
    )
    # src: L38 | score 8 (V1 E1 P2 R2 U2)
    g54 = AchieveGoal(
        "G-54: SurplusStoredInBattery <b>If Not</b> BatteryFull",
        by(INVERTER),
        leaf=True,
    )
    # "Full" is ambiguous: it may mean 100% usable capacity or the configured
    # operating limit, so both observable signals are accepted.
    # src: L48, L60 | score 9 (V1 E2 P2 R2 U2)
    g55 = AchieveGoal(
        "G-55: BatteryFullIndicated <b>If</b> SoCAtConfiguredMax Or ChargePowerNearZeroWhileSolarAvailable",
        by(DASHBOARD),
        leaf=True,
    )
    # src: L36, L178, L184 | score 10 (V2 E2 P2 R2 U2)
    g56 = AchieveGoal("G-56: SurplusAllocatedByIntervalValueComparison")
    # The comparison also flags whether a surplus or shortfall is likely.
    # src: L38, L41, L184 | score 10 (V2 E2 P2 R2 U2)
    g57 = AchieveGoal("G-57: ChargeDelayExportOutcomesComparedWithLossesAndReserve")
    # src: L38, L147, L155 | score 9 (V2 E2 P2 R1 U2)
    g58 = AchieveGoal(
        "G-58: SolarAndDemandForecastAlignedTo15Min", by(DASHBOARD), leaf=True
    )
    # src: L187, L192, L195 | score 10 (V2 E2 P2 R2 U2)
    g59 = MaintainGoal("G-59: TariffRateAppliedPerInterval", by(DASHBOARD), leaf=True)
    # src: L166, L171 | score 10 (V2 E2 P2 R2 U2)
    g60 = AchieveGoal(
        "G-60: UtilityNudgeEvaluatedAgainstSurplusForecastAndDeparture",
        by(DASHBOARD),
        leaf=True,
    )
    # The dashboard cannot control charging or export, so the owner applies the
    # allocation it compares (P7).
    # src: L171 | score 9 (V2 E1 P2 R2 U2)
    g61 = AchieveGoal(
        "G-61: ChosenAllocationApplied <b>If</b> OutcomesCompared",
        by(OWNER),
        leaf=True,
    )
    # "Enough" is interpreted as the forecast load from sunset until solar
    # output next exceeds household load.
    # src: L128, L133 | score 10 (V2 E2 P2 R2 U2)
    g62 = MaintainGoal(
        "G-62: BatteryReserveCoversOvernightAndMorningLoad", by(OWNER), leaf=True
    )
    # src: L11, L204, L206 | score 9 (V1 E2 P2 R2 U2)
    g63 = AchieveGoal("G-63: EVChargingSourceAttributed")
    # src: L206
    dp1 = DomainProperty(
        "The meter reports grid import without its destination (EV or battery)",
        leaf=True,
    )
    # src: L25, L204, L206 | score 10 (V2 E2 P2 R2 U2)
    g64 = AchieveGoal(
        "G-64: MeterInverterBatteryChargerReadingsAlignedPer15Min",
        by(DASHBOARD),
        leaf=True,
    )
    # src: L204 | score 9 (V1 E2 P2 R2 U2)
    g65 = AchieveGoal(
        "G-65: EVChargingSourceEstimatedPerInterval", by(DASHBOARD), leaf=True
    )
    # src: L161, L166 | score 10 (V2 E2 P2 R2 U2)
    g66 = AchieveGoal(
        "G-66: EVCharged <b>If</b> SolarSurplusAvailable", by(OWNER), leaf=True
    )
    # The utility's goal as experienced by Tom; it conflicts with G-66.
    # src: L161, L166 | score 8 (V1 E2 P2 R2 U1)
    g67 = AchieveGoal(
        "G-67: EVChargingDelayed <b>If</b> UtilityPeakNudge", by(OWNER), leaf=True
    )

    # src: L11, L84, L114 | score 9 (V2 E2 P1 R2 U2)
    g68 = SoftGoal("G-68: Maximize[TrustInEnergyData]")
    # src: L67, L74 | score 10 (V2 E2 P2 R2 U2)
    g69 = AchieveGoal("G-69: DataDiscrepanciesResolved")
    # src: L67, L77 | score 10 (V2 E2 P2 R2 U2)
    g70 = AchieveGoal("G-70: AnomaliesFlagged <b>If</b> NewMeterDataArrives")
    # Missing and delayed are separated by the utility's delivery deadline so
    # the cases are disjoint (P3).
    # src: L67, L80 | score 10 (V2 E2 P2 R2 U2)
    g71 = AchieveGoal(
        "G-71: IntervalFlaggedMissing <b>If</b> ReadingAbsentPastDeadlineOrDuplicated",
        by(DASHBOARD),
        leaf=True,
    )
    # src: L77, L80 | score 10 (V2 E2 P2 R2 U2)
    g72 = AchieveGoal(
        "G-72: IntervalFlaggedDelayed <b>If</b> ReadingAbsentWithinDeadline",
        by(DASHBOARD),
        leaf=True,
    )
    # src: L67, L80 | score 10 (V2 E2 P2 R2 U2)
    g73 = AchieveGoal(
        "G-73: IntervalFlaggedMismatch <b>If</b> SourcesDisagreeOrRegisterChangeAbnormal",
        by(DASHBOARD),
        leaf=True,
    )
    # Evidence = interval, source, original values, the triggering check and its
    # explanation, on both web and mobile.
    # src: L77, L80, L84, L86, L90 | score 10 (V2 E2 P2 R2 U2)
    g74 = AchieveGoal("G-74: FlagEvidenceShownOnWebAndMobile", by(DASHBOARD), leaf=True)
    # src: L80, L100 | score 9 (V1 E2 P2 R2 U2)
    g75 = AchieveGoal(
        "G-75: ExceptionMarkedResolved <b>If</b> OwnerVerified", by(OWNER), leaf=True
    )
    # With the raw records and original values, Tom can reproduce any total
    # instead of trusting a rounded chart.
    # src: L67, L84, L86, L119, L123 | score 10 (V2 E2 P2 R2 U2)
    g76 = AchieveGoal(
        "G-76: RawIntervalRecordsDownloadableAsCSVWithQualityFlags",
        by(DASHBOARD),
        leaf=True,
    )
    # src: L77, L84 | score 10 (V2 E2 P2 R2 U2)
    g77 = MaintainGoal(
        "G-77: OriginalReadingsPreservedWithRevisionHistory", by(DASHBOARD), leaf=True
    )
    # src: L86, L100 | score 10 (V2 E2 P2 R2 U2)
    g78 = AchieveGoal("G-78: OwnerAlerted <b>If</b> DataIssueDetected")
    # "Urgent" is whatever exceeds the owner's thresholds in G-83.
    # src: L100, L112 | score 10 (V2 E2 P2 R2 U2)
    g79 = AchieveGoal(
        "G-79: PushNotificationSent <b>If</b> UrgentIssue", by(DASHBOARD), leaf=True
    )
    # src: L112 | score 10 (V2 E2 P2 R2 U2)
    g80 = AchieveGoal(
        "G-80: IssueRecordedForLaterReview <b>If Not</b> UrgentIssue",
        by(DASHBOARD),
        leaf=True,
    )
    # src: L112, L114 | score 9 (V2 E2 P1 R2 U2)
    g81 = SoftGoal("G-81: Reduce[AlertNoise]")
    # src: L112, L114 | score 9 (V1 E2 P2 R2 U2)
    g82 = AchieveGoal(
        "G-82: RelatedAlertsGroupedWithIntervalDrillDown", by(DASHBOARD), leaf=True
    )
    # src: L112 | score 9 (V1 E2 P2 R2 U2)
    g83 = MaintainGoal(
        "G-83: AlertThresholdsConfigurableByOwner", by(DASHBOARD), leaf=True
    )

    # src: L74, L155 | score 9 (V2 E2 P1 R2 U2)
    g84 = SoftGoal("G-84: Reduce[ManualReconciliationEffort]")

    refine(g50, [g51, g52, g62, g63, g66], "H4")
    # Battery-first rule vs. value comparison: the rule is simple but ignores
    # time-varying credits ("too crude"), the comparison needs forecasts (H6).
    refine(g52, [g53, g54, g55], "H10")
    refine(g52, [g56], "H6")
    refine(g56, [g57, g61], "P7")
    refine(g57, [g58, g59, g60], "H11")
    refine(g63, [dp1, g64, g65], "P6")
    refine(g68, [g69, g76, g77, g78, g81], "H3")
    refine(g69, [g70, g74, g75], "P1")
    refine(g70, [g71, g72, g73], "P3")
    refine(g78, [g79, g80], "P3", complete=True)
    refine(g81, [g82, g83], "H4")
    refine(g84, [g70, g58, g64], "H7")

    # src: L161, L166
    conflicts = [ConflictLink(g66, g67)]
    return [g50, g68, g84], conflicts


if __name__ == "__main__":
    graph = generate_graph(*build())
    print(graph)
    print(generate_pako_link(graph))
