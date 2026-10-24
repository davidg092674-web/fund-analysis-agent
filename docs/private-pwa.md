# FundLens 私人 PWA：已部署第一阶段

访问：https://fundlens-research.steadyseal5.chatgpt.site

这是仅站点所有者可访问的私人云端版本。已实现六位基金代码净值查询、自选与基础持仓、历史涨跌/回撤/均线、研究归档与 JSON 导出、手机布局和 PWA 主屏幕配置。浏览器离线缓存不保存私人持仓和报告。

原 Python/FastAPI、React 和 SwiftUI 代码继续保留。`cloud-pwa/` 是本次新增的完整 Sites 应用源码镜像，对应 Sites source commit `a7b95c721d47c82e59d430f10b329f802390e789`。本站采用 Workers JavaScript 计算基础历史报告，不能将其说成原 Python 完整模型已经迁云。

## 如何使用

1. 用 iPhone Safari 或电脑打开网址，以站点所有者的 ChatGPT 账户登录。
2. 输入六位代码查询，核对名称、份额类别、正式净值日期与来源。
3. 加入自选；可补充份额、平均成本与亏损观察阈值。
4. 在研究归档回看首次快照或导出 JSON。iPhone 可通过分享 → 添加到主屏幕安装。

## 验证与边界

原 `master@b0b0f0c` 的 [CI](https://github.com/davidg092674-web/fund-analysis-agent/actions/runs/40076586619) 已通过；本次应用的 TypeScript、8 项指标/解析测试、实际 API 路由的内存 SQLite 隔离与缓存/快照集成测试通过，桌面与 390px 手机宽度布局已通过浏览器检查。生产私密部署成功，并已用平台服务访问从真实净值源取得 110022 的历史数据。真机 PWA 安装、移动网络及跨设备登录尚未由用户验证。

净值是第三方单源，未完成独立双源核验。指标是未复权净值口径，不是扣费后的总收益。Python 预测/回测、截图识别、精确分批申赎费用仍属于后续迁移，不能据此宣称已完成完整云端投研平台。

每日更新已通过独立云端任务创建并启用，按香港时间 22:30 附近的弹性窗口运行（可能在后一小时内执行）。Sites 原生关联任务接口返回 invalid_project，故该任务未出现在站点 linked automations；后续管理需查找自动任务“更新 FundLens 研究报告”。已测试后台空清单刷新写入与状态读回，首次预定运行尚未发生。\n\n后台更新流程见 `cloud-pwa/docs/refresh-workflow.md`。任务启停以 Automations 中保存的状态为准；无自选时更新会合法地记录空结果。未开通新的付费托管订阅，长期额度与账单仍以实际平台为准。
