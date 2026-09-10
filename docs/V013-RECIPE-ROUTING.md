# 0.1.3 配方引用修复与无损验证

0.1.3 从 `C:\Users\hhhh\Desktop\HaJiMi-v0.1.2` 完整复制到独立目录，应用版本与锁文件已更新。原 0.1.2 未修改。本次交付为修改后的源码副本，没有重新构建或发布安装包，也没有切换正在运行的 0.1.2 服务；复制过来的 `.next` 和 `release` 仍属于旧构建。

## 保留范围

- 五个配方文件、108 份配方的正文、代码和注意事项逐字保留。
- `toolkit/legacy-modeling-plot-suite` 的 160 个原始文件与 0.1.2 完全一致。
- expressive/restrained、绘图工具、配色、布局、选图规则和视觉审计逻辑未修改。
- 指南与工作流只修改配方引用和提取命令；未增加图型、风格或绘图自由度限制。
- 原有 `custom` 与旧编号接口继续可用。

## 修改方式

稳定 ID 保存在 `scripts/plot-recipe-routing/recipe_registry.json`，同步到能力包的 `resources/assets/shared-scripts/`。ID 映射到文件与完整标题，编号只作为冻结的旧接口别名。标题或正文与注册表不匹配时明确报错；不会换用其他目录或其他配方。

例如 `recipe:basic.raincloud`、`recipe:academic.tsne_umap`、`recipe:competition.cluster_3d`。提取示例：

```bash
python _utils/get_recipe.py --id academic.tsne_umap
python _utils/get_recipe.py academic 3
python _utils/get_recipe.py --plan FIGURE_PLAN.json PAPER_PLAN.md --output _utils/RECIPES_FOR_THIS_PAPER.md
```

批量提取支持新 ID、旧编号和旧的连续编号写法。全部解析成功后才替换输出文件。脚本只读取自身目录的注册表和配方，避免工作目录中的旧 `_utils` 抢先命中。

bootstrap 会更新哈希匹配原版 0.1.2 的提取脚本和三个引用指南，保留用户修改过的文件。用户自行修改过的配方需要与对应注册表一起维护，或在独立生成脚本中适配；脚本不会静默覆盖这些修改。

全部迁移记录见 `scripts/plot-recipe-routing/reference_migrations.json`：143 条引用/命令替换记录，其中 18 处进行了语义错位修正。权重分配的“横向柱状图”原来指向竖向帕累托图，改为已有的 `custom` 路径，仍保留横向柱状图的选图要求；配方库存未减少。

## 防止再次漂移

- `npm run check:recipes` 校验 ID、正文哈希、引用存在性，并反向还原引用替换，验证其余提示词字节与 0.1.2 基线一致。
- `npm run check:capabilities` 同时执行上述检查。
- `npm test` 包含新旧提取一致性、重排/重编号、错误资源、批量提取和 bootstrap 回归。
- `sync-hajimi-capabilities.mjs` 接入独立补丁，重新同步资源后仍保留本次修复。
- 同步时同时保留 0.1.2 已有的 paper-figure 调整，防止旧快照覆盖当前提示词。
- Python 生成缓存不计入资源清单；缓存文件保留在磁盘上。

后续维护应保留现有 ID，不得因章节重排重新生成 ID。`prepare_registry.py` 仅用于从冻结的 0.1.2 初次建立迁移资料。新增或修改配方须显式更新相关索引及审查基线，不能静默跳过检查。

## 验证结果

| 检查 | 结果 |
|---|---|
| 108 份配方：新 ID / 旧编号 / 原版提取结果 | 全部逐字一致 |
| 非引用提示词、profiles、绘图工具及原始快照 | 与 0.1.2 一致 |
| 独立目录、重排重编号、错误资源、预取、bootstrap | 6 项 Python 回归通过 |
| 配方及规划、版本专项测试 | 11 项通过 |
| 能力包重新同步后检查 | 通过 |
| TypeScript 类型检查 | 通过 |
| lint | 0 错误，8 条已有警告 |
| 全量 npm test | 757 项：746 通过，8 跳过，3 项 WSL 环境失败 |

三个失败来自本机缺少测试使用的 WSL 发行版，错误为 `WSL_E_DISTRO_NOT_FOUND`；未修改 WSL 代码或跳过这些测试。完整日志为根目录 `artifacts-v013-tests.log`。

固定数据/种子分别通过新旧提取路径渲染雨云图、3D 曲面、预测区间图和四面板图：四组输出像素完全一致，并已打开预览检查。输出位于 `artifacts/v013-recipe-render-regression/`，包含新旧 PDF、PNG、运行日志与 `results.json`。这验证了本次迁移没有改变这些配方的表现，不代表重做了原配方的审美或布局优化。

重新运行：

```bash
python -B scripts/render-recipe-routing-regression.py
```

渲染回归使用本机 Matplotlib、NumPy、SciPy、Pillow、PyMuPDF。运行时只使用配方内演示数据，不调用模型或外部绘图服务。


## 2026-09-09：补齐实际兼容入口

七组合成数据实测发现，第八阶段的资源加载和 `bindPlotRuntime` 使用
`compatibility/v010/bundled/capabilities/modeling-plot-suite/1.0.0`，之前主包验证不覆盖此入口。
本次将相同的引用迁移、稳定 ID 注册表与提取器部署至该目录；兼容规划校验器同时接受稳定 ID，旧编号与 custom 仍兼容。
不切换原工作流，不替换兼容目录的提示词、配方正文、风格或渲染工具。资源同步脚本会重新应用兼容补丁并更新文件清单。
已存在工作区在下一次实际运行绑定时取得新版资源；bootstrap 也仅刷新可识别的旧版路由文件。本次没有重跑七图或改写其历史测试材料。

验证：7 项 Node 专项测试通过（其中主包、兼容包各运行 6 项 Python 回归）；TypeScript 检查通过。
兼容资源逆向撤销显式引用迁移后与冻结基线逐字一致；108 份正文经新 ID、旧编号提取均完整保留。
新增实际 `bindPlotRuntime` 集成测试：从临时工作区 `_utils` 提取雨云图与预测区间图，并确认兼容规划校验器接受其 ID。
这验证配方引用与部署链路，不代表已经解决独立绘图数量检查、状态冲突或布局审美问题。


## 2026-09-09：保存时保留作者布局

用户同意在九类确定性对照之后关闭自动布局干预。主包及实际compatibility/v010包的setup_style不再安装Figure.savefig自动修图hook；save_fig不再调用强制子图放大、文字移动、tight_layout或稀疏画布收缩。保留样式、字体、配色、扩展名兜底、350dpi位图导出、PDF/SVG导出和只读诊断。显式布局辅助函数仍存在，但保存过程不自动执行它们。

scripts/plot-layout-preservation.mjs与JSON补丁记录同步应用并支持精确撤销比对；bootstrap仅刷新已识别哈希的旧helper，用户编辑保留。正常工作区绑定继续复制当前兼容资源。已有Python进程需重新启动，已生成图片不会被自动重画。

验证：九类导出前后坐标区、画布大小与可见文字裁切状态不变；统一尺寸预览与原生Matplotlib逐像素一致。PDF/SVG导出通过，调色板及安全刷新测试通过，108配方及资源保留检查通过。原生布局错误不再由保存工具自动修复；需要生成器显式调整。

对照：artifacts/layout-overwrite-expanded/REPORT.md；修改后测量与图片：artifacts/layout-preservation-verified/。

## 绘图说明一致性修订

更新主资源与 compatibility/v010 的保存说明：save_fig 保留布局、默认 bbox_inches=None；紧边界裁剪须显式调用 Matplotlib 并注意物理尺寸变化。刻度 8pt、轴标签 9pt 改为源字号参考，允许最终尺寸下清楚的小字。取消 tight_layout pad 的统一上限及基于旧保存行为的 colorbar 布局禁令，保留模板参数与实例。预计算片段同步更新。修订纳入可逆同步补丁，配方正文未改。

验证：108 配方完整性检查通过；兼容快照、主资源、提取/预取/bootstrap 和实际运行时绑定共 5 项测试通过。此次未重新出图。
