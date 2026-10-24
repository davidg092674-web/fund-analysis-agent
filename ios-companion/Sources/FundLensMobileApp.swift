import SwiftUI
import PhotosUI
import Vision
import UIKit

@main
struct FundLensMobileApp: App {
    var body: some Scene {
        WindowGroup { HomeView() }
    }
}

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
    // 只判断数据是否足以呈现；不会把模型评分称为已验证的交易建议。
    static func issues(_ result: FundResponse) -> [String] {
        var reasons: [String] = []
        guard result.success else { return [result.error ?? "基金分析失败"] }
        guard let metrics = result.metrics else { return ["缺少净值指标"] }
        if (metrics.data_days ?? 0) < 60 { reasons.append("历史净值数据少于60条，无法充分评价趋势") }
        if (metrics.latest_nav ?? 0) <= 0 { reasons.append("缺少有效单位净值") }
        guard let raw = metrics.data_end,
              let last = dateFormatter.date(from: raw) else {
            reasons.append("缺少可核验的净值日期")
            return reasons
        }
        if last > Date().addingTimeInterval(86400) { reasons.append("净值日期异常：位于未来") }
        let days = Calendar.current.dateComponents([.day], from: last, to: Date()).day ?? 999
        if days > 7 { reasons.append("正式净值数据超过7个自然日，可能过期；长假请核对公告") }
        return reasons
    }
    private static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone(identifier: "Asia/Shanghai")
        formatter.locale = Locale(identifier: "en_US_POSIX")
        return formatter
    }()
}

struct HomeView: View {
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
    private var codeValid: Bool { code.count == 6 && code.allSatisfy({ $0.isNumber }) }

    var body: some View {
        NavigationStack {
            Form {
                Section("基金截图") {
                    PhotosPicker(selection: $selection, matching: .images, photoLibrary: .shared()) {
                        Label("从相册选择支付宝 / 天天基金截图", systemImage: "photo.on.rectangle")
                    }
                    if let preview {
                        Image(uiImage: preview).resizable().scaledToFit().frame(maxHeight: 220)
                    }
                    if !candidates.isEmpty {
                        Text("识别到的候选基金代码（请核对名称）").font(.footnote)
                        ForEach(candidates, id: \.self) { candidate in
                            Button(candidate) { code = candidate; confirmed = false; result = nil }
                        }
                    }
                    TextField("输入/修正六位基金代码", text: $code)
                        .keyboardType(.numberPad)
                        .onChange(of: code) { _, _ in confirmed = false; result = nil }
                    Toggle("我已核对截图中的基金代码及份额类别（A/C等）", isOn: $confirmed)
                    if !recognizedLines.isEmpty {
                        DisclosureGroup("查看本机 OCR 识别文本") {
                            ForEach(Array(recognizedLines.prefix(15)).indices, id: \.self) { i in
                                Text(recognizedLines[i]).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                Section("获取基金分析") {
                    Text("截图仅在本机识别基金代码，不发送图片和持仓金额。后端将联网查基金资料、净值与模型分析。")
                        .font(.footnote).foregroundStyle(.secondary)
                    Button {
                        Task { await analyze() }
                    } label: {
                        HStack {
                            if isLoading { ProgressView() }
                            Label("查询基金并生成分析", systemImage: "chart.xyaxis.line")
                        }
                    }
                    .disabled(isLoading || !codeValid || !confirmed)
                    if !errorText.isEmpty { Text(errorText).foregroundStyle(.red).font(.footnote) }
                }
                if let result { report(result) }
                Section("使用边界") {
                    Text("数据以基金份额净值发布日期为准；盘中估值并非成交净值。当前版本不提供实时行情双源核验、费率核验或自动买卖。")
                        .font(.footnote).foregroundStyle(.secondary)
                    Text("AI 输出仅是研究性情景判断；请在支付宝或天天基金核对交易规则、截止时点、申赎状态及费用。")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("基金研判")
            .toolbar { Button { showSettings = true } label: { Image(systemName: "gearshape") } }
            .sheet(isPresented: $showSettings) { settingsView }
            .onChange(of: selection) { _, item in
                guard let item else { return }
                Task { await loadScreenshot(item) }
            }
        }
    }

    @ViewBuilder private func report(_ data: FundResponse) -> some View {
        let problems = DataGate.issues(data)
        let name = data.fund?.name ?? "未核验基金名称"
        Section("基金身份核对") {
            Text("\(name)（\(data.code)）").font(.headline)
            if let kind = data.fund?.type { Text("产品类型：\(kind)") }
            Text("名称由后端返回，请再次比对截图；OCR 不确定时不要据此交易。")
                .font(.caption).foregroundStyle(.secondary)
        }
        Section("净值与数据核验") {
            LabeledContent("最新净值日期", value: data.metrics?.data_end ?? "未知")
            LabeledContent("单位净值", value: data.metrics?.latest_nav.map { String(format:"%.4f", $0) } ?? "未知")
            LabeledContent("历史样本数", value: String(data.metrics?.data_days ?? 0))
            LabeledContent("数据来源", value: data.fund?.source ?? "未知")
            Text("当前后端尚不能逐条验证不同来源净值的一致性；本页显示的是单一分析链结果。")
                .font(.caption).foregroundStyle(.orange)
        }
        Section("决策条件与解释") {
            if !problems.isEmpty {
                Label("数据待核验：暂不形成操作判断", systemImage: "exclamationmark.triangle")
                    .foregroundStyle(.orange)
                ForEach(problems, id: \.self) { Text("• \($0)") }
            } else {
                Text(data.final_decision?.headline ?? "暂无模型结论").font(.headline)
                Text("模型动作：\(data.final_decision?.action_label ?? "未知")")
                Text("模型置信度：\(data.final_decision?.confidence ?? "未知")")
                if data.final_decision?.confidence == "低" {
                    Text("回测信号不足或置信度低：不应将模型判断当成可执行信号。")
                        .foregroundStyle(.orange)
                }
                Text("风险分：\(data.risk?.risk_score.map { String(format: "%.1f", $0) } ?? "未知")（项目内部评分，非预测胜率）")
                if let detail = data.final_decision?.summary { Text(detail) }
                ForEach(data.final_decision?.why ?? [], id: \.self) { Text("依据：\($0)") }
                ForEach(data.final_decision?.watch ?? [], id: \.self) { Text("观察：\($0)") }
                ForEach(data.final_decision?.warning ?? [], id: \.self) { Text("风险：\($0)") }
            }
        }
    }

    private var settingsView: some View {
        NavigationStack {
            Form {
                Section("分析服务地址") {
                    TextField("http://电脑局域网IP:8000", text: $apiBase)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    Text("第一阶段需要 Windows 电脑运行 fund-analysis-agent 的 Python 后端，并与 iPhone 位于同一 Wi-Fi。不要把未加认证的 HTTP 服务开放到互联网。")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Section("隐私") {
                    Text("图片只做 iPhone 本机 OCR；API 只发送基金代码，不上传支付宝持仓截图。")
                }
            }
            .navigationTitle("连接设置")
            .toolbar { Button("完成") { showSettings = false } }
        }
    }

    @MainActor private func loadScreenshot(_ item: PhotosPickerItem) async {
        result = nil; errorText = ""; candidates = []; recognizedLines = []; confirmed = false
        do {
            guard let data = try await item.loadTransferable(type: Data.self) else { throw URLError(.cannotDecodeContentData) }
            preview = UIImage(data: data)
            let recognized = try ScreenshotOCR.recognizeFundCodes(in: data)
            candidates = recognized.codes
            recognizedLines = recognized.lines
            if candidates.count == 1 { code = candidates[0] }
            if candidates.isEmpty { errorText = "未自动找到六位基金代码，请手动输入并确认名称。" }
        } catch { errorText = "图片读取或文字识别失败：\(error.localizedDescription)" }
    }

    @MainActor private func analyze() async {
        errorText = ""; result = nil; isLoading = true
        defer { isLoading = false }
        guard codeValid && confirmed else { errorText = "请核对六位基金代码。"; return }
        guard let base = URL(string: apiBase), let host = base.host,
              !host.isEmpty, (base.scheme == "http" || base.scheme == "https"),
              let url = URL(string: "/api/analyze", relativeTo: base)?.absoluteURL else {
            errorText = "分析服务地址无效，示例：http://192.168.1.100:8000"; return
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 60
        do {
            request.httpBody = try JSONEncoder().encode(AnalyzeInput(code: code))
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                throw NSError(domain: "FundLens", code: 1, userInfo: [NSLocalizedDescriptionKey: "后端未返回成功，请确认电脑服务已启动。"]) }
            let decoded = try JSONDecoder().decode(FundResponse.self, from: data)
            if decoded.success { result = decoded }
            else { errorText = decoded.error ?? "分析失败" }
        } catch { errorText = "无法获得可信数据：\(error.localizedDescription)" }
    }
}
