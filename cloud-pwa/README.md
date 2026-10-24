# FundLens 私人 PWA · 阶段 02

手机优先的私人基金研究工作台。使用 Sites 账户访问控制与 D1 持久化，自选、持仓与报告按站点用户 ID 隔离。此版本的历史研究计算在云端 JavaScript 运行，原仓库 FastAPI/Python 预测和回测尚未部署到此环境。


## 本次新增：盘前决策与复盘

- 可编辑的资产映射：SH/SZ 股票、指数、ETF、权重、现金、披露/假设日期、公开时间与来源；映射为用户确认输入，不声称已自动取得实时持仓。
- 东方财富与腾讯第三方行情适配：报价、分钟成交数据及未复权日 K；保留采集时间、行情源时间与缺失状态。
- 固定截止的 14:30 / 14:45 批次及按需快照；新闻 firstSeenAt、映射保存时间与基准净值首次可得时间均参与防止事后信息混入。
- 三个判断独立显示：当日计价情景、成交后风险条件、费用是否覆盖。收盘情景假设截止后价格不变，不输出虚构置信区间或未来胜率。
- 新闻事实、影响解释、反向证据和一手来源；可手动录入，也可由云端任务研究后写入。
- 手动确认的计划/费率与拟赎回批次，5/20个后续净值日后对照持有/现金基准；仅为声明的费用情景，不是实际成交或自动核验的精确费用。
- 晚间正式净值与同一日期快照的误差、方向和朴素基准对照。不同映射、版本与批次分组，样本不足不宣称有效。
- 后台14:30与晚间任务；14:45仅网页可见时自动刷新或手动触发。调度可能延迟，过时任务不补造盘前快照。

现有 Python 全量预测/回测仍未迁云；本次实现的是可追溯的盘前准备与前瞻性验证框架。债券、QDII、未知基金类型不套用人民币A股加权估值。

## 基础能力

- 六位基金代码查询；安全解析天天基金/东方财富历史单位净值（不执行上游 JavaScript）。
- 历史涨跌、均线、回撤与年化波动率；所有收益为未复权单位净值口径。
- 云端自选、份额、平均成本、亏损观察阈值与备注；当前最多 25 只自选。
- 每只基金每个净值日保留首次研究快照，不在刷新时覆盖；界面查看最近 100 份报告。
- JSON 数据导出、响应式界面、Web App Manifest、iOS 安全区及离线连接提示。
- 缓存只用于公共净值数据（6 小时）；浏览器服务工作线程不缓存私人页面、API、登录重定向和持仓。
- 受站点 owner-private 平台边界保护的后台刷新接口，可供关联云端任务调用。

## 已有项目与下一阶段

原项目：`davidg092674-web/fund-analysis-agent`，核查基准 `master@b0b0f0c806d2c08428e5651661cf6ba68b305d98`。原 FastAPI 的详细日报、风险/预测、回测仍保留在原项目。待迁移项：Python 完整引擎、独立正式净值双源核验、精确分批申赎费用、截图 OCR 与基金身份确认、个性化提醒。

此版本不输出自动买卖信号；单源、过期、日期冲突和不足样本均明确标记。分红或份额事件可能使未复权指标失真。

## 本地验证

```sh
npm run install:ci
node --experimental-strip-types --test tests/research.test.ts tests/intraday.test.ts tests/catalog.test.ts
node --experimental-vm-modules tests/api-integration.mjs
node node_modules/typescript/bin/tsc --noEmit
npm run build
```

构建与发布遵守 Sites 项目工作流。`.openai/hosting.json` 保存站点 ID 和 `DB` 绑定；D1 结构由 `drizzle/` 迁移创建。凭证、持仓、运行时记录不得提交到源代码。

`/preview` 和 `/preview-mobile` 仅在开发模式提供无账户、空数据 UI 测试，生产环境返回 404；不会模拟生产账户或允许未登录访问私人 API。API 集成测试使用独立内存 SQLite 与受控净值夹具，不写生产数据。

## 服务接口

普通 `/api/state`、`/api/funds`、`/api/analyze` 与 `/api/reports` 需要 Sites 注入的用户身份。服务接口 `/api/jobs/*` 依赖已确认的仅所有者可见站点访问边界；**不要将此站点改为 public 或扩大受众，除非先改造服务端任务授权**。

后台更新说明保存在 `docs/refresh-workflow.md`，也可通过 `/api/jobs/instructions` 获得当前版本。服务令牌仅从 Sites `get_site` 在执行时取得，不写源码、文件、日志、任务提示或浏览器代码。

## 手机使用

Safari 打开已部署网址 → 使用站点所有者的 ChatGPT 账户登录 → 分享 → 添加到主屏幕。输入代码查询后，在报告页加入自选并补充持仓。网络恢复后才能读取私人数据。PWA 配置与移动布局已经实现，实际 iPhone 安装和跨设备登录仍需用户真机验证。

### Horizon research list

The private Site research list holds explicitly imported candidate metadata and latest analyses separately from actual user holdings and immutable report/snapshot archives. It sorts candidates by suggested holding horizon, marks alternatives and waiting-for-opening items, and refreshes with the evening job. Money funds display verified paired income-per-10,000 and seven-day annualized disclosures; they do not enter the unit-NAV or preclose stock model. Research candidates and account data must not be committed to this public source mirror.
