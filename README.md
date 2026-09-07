<p align="center">
  <img src="public/logo.png" width="112" alt="HaJiMi logo" />
</p>

<h1 align="center">HaJiMi Math Model Agent</h1>

<p align="center">
  面向数学建模的本地桌面智能体：从题目整理、逐问建模和代码求解，一直推进到图表、论文与最终提交包。
</p>

<p align="center">
  <a href="https://github.com/yjz211/HaJiMi-Math-Model-Agent/releases/latest">下载 Windows 安装包</a>
  ·
  <a href="docs/HAJIMI_ARCHITECTURE.md">工作流架构</a>
  ·
  <a href="CONTRIBUTING.md">参与开发</a>
</p>

## HaJiMi 是什么

HaJiMi 把数学建模任务组织成一条有状态、可追溯的 0—9 阶段工作流。它在桌面端管理项目、模型配置、会话与人工确认，在独立的题目目录中运行 Python、Shell、LaTeX 和数据处理工具，并保存代码、结果、图表、论文与证据之间的关系。

它面向完整交付链，而不只是一次问答：

- 清点并冻结题目、数据和附件；
- 拆分问题，明确变量、单位、目标和约束；
- 建立可解释基线，逐问比较模型并执行代码；
- 保存实验、参数、输出和失败记录；
- 对关键结论做独立验证，冻结论文可引用的证据；
- 生成数据图、空间图、工程图、技术路线图和推导图；
- 使用 LaTeX 生成论文与 PDF；
- 人工验收后生成代码附录、AI 使用说明和最终提交 ZIP。

## 0—9 阶段

| 阶段 | 目标 |
|---:|---|
| 0 | 材料就绪：核验原题、数据和附件 |
| 1 | 问题定义：整理事实、变量、目标、约束和歧义 |
| 2 | 数据审计与文献预研：检查口径、质量、泄漏和方法来源 |
| 3 | 简单基线：运行最小可解释方案并固定评价口径 |
| 4 | 逐问建模与代码求解：候选比较、实现和局部验证 |
| 5 | 整题集成与联合审查：检查跨问依赖并端到端运行 |
| 6 | 结果验证：稳健性、现实边界和独立复核 |
| 7 | 证据整理：把正式主张绑定到机器结果并冻结 |
| 8 | 论文与图表：绘图、写作、编译和轻量复核 |
| 9 | 提交材料与打包：生成附录、AI 说明和提交 ZIP |

支持两种运行方式：全自动模式连续推进到论文候选稿；半自动模式在每个阶段交付报告并等待确认。无论哪种模式，论文候选稿都需要用户验收后才能进入最终打包。

## 绘图与论文

第 7 阶段进入第 8 阶段时可以选择两套绘图方向：

- **鲜艳舒适型**：明亮配色、清晰层次，积极使用有信息增益的融合表达；
- **稳重科研型**：科研配色、规整结构，以直接、稳定和易读为主。

完整论文的数据图硬性下限为 8 张，通常建议 18—30 张。空间图不限于二维分布图；当数据与模型具有真实空间或工程语义时，会积极考虑三维地形、空间轨迹、设备布局、轴测/剖切、场量、覆盖面和几何约束表达。三维高度、比例、场量和结构必须来自真实数据或模型。

论文生成使用内置数学建模写作、绘图和提交能力包。阶段 8 只消费已经冻结的证据，避免论文数字与实际计算结果漂移。

## 下载与安装

当前提供 Windows 11 x64 安装包：

1. 打开 [Releases](https://github.com/yjz211/HaJiMi-Math-Model-Agent/releases/latest)；
2. 下载名称以 `win-x64.exe` 结尾的安装包；
3. 运行安装向导并选择安装目录；
4. 启动 HaJiMi，在模型设置中配置供应商和相应凭据；
5. 新建或选择一个独立目录作为建模项目。

Windows 安装包包含 Python、科学计算库、LaTeX、Shell 和字体等离线工具运行时，因此文件较大。AI 模型调用仍取决于你配置的供应商和网络连接。

当前公开安装包没有代码签名，Windows 可能显示“未知发布者”或 SmartScreen 提示。Release 同时提供 `SHA256SUMS.txt`，可用下面的命令核对文件：

```powershell
Get-FileHash .\HaJiMi-Math-Model-Agent-Setup-0.1.0-win-x64.exe -Algorithm SHA256
```

## 项目目录

HaJiMi 为每道题维护独立工作区，典型结构如下：

```text
input/          冻结的题目与原始数据
src/            可复现的模型和计算代码
work/           草稿与中间过程
data/derived/   派生数据
figures/        数据图、空间图与技术图
paper/          LaTeX 源文件和论文 PDF
deliverables/   附录、AI 说明和最终提交包
reports/        阶段报告
.hajimi/        计划、实验、证据、检查点和工作流状态
```

应用设置与对话会话保存在 HaJiMi 自己的用户数据目录中。题目目录、模型凭据和本机会话不会随安装包或本仓库发布。

## 技术架构

```text
Electron Desktop
  └─ Next.js / React UI
      └─ AgentSession + HaJiMi Core
          ├─ 0—9 阶段状态与人工确认
          ├─ 项目文件、证据冻结与产物登记
          ├─ Python / Shell / LaTeX 受管运行时
          └─ 内置论文、绘图与提交能力包
```

主要目录：

| 目录 | 内容 |
|---|---|
| `app/` | Next.js 页面与 API 路由 |
| `components/`、`hooks/` | 桌面工作台、会话和前端状态 |
| `electron/` | Electron 主进程、托盘、更新和启动管理 |
| `lib/hajimi/` | 工作流状态、阶段门禁、能力路由和运行后端 |
| `bundled/` | 0—9 工作流及论文、绘图、提交能力包 |
| `toolkit/` | 输入、结果、图表、LaTeX/PDF 与交付检查工具 |
| `runtime/` | 受管运行时清单、安装器与启动组件 |
| `scripts/` | 构建、能力同步、打包与冒烟测试脚本 |

更完整的设计见 [HaJiMi 架构说明](docs/HAJIMI_ARCHITECTURE.md) 和 [桌面工程架构](docs/ARCHITECTURE.md)。

## 从源码运行

要求：

- Windows 11 x64；
- Node.js 24 或兼容版本；
- npm；
- 使用 AI 功能所需的模型供应商账号或 API 凭据。

安装依赖并启动桌面开发版：

```powershell
npm ci
npm run dev:electron
```

也可以只启动 Web 开发服务器：

```powershell
npm run dev
```

本仓库不提交约 1 GB 的签名离线运行时归档 `runtime/windows/payloads/*.tar.gz`，也不提交 `node_modules`、`.next` 和安装产物。完整 Windows 离线版请直接使用 Release 安装包。维护者自行构建离线安装包时，需要先按 `runtime/` 和 `scripts/build-windows-runtime.py` 的约定准备并封存运行时归档，再设置 `HAJIMI_OFFLINE_RUNTIME=1` 执行：

```powershell
npm run dist
```

## 开发与验证

常用检查：

```powershell
npx tsc --noEmit
npx tsc -p electron/tsconfig.json --noEmit
npm test
npm run test:windows
npm run lint
npm run check:capabilities
```

开发时不要直接运行 `next build`，以免污染正在使用的 `.next`。提交规范、分支约定和发布流程分别见 [CONTRIBUTING.md](CONTRIBUTING.md) 与 [docs/RELEASING.md](docs/RELEASING.md)。

## 数据与安全边界

- Provider 凭据不会传入题目的 Shell/Python 执行环境；
- 文件访问受项目根目录和允许路径约束；
- 输入冻结、证据绑定和阶段门禁用于减少结果与论文不一致；
- 本地执行环境不是用于运行不可信恶意代码的通用安全沙箱；
- 提交 Issue 时不要上传 API Key、认证文件、完整会话或未脱敏数据。

Windows 安装包包含 Draw.io Desktop；源码打包时将完整程序目录放入 `runtime/windows/drawio/`（入口为 `draw.io.exe`）。该目录随安装包分发，不提交 Git。

## 上游与许可

桌面端基于 [Pi Agent Desktop](https://github.com/Chasen-Liao/pi-agent-desktop)，Agent Runtime 基于 [pi-mono](https://github.com/badlogic/pi-mono)。项目按 [MIT License](LICENSE) 发布，第三方组件继续遵循各自许可。
