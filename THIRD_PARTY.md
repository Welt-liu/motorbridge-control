# 上游与第三方内容

本项目是 Cordis 宿主集成，不是 MotorBridge、MotorBridge Studio 或 Cordis 的官方发行版。

| 内容 | 来源 | 版本 / 提交 | 说明 |
| --- | --- | --- | --- |
| Cordis | https://github.com/cordiverse/cordis | npm `4.0.0-rc.10` | npm 依赖，遵循上游许可 |
| MotorBridge Studio 源码与模型资源 | https://github.com/motorbridge/motorbridge-studio | `1.1.9` / `23b6e62ab8173faee3928c827cca3b7f42ba2128` | `plugins/motorbridge-studio/ui/` 保存上游快照；集成改动见该插件的 `INTEGRATION.md` |
| MotorBridge 网关 | https://pypi.org/project/motorbridge/ | `0.5.6` | MIT；保留 `vendor/motorbridge/LICENSE`。安装脚本下载官方 wheel，校验 SHA256；二进制不提交到 Git |
| PCBUSB | MotorBridge 上游 `third_party/pcan/macos/` | `0.13` | UV Software 专有 EULA，见 `vendor/runtime/PCBUSB-LICENSE`；安装时保存完整原始发行包，运行时不提交到 Git |
| DM_Device SDK runtime | MotorBridge 上游 `third_party/dm_device/` | `1.1.0` | 厂商运行时；保留来源说明，安装时从固定提交下载并校验 SHA256，运行时不提交到 Git |

本次使用的 Studio 上游快照未提供根目录 LICENSE。本仓库没有为其源码、商标或 URDF/STL 资源追加许可，也不将其声明为本宿主原创内容。使用或再分发这些内容时应遵循上游授权。

依赖包的具体许可保存在对应 npm 包中。运行时下载来源和校验值见 `vendor/motorbridge/SOURCE.json`、`vendor/runtime/SOURCE.json`。
