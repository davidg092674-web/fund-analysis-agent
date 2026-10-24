"""FundLens 每日报告纯规则测试：不依赖外部数据接口。"""
import unittest
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from daily_report import build_daily_report


def _payload(**overrides):
    today = datetime.now(ZoneInfo("Asia/Shanghai")).date()
    metrics = {
        "data_end": str(today - timedelta(days=1)),
        "data_days": 120,
        "latest_nav": 1.2345,
        "return_1trading": 0.5,
        "return_5trading": 1.5,
        "return_20trading": -2.2,
        "return_60trading": 5.3,
        "ma_5": 1.23,
        "ma_20": 1.25,
        "ma_60": 1.20,
        "max_drawdown_20trading": -6.2,
        "max_drawdown_60trading": -13.2,
        "volatility_30d": 22.8,
        "rsi_14": 54.0,
    }
    metrics.update(overrides)
    return build_daily_report(
        fund={"code": "000001", "name": "测试基金C", "type": "混合"},
        fund_profile={"fund_type": "混合"},
        metrics=metrics,
        risk={"risk_score": 68.0, "warnings": ["回撤需关注"]},
        forecast={"validation": {"is_calibrated": False,
                                  "probability_quality": "low", "sample_size": 40}},
        prediction=None,
        backtest=None,
        final_decision={"headline": "等待确认", "summary": "短期反弹仍不稳",
                        "action_label": "观察", "confidence": "低"},
    )


class DailyReportTests(unittest.TestCase):
    def test_structure_and_provenance(self):
        r = _payload()
        self.assertEqual(r["data_status"], "单源待核验")
        self.assertFalse(r["action_enabled"])
        self.assertGreaterEqual(len(r["sections"]), 5)
        self.assertEqual(len(r["action_matrix"]), 5)
        self.assertTrue(any("双源" in t for t in r["data_warnings"]))
        self.assertTrue(any("未证明" in s["summary"] for s in r["sections"]))
        self.assertIn("短期修复", r["sections"][0]["summary"])

    def test_stale_data_downgrades_to_no_action(self):
        old_date = datetime.now(ZoneInfo("Asia/Shanghai")).date() - timedelta(days=16)
        r = _payload(data_end=str(old_date))
        self.assertEqual(r["data_status"], "数据不足或过期")
        self.assertIn("暂停", r["headline"])
        self.assertFalse(r["action_enabled"])

    def test_missing_nav_is_not_hallucinated(self):
        r = _payload(latest_nav=None, data_days=1)
        self.assertIn("暂停", r["headline"])
        self.assertEqual(r["highlights"][0]["value"], "暂无数据")

    def test_position_is_not_automatic_sell_order(self):
        r = build_daily_report(
            fund={"code": "000001", "name": "测试基金"},
            fund_profile={},
            metrics={"data_end": str(datetime.now(ZoneInfo("Asia/Shanghai")).date()),
                     "data_days": 120, "latest_nav": 1.20},
            risk={},
            forecast=None,
            prediction=None,
            backtest=None,
            final_decision={},
            position={"cost_nav": 1.0, "holding_amount": 1000,
                      "max_loss_percent": 10},
        )
        position_section = [s for s in r["sections"] if "持仓" in s["title"]][0]
        self.assertIn("+20.00%", position_section["summary"])
        self.assertFalse(r["action_enabled"])


if __name__ == "__main__":
    unittest.main()
