Plan to implement                                                                                                       │
│                                                                                                                         │
│ 改造方案：TypeScript + tsup 完整重构 → npm 发布                                                                         │
│                                                                                                                         │
│ Context                                                                                                                 │
│                                                                                                                         │
│ 当前项目是一个纯 Claude Code Skill（通过 git clone 安装）。目标是完整重构为 TypeScript + tsup 打包架构（参考            │
│ halo-dev/cli 模式），发布为 beervid-app-cli npm 包，同时保留 SKILL.md 的 Claude Code Skill 能力。                       │
│                                                                                                                         │
│ ---                                                                                                                     │
│ 目标架构                                                                                                                │
│                                                                                                                         │
│ beervid-app-cli/                                                                                                        │
│ ├── src/                                                                                                                │
│ │   ├── cli.ts                   # Main 入口（cac 注册）                                                                │
│ │   ├── commands/                                                                                                       │
│ │   │   ├── oauth.ts             # get-oauth-url                                                                        │
│ │   │   ├── account.ts           # get-account-info                                                                     │
│ │   │   ├── upload.ts            # upload（最复杂）                                                                     │
│ │   │   ├── publish.ts           # publish                                                                              │
│ │   │   ├── poll-status.ts       # poll-status                                                                          │
│ │   │   ├── query-video.ts       # query-video                                                                          │
│ │   │   └── query-products.ts    # query-products（第二复杂）                                                           │
│ │   ├── client/                                                                                                         │
│ │   │   └── index.ts             # 类型化 API 客户端                                                                    │
│ │   └── types/                                                                                                          │
│ │       └── index.ts             # 共享 TypeScript 类型                                                                 │
│ ├── dist/                                                                                                               │
│ │   └── cli.mjs                  # tsup 打包输出（单文件，含 shebang）                                                  │
│ ├── scripts/                     # 保留原 .mjs 脚本（legacy，不发布到 npm）                                             │
│ ├── tsconfig.json                # NEW                                                                                  │
│ ├── tsup.config.ts               # NEW                                                                                  │
│ ├── package.json                 # NEW                                                                                  │
│ ├── SKILL.md                     # UPDATE: 更新 CLI 示例                                                                │
│ └── README.md                    # UPDATE: 添加 npm 安装说明                                                            │
│                                                                                                                         │
│ ---                                                                                                                     │
│ package.json                                                                                                            │
│                                                                                                                         │
│ {                                                                                                                       │
│   "name": "beervid-app-cli",                                                                                            │
│   "version": "1.0.0",                                                                                                   │
│   "description": "BEERVID Open API CLI — TikTok video publish, account auth, and data query",                           │
│   "type": "module",                                                                                                     │
│   "engines": { "node": ">=18.0.0" },                                                                                    │
│   "bin": { "beervid": "./dist/cli.mjs" },                                                                               │
│   "files": ["dist/", "SKILL.md", "README.md"],                                                                          │
│   "scripts": {                                                                                                          │
│     "build": "tsup",                                                                                                    │
│     "dev": "tsx src/cli.ts",                                                                                            │
│     "typecheck": "tsc --noEmit",                                                                                        │
│     "prepublishOnly": "npm run build"                                                                                   │
│   },                                                                                                                    │
│   "dependencies": { "cac": "^6.7.14" },                                                                                 │
│   "devDependencies": {                                                                                                  │
│     "typescript": "^5.0.0",                                                                                             │
│     "tsup": "^8.0.0",                                                                                                   │
│     "tsx": "^4.0.0"                                                                                                     │
│   },                                                                                                                    │
│   "keywords": ["beervid", "tiktok", "cli", "video", "open-api"],                                                        │
│   "license": "MIT"                                                                                                      │
│ }                                                                                                                       │
│                                                                                                                         │
│ ▎ scripts/ 目录不加入 files，保留在 git repo 但不发布到 npm。                                                           │
│                                                                                                                         │
│ ---                                                                                                                     │
│ 核心文件内容                                                                                                            │
│                                                                                                                         │
│ tsconfig.json                                                                                                           │
│                                                                                                                         │
│ {                                                                                                                       │
│   "compilerOptions": {                                                                                                  │
│     "target": "ES2022",                                                                                                 │
│     "lib": ["ES2022"],                                                                                                  │
│     "module": "ESNext",                                                                                                 │
│     "moduleResolution": "bundler",                                                                                      │
│     "strict": true,                                                                                                     │
│     "noUnusedLocals": true,                                                                                             │
│     "noUnusedParameters": true,                                                                                         │
│     "verbatimModuleSyntax": true,                                                                                       │
│     "skipLibCheck": true,                                                                                               │
│     "outDir": "dist"                                                                                                    │
│   },                                                                                                                    │
│   "include": ["src"]                                                                                                    │
│ }                                                                                                                       │
│                                                                                                                         │
│ tsup.config.ts                                                                                                          │
│                                                                                                                         │
│ import { defineConfig } from 'tsup'                                                                                     │
│ export default defineConfig({                                                                                           │
│   entry: ['src/cli.ts'],                                                                                                │
│   format: ['esm'],                                                                                                      │
│   outDir: 'dist',                                                                                                       │
│   outExtension: () => ({ js: '.mjs' }),                                                                                 │
│   shims: true,                                                                                                          │
│   splitting: false,                                                                                                     │
│   clean: true,                                                                                                          │
│   banner: { js: '#!/usr/bin/env node' },  // 注入 shebang                                                               │
│ })                                                                                                                      │
│                                                                                                                         │
│ ▎ src/cli.ts 顶部不加 #!/usr/bin/env node（避免 banner 后重复）。                                                       │
│                                                                                                                         │
│ src/cli.ts（入口，参考 halo-dev/cli src/cli.ts 模式）                                                                   │
│                                                                                                                         │
│ import cac from 'cac'                                                                                                   │
│ import { register as registerOauth }        from './commands/oauth.js'                                                  │
│ import { register as registerAccount }      from './commands/account.js'                                                │
│ import { register as registerUpload }       from './commands/upload.js'                                                 │
│ import { register as registerPublish }      from './commands/publish.js'                                                │
│ import { register as registerPollStatus }   from './commands/poll-status.js'                                            │
│ import { register as registerQueryVideo }   from './commands/query-video.js'                                            │
│ import { register as registerQueryProducts } from './commands/query-products.js'                                        │
│                                                                                                                         │
│ const cli = cac('beervid')                                                                                              │
│                                                                                                                         │
│ registerOauth(cli)                                                                                                      │
│ registerAccount(cli)                                                                                                    │
│ registerUpload(cli)                                                                                                     │
│ registerPublish(cli)                                                                                                    │
│ registerPollStatus(cli)                                                                                                 │
│ registerQueryVideo(cli)                                                                                                 │
│ registerQueryProducts(cli)                                                                                              │
│                                                                                                                         │
│ cli.help()                                                                                                              │
│ cli.version('1.0.0')                                                                                                    │
│                                                                                                                         │
│ if (process.argv.slice(2).length === 0) {                                                                               │
│   cli.outputHelp(); process.exit(0)                                                                                     │
│ }                                                                                                                       │
│ cli.parse()                                                                                                             │
│                                                                                                                         │
│ src/types/index.ts（纯类型，零运行时代码）                                                                              │
│                                                                                                                         │
│ 关键类型：                                                                                                              │
│ - OpenApiResponse<T> — 统一响应体                                                                                       │
│ - AccountType = 'TT' | 'TTS'                                                                                            │
│ - OAuthAccountType = 'tt' | 'tts'（CLI 参数小写）                                                                       │
│ - PublishType = 'normal' | 'shoppable'                                                                                  │
│ - UploadType = 'normal' | 'tts'                                                                                         │
│ - ProductType = 'shop' | 'showcase' | 'all'                                                                             │
│ - VideoStatus = 'PROCESSING_DOWNLOAD' | 'PUBLISH_COMPLETE' | 'FAILED' | string                                          │
│ - 各命令的入参/响应类型（UploadTokenData、NormalPublishResult 等）                                                      │
│                                                                                                                         │
│ src/client/index.ts（api-client.mjs 的 TypeScript 版本）                                                                │
│                                                                                                                         │
│ 导出函数：                                                                                                              │
│ - getApiKey(), getBaseUrl()                                                                                             │
│ - openApiGet<T>(path, params?): Promise<T>                                                                              │
│ - openApiPost<T>(path, body?): Promise<T>                                                                               │
│ - openApiUpload<T>(path, formData, params?, auth?): Promise<T>                                                          │
│ - detectInputType(), localFileToFile(), urlToFile(), resolveFileInput()                                                 │
│ - printResult(data: unknown): void                                                                                      │
│                                                                                                                         │
│ ▎ 移除 parseArgs / requireArgs（由 cac 替代）                                                                           │
│                                                                                                                         │
│ 每个命令文件模式                                                                                                        │
│                                                                                                                         │
│ import type { CAC } from 'cac'                                                                                          │
│ import { openApiPost, printResult } from '../client/index.js'                                                           │
│ import type { SomeType } from '../types/index.js'                                                                       │
│                                                                                                                         │
│ export function register(cli: CAC): void {                                                                              │
│   cli.command('command-name', '描述')                                                                                   │
│     .option('--param <val>', '参数说明')                                                                                │
│     .action(async (options) => {                                                                                        │
│       // 参数验证 → API 调用 → printResult                                                                              │
│     })                                                                                                                  │
│ }                                                                                                                       │
│                                                                                                                         │
│ ---                                                                                                                     │
│ cac 参数名映射（重要）                                                                                                  │
│                                                                                                                         │
│ cac 自动将 kebab-case CLI 参数转为 camelCase：                                                                          │
│                                                                                                                         │
│ ┌─────────────────┬──────────────────────┐                                                                              │
│ │    CLI 参数     │     options.xxx      │                                                                              │
│ ├─────────────────┼──────────────────────┤                                                                              │
│ │ --creator-id    │ options.creatorId    │                                                                              │
│ ├─────────────────┼──────────────────────┤                                                                              │
│ │ --business-id   │ options.businessId   │                                                                              │
│ ├─────────────────┼──────────────────────┤                                                                              │
│ │ --share-id      │ options.shareId      │                                                                              │
│ ├─────────────────┼──────────────────────┤                                                                              │
│ │ --video-url     │ options.videoUrl     │                                                                              │
│ ├─────────────────┼──────────────────────┤                                                                              │
│ │ --file-id       │ options.fileId       │                                                                              │
│ ├─────────────────┼──────────────────────┤                                                                              │
│ │ --product-id    │ options.productId    │                                                                              │
│ ├─────────────────┼──────────────────────┤                                                                              │
│ │ --product-title │ options.productTitle │                                                                              │
│ ├─────────────────┼──────────────────────┤                                                                              │
│ │ --item-ids      │ options.itemIds      │                                                                              │
│ ├─────────────────┼──────────────────────┤                                                                              │
│ │ --product-type  │ options.productType  │                                                                              │
│ ├─────────────────┼──────────────────────┤                                                                              │
│ │ --page-size     │ options.pageSize     │                                                                              │
│ ├─────────────────┼──────────────────────┤                                                                              │
│ │ --max-polls     │ options.maxPolls     │                                                                              │
│ ├─────────────────┼──────────────────────┤                                                                              │
│ │ --account-id    │ options.accountId    │                                                                              │
│ └─────────────────┴──────────────────────┘                                                                              │
│                                                                                                                         │
│ ---                                                                                                                     │
│ 实施步骤（有序）                                                                                                        │
│                                                                                                                         │
│ ┌─────┬───────────────────────────────────────────────────────┬────────────────────────────────────────────┐            │
│ │  #  │                         步骤                          │                    验证                    │            │
│ ├─────┼───────────────────────────────────────────────────────┼────────────────────────────────────────────┤            │
│ │ 1   │ npm install cac && npm install -D typescript tsup tsx │ -                                          │            │
│ ├─────┼───────────────────────────────────────────────────────┼────────────────────────────────────────────┤            │
│ │ 2   │ 创建 tsconfig.json                                    │ npx tsc --noEmit（0 错误）                 │            │
│ ├─────┼───────────────────────────────────────────────────────┼────────────────────────────────────────────┤            │
│ │ 3   │ 创建 src/types/index.ts                               │ npx tsc --noEmit                           │            │
│ ├─────┼───────────────────────────────────────────────────────┼────────────────────────────────────────────┤            │
│ │ 4   │ 创建 src/client/index.ts                              │ npx tsc --noEmit                           │            │
│ ├─────┼───────────────────────────────────────────────────────┼────────────────────────────────────────────┤            │
│ │ 5   │ 创建 src/cli.ts 存根                                  │ npx tsx src/cli.ts --help                  │            │
│ ├─────┼───────────────────────────────────────────────────────┼────────────────────────────────────────────┤            │
│ │ 6   │ 创建 src/commands/oauth.ts                            │ npx tsx src/cli.ts get-oauth-url --help    │            │
│ ├─────┼───────────────────────────────────────────────────────┼────────────────────────────────────────────┤            │
│ │ 7   │ 创建 src/commands/account.ts                          │ npx tsx src/cli.ts get-account-info --help │            │
│ ├─────┼───────────────────────────────────────────────────────┼────────────────────────────────────────────┤            │
│ │ 8   │ 创建 src/commands/upload.ts                           │ npx tsx src/cli.ts upload --help           │            │
│ ├─────┼───────────────────────────────────────────────────────┼────────────────────────────────────────────┤            │
│ │ 9   │ 创建 src/commands/publish.ts                          │ npx tsx src/cli.ts publish --help          │            │
│ ├─────┼───────────────────────────────────────────────────────┼────────────────────────────────────────────┤            │
│ │ 10  │ 创建 src/commands/poll-status.ts                      │ npx tsx src/cli.ts poll-status --help      │            │
│ ├─────┼───────────────────────────────────────────────────────┼────────────────────────────────────────────┤            │
│ │ 11  │ 创建 src/commands/query-video.ts                      │ npx tsx src/cli.ts query-video --help      │            │
│ ├─────┼───────────────────────────────────────────────────────┼────────────────────────────────────────────┤            │
│ │ 12  │ 创建 src/commands/query-products.ts                   │ npx tsx src/cli.ts query-products --help   │            │
│ ├─────┼───────────────────────────────────────────────────────┼────────────────────────────────────────────┤            │
│ │ 13  │ 完善 src/cli.ts（替换存根）                           │ npx tsc --noEmit（0 错误）                 │            │
│ ├─────┼───────────────────────────────────────────────────────┼────────────────────────────────────────────┤            │
│ │ 14  │ 创建 tsup.config.ts + 创建 package.json               │ -                                          │            │
│ ├─────┼───────────────────────────────────────────────────────┼────────────────────────────────────────────┤            │
│ │ 15  │ npm run build                                         │ 检查 dist/cli.mjs 存在且含 shebang         │            │
│ ├─────┼───────────────────────────────────────────────────────┼────────────────────────────────────────────┤            │
│ │ 16  │ 本地冒烟测试                                          │ 见下方验证步骤                             │            │
│ ├─────┼───────────────────────────────────────────────────────┼────────────────────────────────────────────┤            │
│ │ 17  │ 更新 SKILL.md CLI 示例章节                            │ 检查 frontmatter 不变                      │            │
│ ├─────┼───────────────────────────────────────────────────────┼────────────────────────────────────────────┤            │
│ │ 18  │ 更新 README.md                                        │ 添加 npm 安装章节                          │            │
│ ├─────┼───────────────────────────────────────────────────────┼────────────────────────────────────────────┤            │
│ │ 19  │ npm publish --access public                           │ -                                          │            │
│ └─────┴───────────────────────────────────────────────────────┴────────────────────────────────────────────┘            │
│                                                                                                                         │
│ ---                                                                                                                     │
│ 验证步骤                                                                                                                │
│                                                                                                                         │
│ # 1. TypeScript 类型检查                                                                                                │
│ npm run typecheck                                                                                                       │
│                                                                                                                         │
│ # 2. 构建                                                                                                               │
│ npm run build                                                                                                           │
│ # 应生成 dist/cli.mjs，首行为 #!/usr/bin/env node                                                                       │
│                                                                                                                         │
│ # 3. 命令帮助                                                                                                           │
│ node dist/cli.mjs --help                                                                                                │
│ node dist/cli.mjs get-oauth-url --help                                                                                  │
│ node dist/cli.mjs upload --help                                                                                         │
│                                                                                                                         │
│ # 4. 与原脚本行为对比（需真实 API Key）                                                                                 │
│ BEERVID_APP_KEY=xxx node scripts/get-oauth-url.mjs --type tt                                                            │
│ BEERVID_APP_KEY=xxx node dist/cli.mjs get-oauth-url --type tt                                                           │
│ # 两者输出应完全一致                                                                                                    │
│                                                                                                                         │
│ # 5. npm pack 检查（应含 dist/ SKILL.md README.md，不含 scripts/ .claude/）                                             │
│ npm pack --dry-run                                                                                                      │
│                                                                                                                         │
│ # 6. 全局安装测试                                                                                                       │
│ npm install -g .                                                                                                        │
│ beervid --help                                                                                                          │
│ beervid --version                                                                                                       │
│ npm uninstall -g beervid-app-cli                                                                                        │
│                                                                                                                         │
│ ---                                                                                                                     │
│ 关键文件                                                                                                                │
│                                                                                                                         │
│ ┌─────────────────────┬────────────┬─────────────────────────────────────────────────────────┐                          │
│ │        文件         │    状态    │                          说明                           │                          │
│ ├─────────────────────┼────────────┼─────────────────────────────────────────────────────────┤                          │
│ │ src/types/index.ts  │ 新建       │ 所有 TS 类型                                            │                          │
│ ├─────────────────────┼────────────┼─────────────────────────────────────────────────────────┤                          │
│ │ src/client/index.ts │ 新建       │ api-client.mjs 的 TS 版本（移除 parseArgs/requireArgs） │                          │
│ ├─────────────────────┼────────────┼─────────────────────────────────────────────────────────┤                          │
│ │ src/cli.ts          │ 新建       │ cac 入口                                                │                          │
│ ├─────────────────────┼────────────┼─────────────────────────────────────────────────────────┤                          │
│ │ src/commands/*.ts   │ 新建（×7） │ 每个命令一个文件                                        │                          │
│ ├─────────────────────┼────────────┼─────────────────────────────────────────────────────────┤                          │
│ │ tsconfig.json       │ 新建       │ "moduleResolution": "bundler"                           │                          │
│ ├─────────────────────┼────────────┼─────────────────────────────────────────────────────────┤                          │
│ │ tsup.config.ts      │ 新建       │ shebang 通过 banner 注入                                │                          │
│ ├─────────────────────┼────────────┼─────────────────────────────────────────────────────────┤                          │
│ │ package.json        │ 新建       │ bin: { beervid: ./dist/cli.mjs }                        │                          │
│ ├─────────────────────┼────────────┼─────────────────────────────────────────────────────────┤                          │
│ │ scripts/            │ 保留       │ legacy 参考，不发布 npm                                 │                          │
│ ├─────────────────────┼────────────┼─────────────────────────────────────────────────────────┤                          │
│ │ SKILL.md            │ 更新       │ node scripts/x.mjs → beervid x                          │                          │
│ ├─────────────────────┼────────────┼─────────────────────────────────────────────────────────┤                          │
│ │ README.md           │ 更新       │ 添加 npm 安装章节                                       │                          │
│ └─────────────────────┴────────────┴─────────────────────────────────────────────────────────┘                          │
│                                                                                                                         │
│ ---                                                                                                                     │
│ 注意事项                                                                                                                │
│                                                                                                                         │
│ 1. upload.ts 最复杂：两步流程（先获取 upload token → 再上传），auth 头为 X-UPLOAD-TOKEN 而非 X-API-KEY                  │
│ 2. query-products.ts 第二复杂：Promise.allSettled 并行查询、base64 cursor 编解码、Map 去重                              │
│ 3. poll-status.ts 退出码语义：PUBLISH_COMPLETE → process.exit(0)，FAILED → process.exit(1)，需保留                      │
│ 4. src/cli.ts 不加 shebang：shebang 由 tsup banner.js 注入到 dist，避免重复                                             │
│ 5. ESM import 用 .js 扩展名：import from '../client/index.js'（tsup 在打包时正确解析 .ts 源文件）