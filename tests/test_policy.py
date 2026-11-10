from synter_loop.policy import classify_effect, evaluate_write


def test_effect_classification_prefers_metadata_and_fails_closed():
    assert classify_effect("anything", {"effect": "read"}) == "read"
    assert classify_effect("get_campaign_stats") == "read"
    assert classify_effect("set_campaign_budget", {"effect": "read", "externalMutation": True}) == "write"
    assert classify_effect("mcp__synter__mystery") == "unknown"


def test_spend_guard_matrix():
    assert evaluate_write(tool_name="get_report", effect="read").decision == "pass"
    assert evaluate_write(tool_name="mystery", effect="unknown").decision == "block"
    assert evaluate_write(tool_name="set_budget", effect="write", mode="propose_only").decision == "proposal"
    assert evaluate_write(tool_name="set_budget", effect="write", mode="interactive", delta_usd=101,
                          tracking_ok=True, synter_ok=True).decision == "block"
    assert evaluate_write(tool_name="set_budget", effect="write", mode="interactive", delta_usd=10,
                          tracking_ok=False, synter_ok=True).decision == "block"
    assert evaluate_write(tool_name="set_budget", effect="write", mode="interactive", delta_usd=10,
                          tracking_ok=True, unattended=True, synter_ok=True).decision == "proposal"
    assert evaluate_write(tool_name="set_budget", effect="write", mode="interactive", delta_usd=10,
                          tracking_ok=True, frozen=True, synter_ok=True).decision == "block"
    approved = evaluate_write(tool_name="set_budget", effect="write", mode="interactive", delta_usd=10,
                              tracking_ok=True, synter_ok=True)
    assert approved.decision == "approval" and approved.requires_approval


def test_daily_and_platform_caps_block():
    assert evaluate_write(tool_name="set_budget", effect="write", mode="interactive", delta_usd=1,
                          daily_after_usd=251, tracking_ok=True, synter_ok=True).decision == "block"
    assert evaluate_write(tool_name="set_budget", effect="write", mode="interactive", delta_usd=1,
                          platform="meta", platform_after_usd=50, platform_caps={"meta": 40},
                          tracking_ok=True, synter_ok=True).decision == "block"
