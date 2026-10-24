import SwiftUI
import PhotosUI
import Vision
import UIKit

@main
struct FundLensMobileApp: App {
    var body: some Scene {
        WindowGroup {
            FundLensHomeView()
                .preferredColorScheme(.dark)
        }
    }
}

// MARK: - Models (unchanged wire protocol: compatible with fund-analysis-agent)
struct FundInfo: Decodable {
    let code: String?
    let name: String?
    let type: String?
    let source: String?
}
struct FundMetrics: Decodable {
    let data_end: String?
    let data_days: Int?
    let latest_nav: Double?
    let return_5trading: Double?
    let max_drawdown_30d_calendar: Double?
}
struct FundRisk: Decodable {
    let risk_score: Double?
    let risk_level: String?
}
struct FinalConclusion: Decodable {
    let headline: String?
    let summary: String?
    let direction_label: String?
    let action_label: String?
    let confidence: String?
    let why: [String]?
    let watch: [String]?
    let warning: [String]?
}
struct FundResponse: Decodable {
    let success: Bool
    let code: String
    let fund: FundInfo?
    let metrics: FundMetrics?
    let risk: FundRisk?
    let final_decision: FinalConclusion?
    let error: String?
}
struct AnalyzeInput: Encodable { let code: String }

// MARK: - Vision OCR (all screenshot processing stays on the phone)
enum ScreenshotOCR {
    static func recognizeFundCodes(in data: Data) throws -> (codes: [String], lines: [String]) {
        guard let image = UIImage(data: data) else { return ([], []) }
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = false
        request.recognitionLanguages = ["zh-Hans", "en-US"]
        let handler = VNImageRequestHandler(cgImage: preparedCGImage(image), options: [:])
        try handler.perform([request])
        let lines = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
        let pattern = try NSRegularExpression(pattern: "(?<![0-9])[0-9]{6}(?![0-9])")
        var found: [String] = []
        for line in lines {
            let ns = line as NSString
            for match in pattern.matches(in: line, range: NSRange(location: 0, length: ns.length)) {
                let candidate = ns.substring(with: match.range)
                if !found.contains(candidate) { found.append(candidate) }
            }
        }
        return (found, lines)
    }
    private static func preparedCGImage(_ image: UIImage) -> CGImage {
        if let cg = image.cgImage { return cg }
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let renderer = UIGraphicsImageRenderer(size: image.size, format: format)
        let rendered = renderer.image { _ in image.draw(in: CGRect(origin: .zero, size: image.size)) }
        return rendered.cgImage!
    }
}

enum DataGate {
    // Presentation guard only; NOT an independent verification of published NAV.
    static func issues(_ result: FundResponse) -> [String] {
        var reasons: [String] = []
        guard result.success else { return [result.error ?? "基金分析失败"] }
        guard let metrics = result.metrics else { return ["缺少净值指标"] }
        if (metrics.data_days ?? 0) < 60 { reasons.append("历史净值少于 60 条，趋势判断依据不足") }
        if (metrics.latest_nav ?? 0) <= 0 { reasons.append("缺少有效单位净值") }
        guard let raw = metrics.data_end,
              let last = dateFormatter.date(from: raw) else {
            reasons.append("缺少可核对的净值日期")
            return reasons
        }
        if last > Date().addingTimeInterval(86400) { reasons.append("净值日期异常：晚于今天") }
        let days = Calendar.current.dateComponents([.day], from: last, to: Date()).day ?? 999
        if days > 7 { reasons.append("净值数据超过 7 个自然日，可能过期（节假日请另行核对）") }
        return reasons
    }
    private static let dateFormatter: DateFormatter = {
        let df = DateFormatter()
        df.dateFormat = "yyyy-MM-dd"
        df.timeZone = TimeZone(identifier: "Asia/Shanghai")
        df.locale = Locale(identifier: "en_US_POSIX")
        return df
    }()
}

// MARK: - Appearance
private enum LensStyle {
    static let background = Color(red: 0.025, green: 0.045, blue: 0.095)
    static let blue = Color(red: 0.11, green: 0.46, blue: 0.99)
    static let teal = Color(red: 0.22, green: 0.84, blue: 0.79)
    static let muted = Color(red: 0.67, green: 0.74, blue: 0.86)
    static let border = Color.white.opacity(0.10)
    static let panel = LinearGradient(
        colors: [Color(red: 0.10, green: 0.15, blue: 0.25), Color(red: 0.055, green: 0.095, blue: 0.17)],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )
}

private struct LensCard<Content: View>: View {
    let content: Content
    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }
    var body: some View {
        content
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(LensStyle.panel, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .strokeBorder(LensStyle.border, lineWidth: 1)
            }
    }
}

private struct SmallInfoRow: View {
    let symbol: String
    let color: Color
    let title: String
    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: symbol)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(color)
                .frame(width: 20)
            Text(title)
                .font(.subheadline)
                .foregroundStyle(LensStyle.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

// MARK: - Main screen (scroll content respects the Dynamic Island safe area)
struct FundLensHomeView: View {
    @AppStorage("apiBase") private var apiBase = "http://192.168.1.100:8000"
    @State private var selection: PhotosPickerItem?
    @State private var preview: UIImage?
    @State private var code = ""
    @State private var candidates: [String] = []
    @State private var recognizedLines: [String] = []
    @State private var result: FundResponse?
    @State private var errorText = ""
    @State private var isLoading = false
    @State private var showSettings = false
    @State private var confirmed = false

    private var codeValid: Bool { code.count == 6 && code.allSatisfy(\.isNumber) }

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                LensStyle.background.ignoresSafeArea()
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 18) {
                        header
                        screenshotCard
                        verificationCard
                        analysisCard
                        if let result { reportCards(result) }
                        usageCard
                    }
                    .padding(.horizontal, 18)
                    .padding(.top, 14)
                    .padding(.bottom, max(32, geometry.safeAreaInsets.bottom + 18))
                    .frame(maxWidth: 560)
                    .frame(maxWidth: .infinity)
                }
                .background(alignment: .top) { headerGlow }
            }
        }
        .sheet(isPresented: $showSettings) { settingsView }
        .onChange(of: selection) { _, item in
            guard let item else { return }
            Task { await loadScreenshot(item) }
        }
    }

    private var headerGlow: some View {
        Ellipse()
            .fill(LensStyle.blue.opacity(0.19))
            .frame(width: 360, height: 220)
            .blur(radius: 65)
            .offset(x: 130, y: -70)
            .allowsHitTesting(false)
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 14) {
            VStack(alignment: .leading, spacing: 5) {
                Text("FundLens")
                    .font(.system(.largeTitle, design: .rounded, weight: .bold))
                    .foregroundStyle(LinearGradient(colors: [.white, Color(red: 0.50, green: 0.77, blue: 1.0)], startPoint: .leading, endPoint: .trailing))
                    .minimumScaleFactor(0.82)
                    .lineLimit(1)
                Text("让基金研究更简单")
                    .font(.subheadline)
                    .foregroundStyle(LensStyle.muted)
            }
            Spacer(minLength: 4)
            Button { showSettings = true } label: {
                Image(systemName: "gearshape")
                    .font(.system(size: 21, weight: .medium))
                    .foregroundStyle(.white)
                    .frame(width: 48, height: 48)
                    .background(.white.opacity(0.09), in: Circle())
                    .overlay(Circle().strokeBorder(LensStyle.border))
            }
            .accessibilityLabel("连接设置")
        }
        .padding(.vertical, 14)
    }

    private var screenshotCard: some View {
        LensCard {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 10) {
                    Image(systemName: "viewfinder")
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(LensStyle.teal)
                        .frame(width: 32, height: 32)
                    Text("识别基金")
                        .font(.title3.weight(.semibold))
                    Spacer()
                    Text("本机识别")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(LensStyle.teal)
                }
                Text("导入支付宝或天天基金截图，识别六位基金代码。")
                    .font(.subheadline)
                    .foregroundStyle(LensStyle.muted)
                    .fixedSize(horizontal: false, vertical: true)
                PhotosPicker(selection: $selection, matching: .images, photoLibrary: .shared()) {
                    HStack(spacing: 10) {
                        Image(systemName: "photo.on.rectangle.angled")
                            .font(.headline)
                        Text(preview == nil ? "选择基金截图" : "更换基金截图")
                            .font(.headline)
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.right")
                            .font(.footnote.weight(.semibold))
                    }
                    .padding(.horizontal, 16)
                    .frame(minHeight: 52)
                    .foregroundStyle(.white)
                    .background(LensStyle.blue.opacity(0.22), in: RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(LensStyle.blue.opacity(0.50)))
                }
                .buttonStyle(.plain)
                if let preview {
                    Image(uiImage: preview)
                        .resizable()
                        .scaledToFit()
                        .frame(maxWidth: .infinity, maxHeight: 210)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .accessibilityLabel("所选基金截图预览")
                }
                if !candidates.isEmpty {
                    Text("识别到的候选代码（需人工核对）")
                        .font(.caption)
                        .foregroundStyle(LensStyle.muted)
                    HStack(spacing: 8) {
                        ForEach(candidates.prefix(4), id: \.self) { candidate in
                            Button(candidate) {
                                code = candidate
                                confirmed = false
                                result = nil
                            }
                            .font(.subheadline.monospacedDigit().weight(.semibold))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 9)
                            .foregroundStyle(code == candidate ? .white : LensStyle.muted)
                            .background(code == candidate ? LensStyle.blue : .white.opacity(0.08), in: Capsule())
                        }
                    }
                }
                VStack(alignment: .leading, spacing: 8) {
                    Text("基金代码")
                        .font(.subheadline.weight(.medium))
                    TextField("请输入六位基金代码", text: $code)
                        .keyboardType(.numberPad)
                        .font(.system(.title3, design: .rounded, weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(.white)
                        .padding(.horizontal, 14)
                        .frame(minHeight: 52)
                        .background(.black.opacity(0.24), in: RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(LensStyle.border))
                        .onChange(of: code) { _, newValue in
                            let filtered = String(newValue.filter(\.isNumber).prefix(6))
                            if filtered != newValue { code = filtered }
                            confirmed = false
                            result = nil
                        }
                }
                if !recognizedLines.isEmpty {
                    DisclosureGroup("查看本机 OCR 识别文字") {
                        VStack(alignment: .leading, spacing: 6) {
                            ForEach(Array(recognizedLines.prefix(15)).indices, id: \.self) { i in
                                Text(recognizedLines[i])
                                    .font(.caption)
                                    .foregroundStyle(LensStyle.muted)
                            }
                        }
                        .padding(.top, 10)
                    }
                    .font(.subheadline)
                    .tint(LensStyle.teal)
                }
            }
        }
    }

    private var verificationCard: some View {
        LensCard {
            Toggle(isOn: $confirmed) {
                VStack(alignment: .leading, spacing: 5) {
                    Text("核对基金身份")
                        .font(.headline)
                    Text("我已确认基金代码与 A/C 等份额类别一致。")
                        .font(.subheadline)
                        .foregroundStyle(LensStyle.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.trailing, 8)
            }
            .tint(LensStyle.blue)
        }
    }

    private var analysisCard: some View {
        LensCard {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Text("获取基金分析")
                        .font(.title3.weight(.semibold))
                    Spacer(minLength: 0)
                    Image(systemName: "chart.bar.xaxis")
                        .foregroundStyle(LensStyle.teal)
                }
                Text("后端查询基金资料、历史净值并生成风险与情景分析。")
                    .font(.subheadline)
                    .foregroundStyle(LensStyle.muted)
                    .fixedSize(horizontal: false, vertical: true)
                Button {
                    Task { await analyze() }
                } label: {
                    HStack(spacing: 12) {
                        if isLoading { ProgressView().tint(.white) }
                        else { Image(systemName: "chart.xyaxis.line") }
                        Text(isLoading ? "正在获取分析…" : "查询基金并生成分析")
                            .font(.headline)
                            .lineLimit(2)
                            .minimumScaleFactor(0.85)
                        Spacer(minLength: 0)
                        if !isLoading { Image(systemName: "arrow.right") }
                    }
                    .foregroundStyle(.white)
                    .padding(.horizontal, 16)
                    .frame(minHeight: 60)
                    .background(
                        LinearGradient(colors: [LensStyle.blue, Color(red: 0.07, green: 0.27, blue: 0.68)], startPoint: .topLeading, endPoint: .bottomTrailing),
                        in: RoundedRectangle(cornerRadius: 16)
                    )
                    .opacity(isLoading || !codeValid || !confirmed ? 0.52 : 1)
                }
                .buttonStyle(.plain)
                .disabled(isLoading || !codeValid || !confirmed)
                if !errorText.isEmpty {
                    Label(errorText, systemImage: "exclamationmark.triangle.fill")
                        .font(.subheadline)
                        .foregroundStyle(Color(red: 1, green: 0.68, blue: 0.38))
                        .fixedSize(horizontal: false, vertical: true)
                }
                HStack(spacing: 12) {
                    Image(systemName: "lock.shield")
                        .foregroundStyle(LensStyle.teal)
                    Text("截图只在手机本地 OCR；仅发送已确认的基金代码。")
                        .font(.caption)
                        .foregroundStyle(LensStyle.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    private func reportCards(_ data: FundResponse) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            LensCard {
                VStack(alignment: .leading, spacing: 10) {
                    Text("基金身份核对")
                        .font(.headline)
                    Text(data.fund?.name ?? "未核验基金名称")
                        .font(.title3.weight(.semibold))
                    Text("基金代码：\(data.code) · 类别：\(data.fund?.type ?? "未知")")
                        .font(.subheadline)
                        .foregroundStyle(LensStyle.muted)
                    SmallInfoRow(symbol: "checkmark.shield", color: LensStyle.teal,
                                 title: "名称来自查询服务，请再次比对截图，避免 A/C 份额识别错误。")
                }
            }
            LensCard {
                VStack(alignment: .leading, spacing: 11) {
                    Text("净值与数据说明")
                        .font(.headline)
                    valueRow("最新净值日期", data.metrics?.data_end ?? "未知")
                    valueRow("单位净值", data.metrics?.latest_nav.map { String(format: "%.4f", $0) } ?? "未知")
                    valueRow("历史数据数量", "\(data.metrics?.data_days ?? 0) 条")
                    valueRow("当前名称来源", data.fund?.source ?? "未知")
                    SmallInfoRow(symbol: "info.circle", color: .orange,
                                 title: "尚未执行双源正式净值交叉核验；不能视为已核验的实时交易数据。")
                }
            }
            LensCard {
                VStack(alignment: .leading, spacing: 12) {
                    Text("研究结论与观察条件")
                        .font(.headline)
                    let problems = DataGate.issues(data)
                    if !problems.isEmpty {
                        Label("数据待核验，暂不形成操作判断", systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.orange)
                            .font(.headline)
                        ForEach(problems, id: \.self) { problem in
                            SmallInfoRow(symbol: "exclamationmark.circle", color: .orange, title: problem)
                        }
                    } else {
                        Text(data.final_decision?.headline ?? "暂无模型结论")
                            .font(.title3.weight(.semibold))
                        valueRow("模型动作", data.final_decision?.action_label ?? "未知")
                        valueRow("模型置信度", data.final_decision?.confidence ?? "未知")
                        valueRow("内部风险评分", data.risk?.risk_score.map { String(format: "%.1f / 100", $0) } ?? "未知")
                        if let summary = data.final_decision?.summary {
                            Text(summary)
                                .font(.subheadline)
                                .foregroundStyle(LensStyle.muted)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        if data.final_decision?.confidence == "低" {
                            SmallInfoRow(symbol: "exclamationmark.triangle", color: .orange,
                                         title: "模型置信度低，不应当作可执行交易信号。")
                        }
                        ForEach(data.final_decision?.why ?? [], id: \.self) { item in
                            SmallInfoRow(symbol: "checkmark.circle", color: LensStyle.teal, title: "依据：\(item)")
                        }
                        ForEach(data.final_decision?.watch ?? [], id: \.self) { item in
                            SmallInfoRow(symbol: "eye", color: LensStyle.blue, title: "观察：\(item)")
                        }
                        ForEach(data.final_decision?.warning ?? [], id: \.self) { item in
                            SmallInfoRow(symbol: "exclamationmark.triangle", color: .orange, title: "风险：\(item)")
                        }
                    }
                }
            }
        }
    }

    private func valueRow(_ label: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(LensStyle.muted)
            Spacer(minLength: 6)
            Text(value)
                .font(.subheadline.weight(.semibold))
                .multilineTextAlignment(.trailing)
        }
    }

    private var usageCard: some View {
        LensCard {
            VStack(alignment: .leading, spacing: 13) {
                Label("使用边界", systemImage: "exclamationmark.shield")
                    .font(.headline)
                    .foregroundStyle(Color(red: 1, green: 0.72, blue: 0.40))
                Text("场外基金盘中估值并非成交净值；以正式披露的基金份额净值及基金合同为准。")
                    .font(.subheadline)
                    .foregroundStyle(LensStyle.muted)
                Rectangle().fill(LensStyle.border).frame(height: 1)
                Text("当前版本不支持实时行情双源核验、费用校验或自动买卖。请到支付宝或天天基金核实申赎规则、时间与费率。")
                    .font(.subheadline)
                    .foregroundStyle(LensStyle.muted)
            }
            .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var settingsView: some View {
        NavigationStack {
            Form {
                Section("分析服务地址") {
                    TextField("http://电脑局域网IP:8000", text: $apiBase)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                    Text("第一阶段需在 Windows 电脑运行 fund-analysis-agent 的 Python 后端，并让 iPhone 位于同一可信局域网。")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                Section("隐私及安全") {
                    Text("图片只做 iPhone 本机 OCR；分析 API 只发送基金代码。请勿向公网开放未授权的 HTTP 分析服务。")
                        .font(.footnote)
                }
                Section("应用") { Text("FundLens · v0.2.0") }
            }
            .navigationTitle("连接设置")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("完成") { showSettings = false }
                }
            }
        }
    }

    @MainActor private func loadScreenshot(_ item: PhotosPickerItem) async {
        result = nil
        errorText = ""
        candidates = []
        recognizedLines = []
        confirmed = false
        do {
            guard let data = try await item.loadTransferable(type: Data.self) else {
                throw URLError(.cannotDecodeContentData)
            }
            preview = UIImage(data: data)
            let recognized = try ScreenshotOCR.recognizeFundCodes(in: data)
            candidates = recognized.codes
            recognizedLines = recognized.lines
            if candidates.count == 1 { code = candidates[0] }
            if candidates.isEmpty { errorText = "未识别出六位基金代码，请手动输入。" }
        } catch { errorText = "图片读取或文字识别失败：\(error.localizedDescription)" }
    }

    @MainActor private func analyze() async {
        errorText = ""
        result = nil
        isLoading = true
        defer { isLoading = false }
        guard codeValid && confirmed else { errorText = "请先确认正确的六位基金代码和份额类别。"; return }
        guard let base = URL(string: apiBase), let host = base.host,
              !host.isEmpty, (base.scheme == "http" || base.scheme == "https"),
              let url = URL(string: "/api/analyze", relativeTo: base)?.absoluteURL else {
            errorText = "分析服务地址无效，例如：http://192.168.1.100:8000"; return
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 60
        do {
            request.httpBody = try JSONEncoder().encode(AnalyzeInput(code: code))
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                throw NSError(domain: "FundLens", code: 1,
                              userInfo: [NSLocalizedDescriptionKey: "后端未返回成功，请检查 Windows 分析服务和连接设置。"])
            }
            let decoded = try JSONDecoder().decode(FundResponse.self, from: data)
            if decoded.success { result = decoded }
            else { errorText = decoded.error ?? "分析失败" }
        } catch { errorText = "请求失败：\(error.localizedDescription)" }
    }
}
