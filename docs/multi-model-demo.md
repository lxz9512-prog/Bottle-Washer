# 多型号清洗机 Demo

## 本次范围

以当前本地 BW05S 实现为基准，共用页面和业务流程。型号入口放在首页设备列表，桌面控制台不增加型号选择器。

| 型号 | 模式 | 耗材 |
| --- | --- | --- |
| BW05S | 保留当前全部模式 | 软水、HEPA |
| BW05P | 移除智能洗及精细护理四个模式，保留日常必备和自定义，另有强力洗 | 软水、HEPA |
| BW05A | 与 BW05P 相比不含强力洗 | 仅 HEPA |

精细护理四个模式标识为 `baby`、`bottles`、`food-bowl`、`delicate-wash`。BW05S 使用历史版本中的灰色产品图，未提供 P/A 专用素材，P/A 暂时复用另一张现有清洗机产品图。强力洗尚未提供专用参数，当前 Demo 沿用标准洗参数。

BW05S 灰色图已裁掉外围留白，与 P/A 共用显示尺寸；设备列表、控制页和耗材页保持接近的机器视觉大小。

所有机型均可在模式浮窗标题两侧切换模式。仅自定义模式名称支持点击直接编辑，名称居中显示，修改后本地保存。

设备列表在清洗运行阶段显示清洗剩余分钟。清洗步骤结束并进入保管阶段后显示“保管中”和保管剩余时间，剩余时间达到 1 小时显示小时，不足 1 小时显示分钟，保管阶段隐藏模式名称。

## 入口

- 手机设备列表：`#/app`
- 桌面设备列表：`#/demo`
- 手机直达：`#/app/cleaning-machine/models/bw05s/home`，将型号替换为 `bw05p` 或 `bw05a`。
- 桌面直达：`#/demo/cleaning-machine/models/bw05s/home`，将型号替换为 `bw05p` 或 `bw05a`。
- 旧 `#/app/cleaning-machine/...` 和 `#/demo/cleaning-machine/...` 链接继续指向 BW05S。

未知型号显示错误提示。P/A 的智能运行链接回到该型号控制页；不兼容的历史模式和预约缓存会被清除，不转换成另一种模式启动。

## 维护与存储

PC 版左右侧栏采用连续通栏排版。交互说明支持编辑标题及正文，点击“保存到线上”写入当前仓库的 `codex/interaction-notes` 分支，按页面分别保存。查看者打开说明或点击刷新按钮时读取线上内容。首次保存需连接仅授权 Bottle-Washer 仓库且具有 Contents 读写权限的 GitHub fine-grained token，凭据只保存在当前页面内存中，关闭页面后需重新连接。

切换页面和收起说明时保留本次打开期间的编辑草稿。取消编辑恢复已读取的线上内容。保存遇到版本冲突时保留草稿，点击“读取最新说明”后可展开“查看线上版本”对照并合并修改，再次保存。网页刷新前需保存草稿。

型号资料、模式清单和耗材能力统一定义在 `client/src/pages/DemoShowcasePage/machine-models.ts`。页面、目录、耗材入口和软水异常选项读取这些定义，启动操作同时验证模式能力。

运行状态、预约、自定义模式名称和参数、设备名称、宝宝物品按型号保存。切换机型不清空原机型状态，后台机型的运行与预约计时继续。语言和深色模式为共享偏好。

手机体验保留原有 `BW05S_app_v1:` 存储前缀；BW05S 沿用旧键，P/A 增加 `models:bw05p:` 或 `models:bw05a:` 子前缀。桌面体验仍使用独立演示存储空间和内存运行状态，不覆盖手机体验数据。

## 验证

```sh
npm run type:check:client
npm run test:demo
APP_URL=http://127.0.0.1:5185/ npm run test:models:e2e
APP_URL=http://127.0.0.1:5185/ npm run test:modes:e2e
APP_URL=http://127.0.0.1:5185/ npm run test:app:e2e
DEMO_URL=http://127.0.0.1:5185/#/demo npm run test:demo:e2e
DEMO_URL=http://127.0.0.1:5185/#/demo npm run test:demo:safe-area
npm run build
```

浏览器测试使用隔离 Chrome 环境。macOS 下需在允许桌面服务访问的执行环境中启动，遵循项目的 Chrome launch guard。

Demo 通过推送 `main` 触发 GitHub Pages 发布；发布状态以 GitHub Actions 结果及线上核验为准。未连接真实设备或操作真实数据。
