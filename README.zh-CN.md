# ProofScope

ProofScope 是面向 AI Agent 和开发团队的开源仓库接入决策服务。它读取公开 GitHub 证据，给出可检查的接入结论，而不是黑盒评分。

## 能力

- 对公开仓库检查活跃度、文档、安全、维护与发布节奏。
- 返回明确的继续接入、需复核或阻止结论，并给出可点击证据。
- 对比两个到四个仓库，使用同一透明模型排序。
- 为每次决策提供绑定分支和 commit 的 Integration Receipt。
- 可通过 MCP 调用，适合 Agent 在选择依赖、插件或代码组件前使用。

## 使用

- 网站：https://proofscope.a13553776411.workers.dev
- 分析接口：`GET /api/analyze?repo=owner/repository`
- 对比接口：`GET /api/compare?repo=owner/repository&repo=owner/repository`
- MCP：`POST /mcp`

服务只使用公开 GitHub 数据，不读取私有仓库、钱包或密钥。
