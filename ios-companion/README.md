# FundLens v0.2.0 — iPhone 18 Pro 视觉与图标修正版

这是调用 `fund-analysis-agent` FastAPI `/api/analyze` 的原生 iOS 客户端，**不是完整的 fund-analysis-agent iOS 移植**。

## 本次修复

- 主屏幕显示名称改为 **FundLens**；保留原 Bundle ID `com.personal.fundlens.iphone18pro`，降低覆盖安装导致数据重置的风险（是否真正覆盖仍取决于签名工具/Apple ID）。
- 主界面不再使用原来的 `NavigationStack + Form` 首页架构，改为遵守系统安全区的 `ScrollView`、自适应宽度和卡片布局，状态栏/灵动岛区域不放置内容。
- 改进深色主题、留白、字体和触摸控件；支持系统动态字体。
- 新增 AppIcon.appiconset 资源，采用之前生成的放大镜+图表视觉方案。
- GitHub Actions 新增验证显示名称、Bundle ID 和 `Assets.car` 的步骤。
- 保留：PhotosPicker → Vision 本地 OCR → 确认六位代码 → `/api/analyze` → 研究报告。

## 兼容与限制

- XcodeGen 工程：`ios-companion/project.yml`；最低部署版本 iOS 17，iPhone-only。
- 使用 `ios-companion/Info.plist` 设置 `CFBundleDisplayName=FundLens`。
- 图标来自 `ios-companion/Assets.xcassets/AppIcon.appiconset`。
- 尚未在本执行环境使用 Xcode/macOS runner 或 iPhone 18 Pro 真机进行构建验证。
- 仅作研究工具：截图不离开 iPhone；只发送确认的基金代码；后端尚无完整双源 NAV 校验。
- 在可信局域网使用 HTTP 开发后端，不要把未授权的后端暴露到公网。
- 适配灵动岛指的是遵守**顶部安全区**；没有添加 Live Activities 或灵动岛实时活动功能。
