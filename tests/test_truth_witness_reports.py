from synter_loop.grading import grade_change
from synter_loop.jev import decide
from synter_loop.reports import summarize
from synter_loop.truth import is_performance_question, reconcile_answer
from synter_loop.witness import analyze_trace


def test_truth_layer_only_changes_wrong_claims_with_same_run_evidence():
    evidence = {"run_id": "run-1", "sources": {"Meta": "120", "GA4": "71", "CAPI": "84"}}
    correct = "Conversions: Meta 120, GA4 71, CAPI 84."
    assert reconcile_answer(correct, evidence)[0] == correct
    transformed, mismatches = reconcile_answer("GA4 conversions were 99.", evidence)
    assert "Synter evidence" in transformed and "run run-1" in transformed
    assert mismatches == ["99"]
    blocked, _ = reconcile_answer("GA4 conversions were 99.", evidence, mode="block")
    assert "replaced an unsupported" in blocked
    assert reconcile_answer("anything", {}, mode="block") == ("anything", [])
    assert is_performance_question("What is our ROAS?")
    assert not is_performance_question("Write a poem about winter")


def test_tag_witness_fixture_redacts_query_and_reports_missing():
    trace = [
        {"type": "request", "url": "https://www.googletagmanager.com/gtm.js?id=GTM-TEST&token=secret"},
        {"type": "request", "url": "https://www.google-analytics.com/g/collect?client_id=private"},
        {"type": "dataLayer", "event": "purchase"},
    ]
    report = analyze_trace(trace, ["GTM", "GA4", "Meta Pixel"])
    serialized = str(report)
    assert "GTM" in report["fired"] and "GA4" in report["fired"]
    assert report["missing"] == ["Meta Pixel"]
    assert "secret" not in serialized and "client_id" not in serialized


def test_jev_never_authorizes_and_outcome_is_descriptive():
    assert decide(0.9, {"pass": 0.8, "warn": 0.5})["authorizes"] is False
    assert decide(0.4, {"pass": 0.8, "warn": 0.5})["status"] == "block"
    assert decide(None, {})["status"] == "unscored"
    grade = grade_change(10, 13, source="fixture", days_after=7, incremental_spend=2)
    assert grade["incremental_lift"] == 3 and grade["return_on_spend"] == 1.5
    assert grade["changes_spend"] is False
    assert grade_change(None, 13, source="fixture", days_after=7)["grade"] == "inconclusive"


def test_agent_pnl_recomputes_from_event_fixtures():
    variant = {"prompt_hash": "p1", "model": "m1", "plugin_version": "0.1.0"}
    events = [
        {"event_type": "agent_turn_complete", "session_id": "s1", "harness_variant": variant,
         "payload": {"cost_usd": 0.2}},
        {"event_type": "agent_approval", "session_id": "s1", "harness_variant": variant,
         "payload": {"approved": True, "proposal_id": "p-1"}},
        {"event_type": "agent_outcome", "session_id": "s1", "harness_variant": variant,
         "payload": {"incremental_lift": 0.5}},
    ]
    report = summarize(events)
    row = report["variants"][0]
    assert row["token_cost_usd"] == 0.2
    assert row["approved_changes"] == 1
    assert row["cost_per_approved_change_usd"] == 0.2
    assert row["return_on_token_spend"] == 2.5
    assert report["promotes_variant"] is False
