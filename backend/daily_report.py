"""FundLens 每日基金研究报告 v0.3。

报告只解释后端已有的历史净值与规则模型，不构造实时价格、双源核验、
赎回费用、预测胜率或个性化交易指令。所有行动都是可供核对的条件。
"""
from datetime import datetime, date
from math import isfinite
from zoneinfo import ZoneInfo


def _num(obj, key):
    try:
        value = (obj or {}).get(key)
        if value is None or isinstance(value, bool):
            return None
        value = float(value)
        return value if isfinite(value) else None
    except (ValueError, TypeError):
        return None


def _pct(value, digits=2):
    return "暂无数据" if value is None else f"{value:+.{digits}f}%"


def _plain_pct(value):
    return "暂无数据" if value is None else f"{value:.2f}%"


def _nav(value):
    return "暂无数据" if value is None else f"{value:.4f}"


def _fact(label, value, explanation=""):
    return {"label": label, "value": str(value), "explanation": explanation}


def _section(title, summary, facts=(), evidence=()):
    return {"title": title, "summary": summary, "facts": list(facts), "evidence": list(evidence)}


def _scenario(name, condition, reason, status="待观察"):
    return {"name": name, "condition": condition, "reason": reason, "status": status}


def build_daily_report(fund, fund_profile, metrics, risk, forecast,
                       prediction, backtest, final_decision, position=None):
    """生成可审计的解释性报告。输入不可变更；缺数据则明确标记未知。"""
    fund = fund or {}
    fund_profile = fund_profile or {}
    metrics = metrics or {}
    risk = risk or {}
    final_decision = final_decision or {}
    position = position or {}
    now = datetime.now(ZoneInfo("Asia/Shanghai"))
    nav_date = str(metrics.get("data_end") or "")
    nav_count = int(_num(metrics, "data_days") or 0)
    nav = _num(metrics, "latest_nav")
    risk_score = _num(risk, "risk_score")
    maxdd20 = _num(metrics, "max_drawdown_20trading")
    maxdd60 = _num(metrics, "max_drawdown_60trading")
    vol30 = _num(metrics, "volatility_30d")
    r5 = _num(metrics, "return_5trading")
    r20 = _num(metrics, "return_20trading")
    r60 = _num(metrics, "return_60trading")
    ma5 = _num(metrics, "ma_5")
    ma20 = _num(metrics, "ma_20")
    ma60 = _num(metrics, "ma_60")
    rsi = _num(metrics, "rsi_14")
    data_warnings = []
    try:
        age = (now.date() - date.fromisoformat(nav_date)).days
    except (ValueError, TypeError):
        age = None
        data_warnings.append("历史净值日期缺失或格式异常。")
    if age is not None and age < 0:
        data_warnings.append("最新净值日期晚于当前上海日期，请检查数据源。")
    if age is not None and age > 7:
        data_warnings.append(f"最新净值距今天已有 {age} 个自然日，可能滞后；节假日及 QDII 须人工核实。")
    if nav_count < 60:
        data_warnings.append(f"历史净值仅 {nav_count} 条，少于 60 条，趋势及回测依据不足。")
    if nav is None or nav <= 0:
        data_warnings.append("未获得有效的正数单位净值。")
    fund_type = str(fund_profile.get("fund_type") or fund.get("type") or "")
    if any(k in (fund_type + str(fund.get("name") or "")).upper() for k in ("QDII", "FOF")):
        data_warnings.append("该产品可能存在跨市场/组合估值延迟；不可套用普通 A 股基金的净值公布时点。")
    if fund_type and any(k in fund_type for k in ("债券", "货币")):
        data_warnings.append("债券/货币基金的净值特征与股票型基金不同，均线和 RSI 不能独立决定申赎。")

    valid = not (age is None or age < 0 or age > 7 or nav_count < 60 or nav is None or nav <= 0)
    quality = "单源待核验" if valid else "数据不足或过期"
    # 现有引擎未做基金公司公告与双源官方 NAV 交叉核对，绝不标注为“已核验”。
    data_warnings.append("历史净值来自第三方接口；没有与基金公司公告完成独立、双源正式净值核验。")
    data_warnings.append("场外基金盘中估值不是最终成交净值；今日是否可申赎、截止时间、确认日与费用均未自动核实。")

    # 按实际收益方向写结论，不把高收益等同下一日利好。
    if r5 is None or r20 is None:
        trend = "缺少足够的短中期收益数据，不能判断趋势是否一致。"
    elif r5 > 0 and r20 > 0:
        trend = "近5、20个净值交易日均上涨，短中期历史方向一致；不表示未来继续上涨。"
    elif r5 < 0 and r20 < 0:
        trend = "近5、20个净值交易日均下跌，短中期历史方向一致偏弱。"
    elif r5 >= 0 and r20 < 0:
        trend = "近5个净值交易日反弹，但20日仍为负，可能仅是短期修复。"
    elif r5 < 0 and r20 >= 0:
        trend = "20日累计仍正收益，但近5日走弱，需观察回撤是否扩大。"
    else:
        trend = "短中期收益方向不明显，需要等待新增的正式净值。"

    if nav is None or ma20 is None or ma20 <= 0:
        ma_note = "20期净值均线暂无有效数据。"
    else:
        gap = (nav / ma20 - 1.0) * 100
        ma_note = f"最新净值相对20期均线偏离 {gap:+.2f}%；该指标只描述历史相对位置。"
    rsi_note = ("RSI14 暂无数据。" if rsi is None else
                f"RSI14 为 {rsi:.1f}；大于70/小于30仅作为历史动量极端区间观察，不直接触发交易。")

    # 回测质量：只把经后端历史验证的质量字段作为可信程度线索。
    validation = (forecast or {}).get("validation") or {}
    calibrated = bool(validation.get("is_calibrated", False))
    quality_tag = str(validation.get("probability_quality") or "low")
    sample_size = validation.get("sample_size")
    if backtest and not validation:
        calibrated = bool(backtest.get("is_calibrated", False))
        quality_tag = str(backtest.get("probability_quality") or "low")
        sample_size = backtest.get("sample_size")
    evidence_note = (
        "后端报告通过一定历史样本的概率校准，但仍需独立样本外验证。"
        if calibrated and quality_tag != "low"
        else "当前未证明有稳定的样本外预测优势，不应把模型概率当作实际胜率。"
    )
    model_headline = str(final_decision.get("headline") or "模型结论不可用")
    action_label = str(final_decision.get("action_label") or "证据不足")
    explanation = str(final_decision.get("summary") or "请结合净值、基金风险和持仓约束判断。")

    cost = _num(position, "cost_nav")
    current_value = _num(position, "holding_amount")
    units = _num(position, "holding_units")
    max_loss = _num(position, "max_loss_percent")
    holding_horizon = str(position.get("holding_horizon") or "未提供")
    has_position = (cost is not None and cost > 0) or (current_value is not None and current_value > 0) or (units is not None and units > 0)
    if cost is not None and cost > 0 and nav is not None and nav > 0:
        hypothetical_gain = (nav / cost - 1) * 100
        position_note = f"基于输入成本净值 {cost:.4f} 和最近单位净值的简单变动为 {hypothetical_gain:+.2f}%；未计分红、手续费及实际批次成本。"
        if max_loss is not None and max_loss > 0 and hypothetical_gain <= -max_loss:
            position_note += f" 简单净值变动已达到用户设置的亏损观察阈值（-{max_loss:.1f}%）；应检查实际成本、分红及赎回费用，不自动触发赎回。"
    elif has_position:
        position_note = "已提供部分持仓信息，但缺少有效成本净值，无法判断实际持仓盈亏与应否赎回。"
    else:
        position_note = "尚未提供持仓成本、持有金额/份额及风险约束；仅能做通用条件分析，不能形成个人仓位或赎回金额建议。"

    # 交易矩阵只解释“什么条件会改变评估”，从不发出立即买卖指令。
    stronger = (f"后续正式单位净值连续站稳20期均线附近（当前均线 {_nav(ma20)}），"
                "同时5日与20日收益方向改善、回测验证不再偏弱；还需核实购买限制和费用。")
    weaker = (f"后续正式单位净值持续低于20期均线附近（当前均线 {_nav(ma20)}），"
              "短期收益转负或20/60日历史回撤继续扩大；对照个人亏损上限和赎回费用。")
    scenarios = [
        _scenario("关注申购", stronger,
                  "只是建立观察清单，未确认净值、费用和个人仓位前不形成即时买入指令。",
                  "仅观察" if valid else "暂停"),
        _scenario("继续持有", "投资期限和原投资逻辑未改变，风险未越过个人上限，最新正式净值无异常。",
                  "持有结论需实际持仓、期限与风险偏好；没有这些信息就不能判断。"),
        _scenario("评估减仓", weaker,
                  "先核对基金类型、仓位占比、持有天数、赎回费率和分批成本。",
                  "仅观察" if has_position and valid else "信息不足"),
        _scenario("评估赎回", "投资目标已变化、个人最大可接受损失持续被触及，或基金产品风险结构发生实质变化。",
                  "优先确认赎回交易日、开放状态、各批次持有天数与费用；未自动计算实际可得金额。",
                  "信息不足"),
        _scenario("暂不操作", "数据单源或过期、预测低置信、模型信号互相冲突，或无法核实申赎费用。",
                  "不把方向不确定强行转化成交易指令。",
                  "优先核验" if not valid or quality_tag == "low" else "候选"),
    ]

    sections = [
        _section("历史收益与区间表现", trend, [
            _fact("最近1个净值交易日", _pct(_num(metrics, "return_1trading")), "净值日收益，不是盘中估值"),
            _fact("最近5个净值交易日", _pct(r5)),
            _fact("最近20个净值交易日", _pct(r20)),
            _fact("最近60个净值交易日", _pct(r60)),
            _fact("近30自然日", _pct(_num(metrics, "return_30d_calendar")), "自然日口径，与交易日口径不同"),
            _fact("近90自然日", _pct(_num(metrics, "return_90d_calendar"))),
        ], ["单位净值的阶段涨跌可能受到基金分红影响，不等同基金披露的复权收益率。"]),
        _section("趋势位置与技术指标", ma_note, [
            _fact("单位净值", _nav(nav), "净值日期 " + (nav_date or "未知")),
            _fact("5期/20期/60期均线", f"{_nav(ma5)} / {_nav(ma20)} / {_nav(ma60)}"),
            _fact("RSI14", "暂无数据" if rsi is None else f"{rsi:.1f}"),
            _fact("30日区间位置", _plain_pct(_num(metrics, "position_in_30d_range")),
                  "原引擎使用的区间位置指标，需注意其单位和算法定义。"),
        ], [rsi_note, "场外基金技术指标基于滞后的正式净值，不是可即时交易的日内价格。"]),
        _section("波动、回撤与损失风险",
                 "下述是历史观察指标，不代表未来最大可能损失。", [
            _fact("20个交易日区间最大回撤", _pct(maxdd20)),
            _fact("60个交易日区间最大回撤", _pct(maxdd60)),
            _fact("近30自然日年化波动率", _plain_pct(vol30)),
            _fact("近90自然日年化波动率", _plain_pct(_num(metrics, "volatility_90d"))),
            _fact("内部风险评分", "暂无数据" if risk_score is None else f"{risk_score:.1f} / 100",
                  "项目规则评分；非基金官方风险等级或校准过的亏损概率"),
        ], list(risk.get("warnings") or [])[:3]),
        _section("预测与回测可信度", evidence_note, [
            _fact("回测/校准质量", "较低或未验证" if quality_tag == "low" else quality_tag),
            _fact("概率是否校准", "是（仍需样本外检验）" if calibrated else "否"),
            _fact("回测样本规模", str(sample_size) if sample_size is not None else "暂无"),
            _fact("原模型置信度", str(final_decision.get("confidence") or "未知")),
        ], ["不能用模型的“上涨概率”直接替代样本外命中率、收益率或交易期望值。"]),
        _section("个人持仓、交易费用与可执行性", position_note, [
            _fact("持仓状态", "已提供部分持仓" if has_position else "未提供"),
            _fact("成本净值", _nav(cost)),
            _fact("持有市值（如已输入）", "未提供" if current_value is None else f"{current_value:,.2f}"),
            _fact("可接受最大亏损", "未提供" if max_loss is None else _plain_pct(max_loss)),
            _fact("计划持有期限", holding_horizon),
            _fact("实际申购/赎回费", "未核实"),
        ], ["赎回费率通常与基金份额类别及持有期限有关，尤其需核对分批申购的每批持有天数。"]),
    ]
    checklist = [
        "在支付宝或天天基金复核六位代码、基金名称和 A/C 等份额类别。",
        "核对基金公司发布的最新正式净值和日期；目前尚未完成双源官方核验。",
        "确认今天是否为该基金开放申购/赎回日，平台提交截止时间和基金确认规则。",
        "核对申购费、赎回费及持有期阶梯费率；QDII 等产品关注延迟与暂停交易。",
        "如已持有，填写成本、持有份额、市值、计划持有期与最大可接受亏损后再评估。",
        "下一次正式净值公布后，比较5期/20期方向及回撤是否突破当前观察条件。",
    ]

    if not valid:
        headline = "数据质量不足：暂停生成当日操作倾向"
        executive = "历史净值缺失、样本不足或日期异常；展示仅用于排查数据问题，不得作为当日操作依据。"
    else:
        headline = model_headline
        executive = (f"{explanation}  历史趋势：{trend}  "
                     f"回测可信度：{evidence_note}  "
                     "目前缺少正式净值双源核验与完整个人交易信息。")

    return {
        "edition": "FundLens Daily Research v0.3",
        "generated_at": now.strftime("%Y-%m-%d %H:%M 中国标准时间"),
        "as_of_nav_date": nav_date or "未知",
        "data_status": quality,
        "action_enabled": False,
        "headline": headline,
        "model_action": action_label,
        "executive_summary": executive,
        "highlights": [
            _fact("最新单位净值", _nav(nav)),
            _fact("近5日收益", _pct(r5)),
            _fact("近20日收益", _pct(r20)),
            _fact("20日最大回撤", _pct(maxdd20)),
            _fact("风险评分", "未知" if risk_score is None else f"{risk_score:.1f}/100"),
        ],
        "sections": sections,
        "action_matrix": scenarios,
        "data_warnings": data_warnings,
        "next_checklist": checklist,
        "conclusion_note": "报告用于研究与决策准备，不是可靠的自动买卖建议；尤其不可用未核实的场外基金估值执行交易。",
    }
