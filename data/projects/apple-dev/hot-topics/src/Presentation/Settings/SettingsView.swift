import SwiftUI

// MARK: - SettingsView

/// 设置视图
struct SettingsView: View {

    // MARK: - State

    @State private var apiKey: String = ""
    @AppStorage("hotTopicsAPIKey") private var storedKey: String = ""

    // MARK: - Body

    var body: some View {
        NavigationStack {
            Form {
                Section("API 设置") {
                    SecureField("tophubdata.com API Key", text: $apiKey)
                        .onAppear { apiKey = storedKey }
                    Button("保存") {
                        storedKey = apiKey
                    }
                    .disabled(apiKey.isEmpty)
                }

                Section("缓存") {
                    Button("清除缓存", role: .destructive) {
                        // TODO: 清除 SwiftData 缓存
                    }
                }

                Section("关于") {
                    LabeledContent("版本", value: "1.0.0")
                    LabeledContent("数据来源", value: "tophubdata.com")
                }
            }
            .navigationTitle("设置")
        }
    }
}
