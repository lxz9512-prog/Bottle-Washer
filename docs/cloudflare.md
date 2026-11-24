# Bottle-Washer Cloudflare 部署

## 专属资源

| 资源 | 名称 / 标识 |
| --- | --- |
| Worker + 静态资源 | `bottle-washer`（Cloudflare 标识仅支持小写） |
| 访问地址 | `https://bottle-washer.lxz9512-prog.workers.dev` |
| D1 数据库 | `Bottle-Washer-notes` |
| D1 ID | `b5141219-dfb8-4c27-9e83-5e2d54de2058` |
| Worker 数据库绑定 | `DB` |
| 静态资源绑定 | `ASSETS` |

配置文件为 `wrangler.jsonc`。已有 `workshop-center` Worker / D1 和 `bw05s-bottle-washer` Pages 不属于本次新建资源，不用于本项目的部署与说明存储。

## 发布

使用已登录 Cloudflare 的 Node.js 22+ 环境：

```sh
npm ci --ignore-scripts
npx wrangler login
npm run type:check:client
npm run test:demo
npm run test:worker
npm run deploy:cloudflare
```

发布脚本先构建静态资源，再应用 D1 增量迁移，最后发布 Worker。后续发布不会清空已编辑的线上说明。GitHub Actions 只检查，不自动发布。仅在收到发布指令后运行发布命令。

## 编辑密码与会话

线上通过 Worker Secrets 设置 `EDIT_PASSWORD_HASH`（编辑密码的 SHA-256 十六进制摘要）与 `SESSION_SECRET`（随机签名密钥）。部署时不把明文密码或密钥写入仓库，也不放入前端产物。首次生成的编辑密码在本机 `.local/editing-password.txt`，文件权限为 0600，此目录已忽略版本控制。可由项目所有者按需分享编辑密码。

Cookie 仅供服务器读取，有效期 12 小时。每页支持在原有说明后追加标题与正文，最多 40 项，已有项与新增项均可删除，也可保存空说明列表。历史记录在读取时补齐稳定标识，删除前面的条目不改变后面条目的连线或版本对比。原有条目的交互连线保持不变，新增项不自动关联手机元素。保存操作校验登录、来源、字段及版本号，版本冲突返回 409 并保留浏览器草稿。连续密码错误会触发 15 分钟的尝试限制。公共浏览无需密码。

修改编辑密码时，应同时更新 `EDIT_PASSWORD_HASH` 和 `SESSION_SECRET`，使旧会话失效。通过 `npx wrangler secret bulk` 从标准输入设置，避免在命令行参数、Git 或日志中暴露密钥。

## 本地完整预览

本机 `.dev.vars` 保存开发使用的密码摘要和会话密钥，已忽略版本控制。新机器需自行创建开发配置。初始化本地 D1 后，分别启动 API 和 Vite：

```sh
npx wrangler d1 migrations apply Bottle-Washer-notes --local
npm run dev:cloud
npm run dev
```

Vite 将 `/api/notes` 代理到 `127.0.0.1:8787`，本地数据库与线上隔离。只查看 Demo 时可以仅启动 Vite，线上说明读写需要同时启动 API。

## 原有说明迁移

迁移前从 GitHub 的 `codex/interaction-notes` 分支读取已有 `devices.json`，导入专属 D1。未单独编辑过的页面使用 `client/src/demo/catalog.ts` 中的默认说明，首次保存后写入数据库。GitHub 中的历史说明分支保留作备份，网页今后以 D1 内容为准。
