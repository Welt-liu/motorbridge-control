# MotorBridge Control · Web 首版

本地 Web 工作空间：先检查电机通信，再通过 Cordis 加载 MotorBridge Studio。

当前阶段：**Web 首版软件流程已打通，真实 reBot 机械臂联调待完成**。详细完成项、验证边界与下一步见 [开发进度](PROGRESS.md)。

上游来源及第三方许可说明见 [THIRD_PARTY.md](THIRD_PARTY.md)。

## 已实现

- **网关进程**：点击“启动并连接”由 Cordis 启动真实 Rust `ws_gateway`，检查 WebSocket 能力后连接；显示 PID、状态和日志，可停止并重启。宿主关闭时回收它启动的进程。
- **接口检索**：检索本机 PEAK USB2CAN 通道、达妙 USB2CANFD / DUAL / LINKX4C 设备和 USB 串口。选择连接方式、接口和参数；没有设备时可手动填写。Linux 也支持 SocketCAN 与 USB 串口枚举。
- **扫描电机**：通过选择的接口发送 MotorBridge `scan`，限定 ID 范围，展示结果并选择目标；RobStride 显示扫描进度并使用指定 Host ID。达妙扫描尝试多种反馈 ID/型号，可能较慢。
- **连接检查**：设置厂商、型号、电机 ID、Host/反馈 ID 与设备等待时间，通过所选接口 Ping / Verify。
- **RobStride Ping**：发送 `set_target` 和 `ping`，只有收到目标电机对应的 `device_id` 才显示响应成功。
- **达妙 Verify**：发送 `set_target` 和 `verify`，读取电机 ID 与反馈 ID 寄存器并校验。其他厂商的网关 `ping` 可能是网关确认，因此没有用它判断电机在线。
- **结果展示**：响应耗时、原始回复、错误提示和当前会话最近 20 条记录。耗时包括 WebSocket 与设备查询，不能当作纯 CAN 延迟。
- **Cordis 应用入口**：加载、停用、重新加载 MotorBridge Studio，实际使用 Cordis 的依赖注入和 `ctx.effect()` 资源释放。
- **原版 Studio**：嵌入本地构建的 Studio，保留通用电机模式、reBot 机械臂工作台、关节卡片、URDF 模型与已有动作工具。

## 启动

需要 Node.js 24 与 Python 3（接口检索、网关安装及 USB 解析测试使用）。从仓库首次安装请先执行下方 `npm run setup` 与 `npm run build`。

```sh
npm run dev
```

打开 **http://127.0.0.1:4173/**。也可以双击本目录的 `start-local.command` 运行已构建版本；脚本优先使用 Node.js 24，或当前电脑的 Codex 捆绑 Node.js。

从公有仓库首次启动：

```sh
git clone https://github.com/Welt-liu/motorbridge-control.git
cd motorbridge-control
npm run setup
npm run build
npm start
```

只修改宿主 UI 时，`npm run dev` 支持即时更新；修改 Studio 源码后需重新运行 `npm run build`。

## 真实电机检查

1. 插入 USB2CAN / 串口桥，点击“重新检索接口”。接口枚举只识别适配器，不扫描电机，也不会打开 CAN 通道。
2. 选择连接方式和检索到的接口；PEAK 在 macOS 上使用 `can0@1000000` 这类通道，达妙 SDK 需选择设备型号和 SDK 通道，串口桥需选择路径与波特率。自动模式仅指标准 CAN 自动传输选择，不会自动识别任意 USB 协议。
3. 点击“启动并连接”，无需另开终端。宿主启动时不自动运行 Rust 网关；按钮触发启动。网关初始处于 standby，扫描或 Ping 时才打开对应总线。
4. 设置厂商、型号与 Host/反馈 ID，选择扫描范围，再点击“扫描电机”。点击结果填入目标，使用 Ping / Verify 验证。每次最多扫描 64 个 ID，默认 1～8。
5. 在“应用”中打开 Studio，使用已运行的网关。宿主会传入当前 WebSocket 地址；启动时所选厂商与接口作为网关默认配置。Studio 保留自己的连接按钮与令牌设置。

**连接方式区别**：PEAK USB2CAN 使用标准 CAN / PCAN 路径；达妙 `dm-device` 和 `dm-serial` 仅支持达妙电机，不能直接用于 RobStride。Linux SocketCAN 接口需先由系统配置波特率并启动。当前尚未接入网络适配器或通用 SLCAN 串口协议。

`npm run setup` 在 macOS arm64 上下载官方 PyPI **MotorBridge 0.5.6** 网关及适用的 PCBUSB / DM_Device 运行时，校验 SHA256，保存到本项目 `vendor/` 中；无需安装 Rust 编译器或修改系统目录。运行时二进制不提交到 Git，也可以单独执行 `npm run setup:gateway` 重新安装。来源、校验信息见 `vendor/motorbridge/SOURCE.json` 与 `vendor/runtime/SOURCE.json`。其他系统需提供对应平台的官方网关程序，启动宿主时设置 `MOTORBRIDGE_WS_GATEWAY_BIN=/absolute/path/to/ws_gateway`；驱动与厂商运行时按对应平台安装。

- 启动接口只允许绑定 `127.0.0.1`，由宿主配置可执行文件，浏览器不能提交任意命令或程序路径。已有外部进程占用端口时，使用“仅连接”或更换地址；宿主不会终止外部网关。
- 更换启动连接方式、端口或令牌时，先停止当前网关再启动。连接后的 Ping / 扫描仍可动态指定目标和传输参数。
- 接口检索发生在运行 Cordis 的电脑上，远程网关的接口需手动配置。同型号多台达妙 SDK 适配器目前由 MotorBridge 选择首台，不能保证选择特定序列号；实际关节映射需硬件联调确认。
- 关闭浏览器或断开 WebSocket 不会自动停止网关。可点击“停止网关”，或关闭宿主。扫描中断开 UI 只取消页面等待，网关侧请求可能继续执行；停止宿主管理的网关可终止该进程。
- RobStride 的 Host ID 不是另一个被控电机 ID；UI 支持十进制和 `0x` 十六进制输入。
- Ping 页面独立输入框中的访问令牌仅保存在当前页面内存中。保存网关地址时移除 `motorbridge_ws_token` 参数。Studio 保留上游自己的连接与偏好设置。
- 网关连接成功只说明 WebSocket/能力查询成功。电机结果来自独立的设备身份验证。
- Ping 页面不发送使能、运动、校零或写参数命令。Studio 则保留其原有控制能力，需要单独连接网关。
- 停用 Studio 会撤销页面路由，并通知已打开的 Studio 页面卸载 React、断开连接。**停用插件不等于硬件急停或电机失能**；网关与真实电机的停止策略仍属于 MotorBridge。

## 架构

```text
浏览器
  ├─ Ping UI ── WebSocket JSON ── MotorBridge ws_gateway ── CAN 电机
  └─ 应用入口 ── 本地 HTTP API ── Cordis
                                ├─ http 服务
                                ├─ motorbridge-gateway 插件 → Rust 子进程
                                └─ motorbridge-studio 插件
                                     └─ /studio/ 下的原版 Studio
```

Studio 在同源 iframe 中显示，可通过自己的 WebSocket 连接网关。Cordis 管理 Studio 的页面、插件生命周期和网关子进程资源；网关通过 `ctx.provide()` 提供启动/停止服务，并通过 `ctx.effect()` 在插件释放时清理子进程。Rust 核心与多关节实时控制继续由 MotorBridge 承担。

## 验证

```sh
npm test
npm run typecheck --prefix plugins/motorbridge-studio/ui
npm run lint --prefix plugins/motorbridge-studio/ui
npm test --prefix plugins/motorbridge-studio/ui
```

宿主/Ping/扫描/进程生命周期/USB 解析 21 项自动测试通过，涵盖并发启动、启动失败、端口占用、异常退出、Cordis 释放、连接参数及 ID 范围校验。Studio 76 项测试、类型检查和 lint 通过。浏览器验证了真实网关启动/连接/停止和测试网关的扫描→选择→Ping 流程。

网关启动/停止使用真实 Rust 程序验证，电机扫描与 Ping 的成功路径使用本地测试网关。USB 读取问题已修复，本机已读取 6 个 USB 设备和 1 个 USB 串口，**尚未完成真实机械臂的协议、扫描与控制联调**。检索到串口不代表已确认它采用达妙协议。

`tests/mock-gateway.js` 是可选的界面测试服务，端口 `19002`，没有 CAN 或电机访问能力；默认启动流程不会运行它。

## 上游

- MotorBridge：https://github.com/motorbridge/motorbridge
- Studio：https://github.com/motorbridge/motorbridge-studio
- Cordis：https://github.com/cordiverse/cordis

Studio 固定为版本 `1.1.9`，源码提交 `23b6e62ab8173faee3928c827cca3b7f42ba2128`。集成改动与源码位置见 `plugins/motorbridge-studio/INTEGRATION.md`。
