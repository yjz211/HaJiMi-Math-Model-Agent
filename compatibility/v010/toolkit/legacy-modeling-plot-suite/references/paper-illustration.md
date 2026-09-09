---
name: paper-illustration
description: "Generate publication-quality AI illustrations for academic papers using Codex image generation. Creates architecture diagrams, method illustrations with Codex-supervised iterative refinement loop. Use when user says \"生成图表\", \"画架构图\", \"AI绘图\", \"paper illustration\", \"generate diagram\", or needs visual figures for papers."
argument-hint: [description-or-method-file]
allowed-tools: Bash(*), Read, Write, Edit, Grep, Glob, Agent, WebSearch
---

# Paper Illustration: Multi-Stage Codex-Supervised Figure Generation

Generate publication-quality illustrations using a **multi-stage workflow** with **Codex as the STRICT supervisor/reviewer**.

## Core Design Philosophy

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    MULTI-STAGE ITERATIVE WORKFLOW                        │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   User Request                                                           │
│       │                                                                  │
│       ▼                                                                  │
│   ┌─────────────┐                                                        │
│   │   Codex    │ ◄─── Step 1: Parse request, create initial prompt     │
│   │  (Planner)  │                                                        │
│   └──────┬──────┘                                                        │
│          │                                                               │
│          ▼                                                               │
│   ┌─────────────┐                                                        │
│   │   Codex    │ ◄─── Step 2: Optimize layout description               │
│   │ (Codex reasoning)│      - Refine component positioning                    │
│   │  Layout     │      - Optimize spacing and grouping                   │
│   └──────┬──────┘                                                        │
│          │                                                               │
│          ▼                                                               │
│   ┌─────────────┐                                                        │
│   │   Codex    │ ◄─── Step 3: CVPR/NeurIPS style verification          │
│   │ (Codex reasoning)│      - Check color palette compliance                  │
│   │  Style      │      - Verify arrow and font standards                 │
│   └──────┬──────┘                                                        │
│          │                                                               │
│          ▼                                                               │
│   ┌─────────────┐                                                        │
│   │ Codex ImageGen │ ◄─── Step 4: Render final image                       │
│   │ (Codex-3-  │      - High-quality image generation                   │
│   │ pro-image)  │      - Internal codename: Codex ImageGen              │
│   └──────┬──────┘                                                        │
│          │                                                               │
│          ▼                                                               │
│   ┌─────────────┐                                                        │
│   │   Codex    │ ◄─── Step 5: STRICT visual review + SCORE (1-10)      │
│   │  (Reviewer) │      - Verify EVERY arrow direction                    │
│   │   STRICT!   │      - Verify EVERY block content                      │
│   └──────┬──────┘      - Verify aesthetics & visual appeal               │
│          │                                                               │
│          ▼                                                               │
│   Score ≥ 9? ──YES──► Accept & Output                                    │
│          │                                                               │
│          NO                                                              │
│          │                                                               │
│          ▼                                                               │
│   Generate SPECIFIC improvement feedback ──► Loop back to Step 2        │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

## Constants

- **IMAGE_TOOL = Codex built-in `image_gen`** — high-quality image rendering
- **REASONING = Codex** — layout optimization, style verification, and visual review
- **MAX_ITERATIONS = 5** — Maximum refinement rounds
- **TARGET_SCORE = 9** — Minimum acceptable score (1-10) — RAISED FOR QUALITY
- **OUTPUT_DIR = `figures/ai_generated/`** — Output directory
- **AUTHENTICATION = none** — built-in ImageGen requires no API key

## CVPR/ICLR/NeurIPS Top-Tier Conference Style Guide

**What "CVPR Style" Actually Means:**

### Visual Standards
- **Clean white background** — No decorative patterns or gradients (unless subtle)
- **Sans-serif fonts** — Arial, Helvetica, or Computer Modern; minimum 14pt
- **Subtle color palette** — Not rainbow colors; use 3-5 coordinated colors
- **Print-friendly** — Must be readable in grayscale (many reviewers print papers)
- **Professional borders** — Thin (2-3px), solid colors, not flashy

### Layout Standards
- **Horizontal flow** — Left-to-right is the standard for pipelines
- **Clear grouping** — Use subtle background boxes to group related modules
- **Consistent sizing** — Similar components should have similar sizes
- **Balanced whitespace** — Not cramped, not sparse

### Arrow Standards (MOST CRITICAL)
- **Thick strokes** — 4-6px minimum (thin arrows disappear when printed)
- **Clear arrowheads** — Large, filled triangular heads
- **Dark colors** — Black or dark gray (#333333); avoid colored arrows
- **Labeled** — Every arrow should indicate what data flows through it
- **No crossings** — Reorganize layout to avoid arrow crossings
- **CORRECT DIRECTION** — Arrows must point to the RIGHT target!

### Visual Appeal (科研风格 - Professional Academic Style)

**目标：既不保守也不花哨，找到平衡点**

#### ✅ 应该有的视觉元素：
- **Subtle gradient fills** — 淡雅的渐变填充（同色系从浅到深），不是炫彩
- **Rounded corners** — 圆角矩形（6-10px radius），现代感但不夸张
- **Clear visual hierarchy** — 通过大小、颜色深浅区分层次
- **Consistent color coding** — 统一的配色方案（3-4种主色）
- **Internal structure** — 大模块内部显示子组件（如Encoder内部的layer结构）
- **Professional typography** — 清晰的标签，适当的字号层次

#### ✅ 配色建议（学术专业）：
- **Inputs**: 柔和的绿色系 (#10B981 / #34D399)
- **Encoders**: 专业的蓝色系 (#2563EB / #3B82F6)
- **Fusion**: 优雅的紫色系 (#7C3AED / #8B5CF6)
- **Outputs**: 温暖的橙色系 (#EA580C / #F97316)
- **Arrows**: 黑色或深灰 (#333333 / #1F2937)
- **Background**: 纯白 (#FFFFFF)，不要花纹

#### ❌ 要避免的过度装饰：
- ❌ Rainbow color schemes (彩虹配色)
- ❌ Heavy drop shadows (重阴影效果)
- ❌ 3D effects / perspective (3D透视)
- ❌ Excessive gradients (夸张的多色渐变)
- ❌ Clip art / cartoon icons (卡通图标)
- ❌ Decorative patterns in background (背景花纹)
- ❌ Glowing effects (发光效果)
- ❌ Too many small icons (过多小图标)

#### ✓ 理想的视觉效果：
- 一眼看上去**专业、清晰**
- 有**适度的视觉吸引力**，但不抢眼
- 符合**CVPR/NeurIPS论文**的审美标准
- **打印友好**（灰度模式下也能清晰辨认）
- 像**精心设计**的学术图表，而不是PPT模板

### What to AVOID (CRITICAL)
- ❌ Rainbow color schemes (too many colors)
- ❌ Thin, hairline arrows (arrows must be THICK)
- ❌ Unlabeled connections
- ❌ Plain boring rectangles (add some visual interest)
- ❌ **Over-decorated with shadows/glows/icons** (too flashy)
- ❌ Small text that's unreadable when printed
- ❌ **WRONG arrow directions** — This is UNACCEPTABLE!

## Scope

| Figure Type | Quality | Examples |
|-------------|---------|----------|
| **Architecture diagrams** | Excellent | Model architecture, pipeline, encoder-decoder |
| **Method illustrations** | Excellent | Conceptual diagrams, algorithm flowcharts |
| **Conceptual figures** | Good | Comparison diagrams, taxonomy trees |

**Not for:** Statistical plots (use `/paper-figure`), photo-realistic images

## Workflow: MUST EXECUTE ALL STEPS

### Step 0: Pre-flight Check

The built-in Codex ImageGen tool is the required renderer. It requires no API key and must be used directly rather than through an HTTP endpoint or one-off SDK script.

Create the output directory before planning:

```bash
mkdir -p figures/ai-illustration
```

For a project-bound illustration, the selected generated image must be copied from the Codex generated-images location into `figures/ai-illustration/`. Never leave the only project copy in the generated-images cache.

### Step 1: Codex Plans the Figure (YOU ARE HERE)

**CRITICAL: Codex must first analyze the user's request and create a detailed prompt.**

Parse the input: **$ARGUMENTS**

Codex's task:
1. Understand what figure the user wants
2. Identify all components, connections, data flow
3. Create a **detailed, structured prompt** for Codex
4. Include style requirements AND visual appeal requirements

**Prompt Template for Codex to generate:**

```
Create a PROFESSIONAL, VISUALLY APPEALING publication-quality academic diagram following CVPR/ICLR/NeurIPS standards.

## Visual Style: 科研风格 (Academic Professional Style)
### 目标：平衡 — 既不保守也不花哨

#### DO (应该有):
- **Subtle gradients** — 同色系淡雅渐变（如 #2563EB → #3B82F6），不是多色炫彩
- **Rounded corners** — 圆角矩形（6-10px），现代感
- **Clear visual hierarchy** — 通过大小、深浅区分层次
- **Internal structure** — 大模块内显示子组件结构
- **Consistent color coding** — 统一的3-4色方案
- **Professional polish** — 精致但不夸张

#### DON'T (不要有):
- ❌ Rainbow/multi-color gradients (彩虹渐变)
- ❌ Heavy drop shadows (重阴影)
- ❌ 3D effects / perspective (3D效果)
- ❌ Glowing effects (发光效果)
- ❌ Excessive decorative icons (过多装饰图标)
- ❌ Plain boring rectangles (完全平淡的方块)

#### 理想效果：
像顶会论文中精心设计的架构图 — 专业、清晰、有适度的视觉吸引力

## Figure Type
[Architecture Diagram / Pipeline / Comparison / etc.]

## Components to Include (BE SPECIFIC ABOUT CONTENT)
1. [Component 1]:
   - Label: "[exact text]"
   - Sub-label: "[smaller text below]"
   - Position: [left/center/right, top/middle/bottom]
   - Style: [border color, fill, internal structure]
2. [Component 2]: ...

## Layout
- Direction: [left-to-right / top-to-bottom]
- Spacing: [tight / normal / loose]
- Grouping: [how components should be grouped]

## Connections (BE EXPLICIT ABOUT DIRECTION)
EXACT arrow specifications:
1. [Component A] → [Component B]: Arrow goes FROM A TO B, label it "[data type]"
2. [Component C] → [Component D]: Arrow goes FROM C TO D, label it "[data type]"
...
VERIFY: Each arrow must point to the CORRECT target!

## Style Requirements (CVPR/ICLR/NeurIPS Standard)

### Visual Style
- Color palette: Professional academic colors
  - Inputs: Green (#10B981)
  - Encoders: Blue (#2563EB)
  - Fusion modules: Purple (#7C3AED)
  - Outputs: Orange (#EA580C)
- Font: Sans-serif (Arial/Helvetica), minimum 14pt, bold for labels
- Background: Clean white, no patterns
- Blocks: Rounded rectangles (8-12px radius), subtle gradient fill, colored border (2-3px)
- Subtle shadows for depth effect
- Print-friendly (must work in grayscale)

### CRITICAL: Arrow & Data Flow Requirements
1. **ALL arrows must be VERY THICK** - minimum 5-6px stroke width
2. **ALL arrows must have CLEAR arrowheads** - large, visible triangular heads
3. **ALL arrows must be BLACK or DARK GRAY** - not colored
4. **Label EVERY arrow** with what data flows through it
5. **VERIFY arrow direction** - each arrow MUST point to the correct target
6. **No ambiguous connections** - every arrow should have a clear source and destination

### Logic Clarity Requirements
1. **Data flow must be immediately obvious** - viewer should understand the pipeline in 5 seconds
2. **No crossing arrows** - reorganize layout to avoid arrow crossings
3. **Consistent direction** - maintain left-to-right or top-to-bottom flow throughout
4. **Group related components** - use subtle background boxes or spacing to group modules
5. **Clear hierarchy** - main components larger, sub-components smaller

## Additional Requirements
[Any specific requirements from user]
```

### Step 2: Codex Layout Optimization

Codex performs the layout-optimization pass itself. Using the initial prompt from Step 1, produce `figures/ai-illustration/layout_description.txt` with:

- exact component positions and relative sizes;
- grouping, alignment, whitespace, and visual hierarchy;
- every connection with explicit source, target, direction, label, and routing;
- measures to prevent crossings, ambiguity, clipping, and unreadable text;
- the intended reading order at normal paper-placement size.

Do not remove components or weaken the scientific logic while optimizing the layout.

### Step 3: Codex Academic Style Verification

Codex audits the optimized layout against every CVPR/ICLR/NeurIPS visual rule above. Write `figures/ai-illustration/style_spec.txt` containing the approved palette, typography, border and arrow treatments, background, emphasis hierarchy, and explicit prohibitions. Resolve style conflicts before rendering; do not merely list them.

Combine the Step 1 prompt, the layout description, and the style specification into `figures/ai-illustration/final_prompt.txt`. Preserve all exact labels and scientific relationships.

### Step 4: Render with Codex Built-in ImageGen

Use the built-in `image_gen` tool in generation mode with the complete contents of `final_prompt.txt`. Do not use an external image endpoint, an API key, the fallback CLI, or a one-off SDK runner.

The image request must identify the asset as a scientific-educational or infographic-diagram figure and repeat these invariants:

- exact components, labels, connections, and arrow directions;
- clean academic white background and balanced professional styling;
- no watermark, logo, fake numerical evidence, glossy 3D, clip-art collage, or decorative mechanism;
- readable text and arrowheads at final paper-placement size;
- no unrequested objects or claims.

After generation, inspect the returned image, copy it non-destructively into the project as `figures/ai-illustration/figure_v1.png`, and record that the provider was Codex built-in ImageGen. For later iterations use `figure_v2.png`, `figure_v3.png`, and so on.

### Step 5: Codex STRICT Visual Review & Scoring (MANDATORY)

**Codex MUST read the generated image and perform a STRICT review:**

1. **Visual Analysis**: What does the image show in detail?
2. **Strengths**: What's good about it?
3. **STRICT Verification**: Check EVERY item below
4. **Score**: Rate 1-10 (10 = perfect) — BE STRICT!

**STRICT Review Template:**

```markdown
## Codex's STRICT Review of Figure v{N}

### What I See
[Describe the generated image in DETAIL - every block, every arrow]

### Strengths
- [Strength 1]
- [Strength 2]

### ═══════════════════════════════════════════════════════════════
### STRICT VERIFICATION CHECKLIST (ALL must pass for score ≥ 9)
### ═══════════════════════════════════════════════════════════════

#### A. Arrow Correctness Verification (CRITICAL - any failure = score ≤ 6)
Check EACH arrow:
- [ ] Arrow 1: [Source] → [Target] — Does it point to the CORRECT target?
- [ ] Arrow 2: [Source] → [Target] — Does it point to the CORRECT target?
- [ ] Arrow 3: [Source] → [Target] — Does it point to the CORRECT target?
- [ ] Arrow 4: [Source] → [Target] — Does it point to the CORRECT target?
- [ ] Arrow 5: [Source] → [Target] — Does it point to the CORRECT target?
- [ ] Arrow 6: [Source] → [Target] — Does it point to the CORRECT target?

#### B. Block Content Verification (any failure = score ≤ 7)
Check EACH block:
- [ ] Block 1 "[Name]": Has correct label? Has sub-label? Content correct?
- [ ] Block 2 "[Name]": Has correct label? Has sub-label? Content correct?
- [ ] Block 3 "[Name]": Has correct label? Has sub-label? Content correct?
- [ ] Block 4 "[Name]": Has correct label? Has sub-label? Content correct?
- [ ] Block 5 "[Name]": Has correct label? Has sub-label? Content correct?
- [ ] Block 6 "[Name]": Has correct label? Has sub-label? Content correct?
- [ ] Block 7 "[Name]": Has correct label? Has sub-label? Content correct?

#### C. Arrow Visibility (any failure = score ≤ 7)
- [ ] ALL arrows are THICK (≥5px visible stroke)
- [ ] ALL arrows have CLEAR arrowheads (large triangular heads)
- [ ] ALL arrows are BLACK or DARK GRAY (not light colors)
- [ ] NO arrows are too thin or invisible

#### D. Arrow Labels (any failure = score ≤ 7)
- [ ] EVERY arrow has a text label
- [ ] Labels are readable (not too small)
- [ ] Labels correctly describe the data flowing

#### E. Visual Appeal (科研风格 - Balanced Academic Style) (any failure = score ≤ 8)
- [ ] **有适度视觉吸引力** — 有subtle渐变或圆角，但不夸张
- [ ] **不是平淡方块** — 有一定设计感
- [ ] **不过度装饰** — 没有重阴影、发光效果、彩虹配色
- [ ] **专业学术风格** — 像CVPR论文中的图表，不是PPT模板
- [ ] **Internal structure visible** — 大模块内部显示子组件结构
- [ ] **Color palette: 3-4种协调色** — 不是彩虹，也不是纯黑白

#### E2. Visual Appeal - RED FLAGS (immediate score ≤ 7 if found)
- [ ] **NO heavy drop shadows** (重阴影 = too flashy)
- [ ] **NO glowing effects** (发光效果 = too flashy)
- [ ] **NO rainbow gradients** (彩虹渐变 = unprofessional)
- [ ] **NO excessive decorative icons** (过多装饰图标 = distracting)

#### F. Layout & Flow (any failure = score ≤ 7)
- [ ] Clean horizontal left-to-right flow
- [ ] No arrow crossings
- [ ] Data flow traceable in 5 seconds
- [ ] Balanced spacing (not cramped, not sparse)

#### G. Style Compliance
- [ ] CVPR/NeurIPS professional style
- [ ] Color palette appropriate (not rainbow)
- [ ] Font readable
- [ ] Print-friendly (grayscale test)

### ═══════════════════════════════════════════════════════════════

### Issues Found (BE SPECIFIC)
1. [Issue 1]: [EXACTLY what is wrong] → [How to fix]
2. [Issue 2]: [EXACTLY what is wrong] → [How to fix]
3. [Issue 3]: [EXACTLY what is wrong] → [How to fix]

### Score: X/10

### STRICT Score Breakdown Guide:
- **10**: Perfect. No issues. Publication-ready masterpiece. 视觉风格完美平衡。
- **9**: Excellent. Minor issues that don't affect understanding. 可以直接使用。
- **8**: Good but has noticeable issues. 视觉上太平淡或太花哨都需要改进。
- **7**: Usable but has clear problems. 箭头或内容有问题。
- **6**: Has arrow direction errors (箭头指向错误) OR missing major components.
- **1-5**: Major issues. Unacceptable.

### Visual Style Scoring (视觉风格评分):
- **太花哨 (Too flashy)**: 重阴影、发光效果、彩虹配色 → score ≤ 7
- **太平淡 (Too plain)**: 纯黑白方块、无任何视觉设计 → score ≤ 8
- **恰到好处 (Balanced)**: 适度渐变、圆角、清晰层次 → score 9-10

### Verdict
[ ] ACCEPT (score ≥ 9 AND all critical checks pass)
[ ] REFINE (score < 9 OR any critical check fails)

**If REFINE: List the EXACT issues that must be fixed**
```

### Step 6: Decision Point

```
IF score >= 9 AND all critical checks pass:
    → Accept figure, generate LaTeX snippet, DONE
ELSE IF iteration < MAX_ITERATIONS:
    → Generate SPECIFIC improvement prompt based on EXACT issues
    → Go to Step 2 (Codex Layout) with refined prompt
ELSE:
    → Max iterations reached, show best version
    → Ask user if they want to continue or accept
```

### Step 7: Generate Improvement Prompt (for refinement)

**Codex generates TARGETED improvement prompt with EXACT issues:**

```
Refine this academic diagram. This is iteration {N}.

## ═══════════════════════════════════════════════════════════════
## CRITICAL: Fix These EXACT Issues (from previous review)
## ═══════════════════════════════════════════════════════════════

### Arrow Direction Errors (MUST FIX):
1. [EXACT issue]: Arrow from [A] to [B] is pointing to wrong target. It should point to [C] instead.
2. [EXACT issue]: ...

### Missing Arrow Labels (MUST FIX):
1. Arrow from [A] to [B] is missing label "[data type]"
2. ...

### Block Content Issues (MUST FIX):
1. Block "[Name]" has wrong label. Should be "[correct label]"
2. ...

### Visual Appeal Issues (SHOULD FIX):
1. Blocks are too plain. Add [gradients/shadows/internal structure]
2. ...

## Keep These Good Elements:
- [What to preserve from previous version]

## Generate the improved figure with ALL issues fixed.
```

### Step 8: Final Output

When figure is accepted (score ≥ 9):

```latex
% === AI-Generated Figure ===
\begin{figure*}[t]
    \centering
    \includegraphics[width=0.95\textwidth]{figures/ai_generated/figure_final.png}
    \caption{[Caption based on user's original request].}
    \label{fig:[label]}
\end{figure*}
```

## Key Rules (MUST FOLLOW - STRICT)

1. **NEVER skip the review step** — Always read and STRICTLY score the image
2. **NEVER accept score < 9** — Keep refining until excellence
3. **VERIFY EVERY ARROW DIRECTION** — Wrong direction = automatic fail (score ≤ 6)
4. **VERIFY EVERY BLOCK CONTENT** — Wrong content = automatic fail (score ≤ 7)
5. **BE SPECIFIC in feedback** — "Arrow from A to B points to wrong target C" not "arrow is wrong"
6. **SAVE all iterations** — Keep version history for comparison
7. **Codex is the STRICT boss** — Accept only excellence, not "good enough"
8. **ARROW CORRECTNESS IS NON-NEGOTIABLE** — Any wrong arrow direction = reject
9. **VISUAL APPEAL MATTERS** — Plain boring figures = score ≤ 8
10. **Target score is 9** — Not 8, not "good enough"
11. **USE MULTI-STAGE WORKFLOW** — Codex → Codex Layout → Codex Style → Codex ImageGen → Codex Review
12. **USE CORRECT MODELS** — Codex reasoning for reasoning, Codex built-in ImageGen for rendering

## Output Structure

```
figures/ai_generated/
├── layout_description.txt  # Step 2: Codex layout optimization output
├── style_spec.txt          # Step 3: Codex style verification output
├── figure_v1.png           # Iteration 1 (Codex ImageGen render)
├── figure_v2.png           # Iteration 2
├── figure_v3.png           # Iteration 3
├── figure_final.png        # Accepted version (copy of best, score ≥ 9)
├── latex_include.tex       # LaTeX snippet
└── review_log.json         # All review scores and STRICT feedback
```

## Model Summary

| Stage | Model | Purpose |
|-------|-------|---------|
| Step 1 | Codex | Parse request, create initial prompt |
| Step 2 | Codex reasoning | Layout optimization (positioning, spacing, grouping) |
| Step 3 | Codex reasoning | CVPR/NeurIPS style verification |
| Step 4 | Codex built-in ImageGen (Codex ImageGen) | High-quality image rendering |
| Step 5 | Codex | STRICT visual review and scoring |
