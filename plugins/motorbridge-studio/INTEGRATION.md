# MotorBridge Studio Cordis 集成

上游源码以快照形式保存在 `ui/`，来源为 motorbridge/motorbridge-studio，提交 `23b6e62ab8173faee3928c827cca3b7f42ba2128`，版本 1.1.9。

Cordis 插件入口为宿主的 `src/plugins/studio.js`。插件依赖 `http` 服务，将 Studio 静态资源挂载到 `/studio/`；挂载由 `ctx.effect()` 登记，插件卸载时删除对应路由。

构建时使用上游已有的 `VITE_BASE_PATH=/studio/`，并设置 `VITE_CORDIS_HOST=true`。除这两个构建设置，只做了以下集成修改：

1. `ui/src/App.jsx`：解析路由时移除部署前缀，支持 `?page=robot_arm` 直接打开机械臂工作台。
2. `ui/src/i18n/index.js`：语言路由识别与切换保留 `/studio/` 前缀。
3. `ui/src/main.jsx`：在 Cordis 宿主中订阅插件状态；停用时卸载 React 根节点并关闭状态订阅。
4. `ui/src/hooks/useGatewayBridge.js`：React 卸载时取消自动重连计时器并断开网关连接。

电机命令、机器人配置、运动控制与 URDF 资源沿用上游实现。未修改 MotorBridge Rust 仓库。

当前的插件加载状态是进程内状态，重启宿主会默认加载 Studio。没有加入远程插件商店或云端安装。Rust 网关由独立的 Cordis `motorbridge-gateway` 插件按 UI 按钮请求启动和停止；启动时所选接口作为网关默认配置，Studio 沿用上游动态目标协议。宿主打开 Studio 时同步当前 WebSocket 地址，不传递或持久化宿主的访问令牌。
