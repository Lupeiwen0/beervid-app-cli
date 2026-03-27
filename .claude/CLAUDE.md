# CLAUDE.md

## 项目定位

这是一个基于 TypeScript + Node.js 20 的 ESM CLI 项目，发布后的命令名是 `beervid`，入口来自 `dist/cli.mjs`。

这个仓库不是纯 CLI 仓库，也同时作为 Claude Skill 分发：

- npm 产物包含 `dist/`、`README.md`、`skills/`
- `skills/beervid-app-cli/SKILL.md` 描述的是面向 Claude/Agent 的 BEERVID Open API 使用规范
- Skill 通过 `npx skills add` 分发安装，安装入口为 `skills/beervid-app-cli/`
- 因此任何命令能力、参数、环境变量、调用约定发生变化时，通常要同步检查 `README.md` 和 `skills/beervid-app-cli/SKILL.md`

## 目录结构

- `src/cli.ts`
  CLI 入口，只负责创建 `cac('beervid')` 并注册各个命令。
- `src/commands/*.ts`
  单个命令实现层。这里主要做参数解析、参数校验、日志输出、退出码控制、调用下层能力。
- `src/client/index.ts`
  API 客户端层。统一封装：
  - `getApiKey()` / `getBaseUrl()`
  - `openApiGet()` / `openApiPost()` / `openApiUpload()`
  - 文件输入解析：本地文件 / URL 下载
  - `printResult()` 标准 JSON 输出
- `src/utils/upload.ts`
  上传相关复用逻辑，负责上传凭证获取和普通/TTS 上传。
- `src/workflows/index.ts`
  编排型流程层，承载多步骤业务流程，不适合继续堆在命令文件里。
  当前包括：
  - TT 完整发布流程
  - TTS 商品池查询、商品选择、TTS 发布流程
- `src/types/index.ts`
  统一类型定义，包括 OpenAPI 响应、上传/发布/查询结构、工作流结果结构。
- `src/config.ts`
  本地配置持久化，当前写入 `~/.beervid/config.json`。
- `tests/commands/*.test.ts`
  命令层测试，基本按 `src/commands` 一一对应。
- `tests/helpers/cli.ts`
  CLI 测试辅助，mock `console` 和 `process.exit`。
- `skills/beervid-app-cli/references/api-reference.md`
  API 参考资料。
- `skills/beervid-app-cli/SKILL.md`
  Claude Skill 说明，属于这个仓库的重要交付物，不是附属文档。
- `skills/beervid-app-cli/docs/`
  落地建议文档（数据表、OAuth、轮询、缓存、幂等）。
- `skills/beervid-app-cli/example/`
  Standard / Express / Next.js 示例工程。

## 当前命令面

当前 CLI 已注册这些命令：

- `config`
- `get-oauth-url`
- `get-account-info`
- `upload`
- `publish`
- `poll-status`
- `query-video`
- `query-products`
- `publish-tt-flow`
- `publish-tts-flow`

其中：

- `config` 用于持久化 `APP_KEY` / `BASE_URL`
- `publish-tt-flow` 和 `publish-tts-flow` 是编排命令，优先复用 `src/workflows`
- `upload`、`publish`、`query-*`、`poll-status` 是基础能力命令

## 配置与运行时约定

- Node 版本要求：`>=20`
- 模块类型：`"type": "module"`
- CLI 框架：`cac`
- 测试框架：`vitest`
- 构建工具：`tsup`

配置优先级：

1. 环境变量
2. `~/.beervid/config.json`
3. 默认值

具体表现：

- `BEERVID_APP_KEY` 优先于本地配置中的 `appKey`
- `BEERVID_APP_BASE_URL` 优先于本地配置中的 `baseUrl`
- `baseUrl` 默认回退到 `https://open.beervid.ai`

这个项目依赖 Node 20 原生的 `fetch`、`File`、`FormData`。不要轻易引入降级兼容层，除非明确要支持更低 Node 版本。

## 代码分层约定

新增或修改功能时，优先遵守下面的边界：

- 命令层 `src/commands`
  负责 CLI 参数、用户提示、退出码，不要把复杂业务编排塞进这里。
- 客户端层 `src/client`
  负责 HTTP、鉴权、统一错误处理、输入文件解析。
- 工具层 `src/utils`
  放可复用但偏单职责的能力，例如上传。
- 工作流层 `src/workflows`
  放多步串联逻辑、重试逻辑、商品选择逻辑、结果汇总逻辑。
- 类型层 `src/types`
  统一收口 API 结构和工作流结果。

简单判断：

- 如果只是一个 API 直连命令，改 `commands` + `client`/`types`
- 如果涉及“上传 -> 发布 -> 轮询 -> 查询”这类串联流程，优先放进 `workflows`

## 现有实现风格

- 错误处理大量使用 `console.error(...)` + `process.exit(code)`
- 命令 `catch` 中会调用 `rethrowIfProcessExit()`，避免测试环境把 `process.exit` mock 后误吞
- 成功结果通常通过 `printResult()` 输出格式化 JSON
- 部分命令会先打印面向人的日志，再输出 JSON 结果

保持这个风格，除非明确要整体重构输出协议。

## 测试与变更要求

常用命令：

```bash
npm run build
npm run typecheck
npm test
```

修改建议：

- 改命令行为时，优先补 `tests/commands/*.test.ts`
- 改共享流程时，同时检查对应 flow 命令测试
- 改环境变量、配置项、命令参数或业务流程时，检查这 3 处是否要同步：
  - `README.md`
  - `SKILL.md`
  - `references/api-reference.md`（如果是参考资料层面的变化）

以上文档均在 `skills/beervid-app-cli/` 目录下。

## 对 Claude 的工作指引

在这个仓库里工作时，优先按下面方式理解任务：

- 这是一个“CLI + Skill”双用途仓库，不要只改代码不改技能说明
- `src/commands` 应保持薄，复杂逻辑优先下沉
- 如果新增命令，通常需要：
  - 在 `src/commands` 新增命令文件
  - 在 `src/cli.ts` 注册
  - 视情况补 `src/types` / `src/client` / `src/workflows`
  - 补测试
  - 更新 `README.md`
  - 如对 Claude Skill 行为有影响，更新 `skills/beervid-app-cli/SKILL.md`
- 如果修改 API 调用方式，先检查 `src/client/index.ts` 是否已经有合适抽象，避免在命令层重复写 fetch 逻辑

## 当前仓库的关键事实

- 这是 BEERVID 第三方应用 Open API 的 CLI，不是 BEERVID 内部 API 客户端
- 当前核心业务围绕：
  - OAuth 授权
  - 账号信息查询
  - 视频上传
  - 普通视频发布
  - 挂车视频发布
  - 发布状态轮询
  - 视频数据查询
  - TTS 商品查询与选择
- `SKILL.md` 已经承载了大量业务域知识，写代码前值得先对照 `skills/beervid-app-cli/SKILL.md` 确认接口语义和参数链路
