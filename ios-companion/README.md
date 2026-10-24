# 基金研判 iPhone MVP（独立客户端）

这不是 FundPilot-A 或 fund-analysis-agent 的完整移植版本，而是调用 fund-analysis-agent `/api/analyze` 的原生 iOS 客户端。

首版实现：PhotosPicker 从相册选图、Vision 本地 OCR、识别六位基金代码、用户确认、调用后端获取分析、展示净值日期/风险分/结论与不确定性。

**明确未实现**：实时数据双源交叉核验、支付宝/天天基金账户自动同步、自动下单、持仓收益归因、申赎费率/份额锁定校验、模型实际收益保证。

安全：本地图片不会发送；API 只发送基金代码。iOS Info.plist 仅为局域网原型允许 HTTP，未加身份鉴别；请勿对互联网公开后端。正式发行务必使用 HTTPS 与认证，删除 `NSAllowsArbitraryLoads`。
