/**
 * MH Agent — 截图核心模块（Electron 内嵌 Chromium）
 *
 * 被主进程以「截图模式」调用：主程序.exe --mh-capture <config.json>
 * 只做截图，不启动正常应用（不碰 license / 后端 / 托盘）。
 *
 * config.json 结构：
 * {
 *   "viewport": { "width": 1280, "height": 800 },   // 可选，默认 1280x800
 *   "resultPath": "C:/.../result.json",              // 可选，把逐张结果写到这里(供后端读)
 *   "targets": [
 *     {
 *       "url": "http://127.0.0.1:19001/",            // 或 "file": "D:/.../index.html"
 *       "out": "D:/.../figures/shot_home.png",       // 输出绝对路径(.png 截图 / .pdf 矢量)
 *       "format": "png",                             // 可选，"png"(默认) 或 "pdf"；缺省时按 out 后缀推断
 *       "waitMs": 1200,                              // 可选，加载后额外等待渲染(默认 1000)
 *       "waitForSelector": ".app-ready",             // 可选，等某元素出现再截(优先于 waitMs 的下限)
 *       "fullPage": false                            // 可选(仅 png)，整页截图(超出视口滚动)，默认 false
 *     }
 *   ]
 * }
 *
 * ⛔ format=pdf：用 Electron 原生 printToPDF 出「矢量 PDF」——量内容真实像素→页面尺寸设成
 *    刚好等于内容(px÷96=inch)→margins 归零→单页无白边、文字是真矢量(可选可搜、无限放大不糊)。
 *    等效 drawio 的 --crop，供论文 \includegraphics 直接引用。
 *
 * 退出码：0 = 全部成功；1 = 有失败(stderr 输出明细 + resultPath JSON)；3 = 配置/致命错误
 */
'use strict';

const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

// 无头 / 无 GPU 环境更稳（服务器、后台、部分国产机型）
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

const DEFAULT_VIEWPORT = { width: 1280, height: 800 };
const LOAD_TIMEOUT_MS = 15000;   // 单页 loadURL 超时
const DEFAULT_WAIT_MS = 1000;    // 加载后默认等待渲染

// KaTeX 离线素材目录（与 capture.js 同级，打包后一并进 resources/app/）
// ⛔ 不放 skills/ 下：skills 会被 AES 加密成 .enc，file:// 引用不到。
//    这里 3 个文件是明文，capture.js 用 __dirname 直接读，注入进被截页面。
const KATEX_DIR = path.join(__dirname, 'katex-assets');
// 惰性缓存：一次进程可能顺序截多张公式图，只读一次盘
let _katexAssets = undefined;   // undefined=没试过；null=不可用；{css,js,autoRender}=可用

function loadKatexAssets() {
  if (_katexAssets !== undefined) return _katexAssets;
  try {
    const css = fs.readFileSync(path.join(KATEX_DIR, 'katex.embedded.css'), 'utf-8');
    const js = fs.readFileSync(path.join(KATEX_DIR, 'katex.min.js'), 'utf-8');
    const autoRender = fs.readFileSync(path.join(KATEX_DIR, 'auto-render.min.js'), 'utf-8');
    _katexAssets = { css, js, autoRender };
  } catch (e) {
    console.error('KATEX_ASSETS_MISSING: ' + e.message + ' (公式将不渲染，图仍会出)');
    _katexAssets = null;
  }
  return _katexAssets;
}

// 在被截页面里注入 KaTeX 并渲染 \(...\) / \[...\] / $$...$$。
// ⛔ 必须在「量尺寸 / printToPDF」之前完成：公式渲染会改变内容高宽，
//    先渲染再测量才不会截断或留白。字体等 document.fonts.ready 保证不糊。
async function renderMathIn(win) {
  const assets = loadKatexAssets();
  if (!assets) return false;   // 素材缺失：降级，不阻断出图
  // 1) 注入自包含 CSS（字体已 base64 内联，无外部依赖）
  await win.webContents.executeJavaScript(
    `(function(){var s=document.createElement('style');s.textContent=${JSON.stringify(assets.css)};document.head.appendChild(s);})()`,
    true
  );
  // 2) 注入 katex 主库 + auto-render（UMD，浏览器里挂 window.katex / window.renderMathInElement）
  await win.webContents.executeJavaScript(assets.js, true);
  await win.webContents.executeJavaScript(assets.autoRender, true);
  // 3) 渲染 + 等字体加载完（返回 promise，executeJavaScript 会等它 resolve）
  await win.webContents.executeJavaScript(`
    (async function(){
      if (typeof window.renderMathInElement !== 'function') return false;
      window.renderMathInElement(document.body, {
        delimiters: [
          {left: '$$', right: '$$', display: true},
          {left: '\\\\[', right: '\\\\]', display: true},
          {left: '\\\\(', right: '\\\\)', display: false},
          {left: '$', right: '$', display: false}
        ],
        throwOnError: false,
        ignoredTags: ['script','noscript','style','textarea','pre','code']
      });
      if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch(e){} }
      return true;
    })()
  `, true);
  return true;
}

// ===== 元素级几何自检探针 =====
// 纯几何、不看图：量 .fig 内所有「直接含文字」的元素盒，判定三类翻车：
//   ① overflow  文字溢出被裁(scrollW/H > clientW/H + 容差)
//   ② clip      元素越出 .fig 边界(被论文页面裁掉)
//   ③ overlap   两个同级文字块几何相交(内容互相压盖)
// ⛔ 必须在 renderMath 之后跑：公式渲染会改变盒尺寸，先渲染再测量才准。
// 容差 GEOM_TOL：滤掉图标字形"行高比盒高多几px"这类字体噪声(实测约 3px)，
//   取 6px 既滤噪声又能抓住真实文字截断。
const GEOM_TOL = 6;
// 对齐容差 ALIGN_TOL：声明式对齐检测(下方 ④)用。grid 锁的组极差通常 0-1px，
//   手写 width/margin 硬凑的参差会明显超过；取 4px 既滤 subpixel 渲染噪声、又抓真错位。
const ALIGN_TOL = 4;
const GEOM_PROBE = `(function(){
  var TOL=${GEOM_TOL}, ATOL=${ALIGN_TOL};
  var fig=document.querySelector('.fig');
  if(!fig) return {error:'no .fig'};
  var F=fig.getBoundingClientRect();
  function directText(el){for(var i=0;i<el.childNodes.length;i++){var n=el.childNodes[i];
    if(n.nodeType===3 && n.textContent.trim().length>0) return true;} return false;}
  // ⛔ KaTeX 每条公式会同时产出「可见 HTML」+「视觉隐藏的 .katex-mathml 副本」(裁到 1px)。
  //    MathML 子孙仍报完整布局盒，若计入会让每个公式字形与其 HTML 版重复→假重叠/假溢出，
  //    使含公式的图永远过不了自检。故跳过 .katex-mathml 整棵子树（它本就不可见，不影响观感）。
  function inHiddenMath(el){for(var p=el;p&&p!==fig;p=p.parentElement){
    if(p.classList&&p.classList.contains('katex-mathml')) return true;} return false;}
  var blocks=[], all=fig.querySelectorAll('*');
  for(var i=0;i<all.length;i++){var el=all[i];
    if(!directText(el)) continue;
    if(inHiddenMath(el)) continue;
    var r=el.getBoundingClientRect();
    if(r.width<1||r.height<1) continue;
    blocks.push({el:el,r:r,txt:el.textContent.trim().replace(/\\s+/g,' ').slice(0,20)});
  }
  var overflow=[],clip=[],overlap=[];
  for(var k=0;k<blocks.length;k++){var b=blocks[k],e=b.el;
    if(e.scrollWidth>e.clientWidth+TOL||e.scrollHeight>e.clientHeight+TOL)
      overflow.push({txt:b.txt,sw:e.scrollWidth,cw:e.clientWidth,sh:e.scrollHeight,ch:e.clientHeight});
    var r=b.r;
    var ol=F.left-r.left, ot=F.top-r.top, orr=r.right-F.right, ob=r.bottom-F.bottom;
    if(ol>TOL||ot>TOL||orr>TOL||ob>TOL)
      clip.push({txt:b.txt,left:Math.round(ol),top:Math.round(ot),right:Math.round(orr),bottom:Math.round(ob)});
  }
  for(var i=0;i<blocks.length;i++)for(var j=i+1;j<blocks.length;j++){
    var a=blocks[i],c=blocks[j];
    if(a.el.contains(c.el)||c.el.contains(a.el)) continue;
    var ix=Math.min(a.r.right,c.r.right)-Math.max(a.r.left,c.r.left);
    var iy=Math.min(a.r.bottom,c.r.bottom)-Math.max(a.r.top,c.r.top);
    if(ix>TOL&&iy>TOL) overlap.push({a:a.txt,b:c.txt,area:Math.round(ix*iy)});
  }
  // ④ 声明式对齐检测（geom-check 抓不出「参差不齐」的精细偏差 → 让作图时显式声明对齐意图）：
  //    data-mh-col="k" 的元素应竖直成一列（中轴 x 一致）；data-mh-row="k" 应水平成一行（中轴 y 一致）。
  //    ⛔ 只测被显式标记的元素——没打标记的图这里恒空 → 与旧行为完全一致，零回归。
  //    连线（竖箭头/横挂线的 div，本身无文字不进 blocks）也可打同一 col/row → 直接验证「端点接节点中轴」。
  var misalign=[];
  function checkAlign(attr, axis){
    // axis: 'x' 量中轴横坐标(同列竖直对齐) / 'y' 量中轴纵坐标(同行水平对齐)
    // ⛔ groups 用无原型对象：否则 data-mh-col="__proto__"/"constructor" 等键会命中
    //    Object.prototype 上的属性(取到的不是数组)，push 抛异常 → 整个探针崩(geom_probe_failed)。
    var marked=fig.querySelectorAll('['+attr+']'), groups=Object.create(null);
    for(var i=0;i<marked.length;i++){var el=marked[i];
      if(inHiddenMath(el)) continue;
      var r=el.getBoundingClientRect();
      if(r.width<1||r.height<1) continue;
      var key=el.getAttribute(attr); if(key==null||key==='') continue;
      var center = axis==='x' ? (r.left+r.right)/2 : (r.top+r.bottom)/2;
      var lbl=(el.textContent||'').trim().replace(/\\s+/g,' ').slice(0,16) || ('<'+el.tagName.toLowerCase()+'>');
      (groups[key]||(groups[key]=[])).push({c:center,lbl:lbl});
    }
    for(var k in groups){   // groups 无原型(Object.create(null))，for-in 只遍历自身键，无需 hasOwnProperty 防护
      var g=groups[k]; if(g.length<2) continue;   // 单成员无从谈对齐
      var mn=g[0].c, mx=g[0].c;
      for(var m=1;m<g.length;m++){if(g[m].c<mn)mn=g[m].c; if(g[m].c>mx)mx=g[m].c;}
      var spread=mx-mn;
      if(spread>ATOL){
        var names=[]; for(var m=0;m<g.length&&m<4;m++) names.push(g[m].lbl);
        misalign.push({attr:attr,group:k,axis:axis,spread:Math.round(spread),count:g.length,members:names});
      }
    }
  }
  checkAlign('data-mh-col','x');   // 同列 → 中轴横坐标应一致
  checkAlign('data-mh-row','y');   // 同行 → 中轴纵坐标应一致
  return {fig:{w:Math.round(F.width),h:Math.round(F.height)},blocks:blocks.length,
    overflow:overflow,clip:clip,overlap:overlap,misalign:misalign};
})()`;

// 在已加载(且已 renderMath)的窗口里跑几何探针，返回报告对象。
async function geomCheckIn(win) {
  return await win.webContents.executeJavaScript(GEOM_PROBE, true);
}

function readConfig() {
  const idx = process.argv.indexOf('--mh-capture');
  const cfgPath = idx >= 0 ? process.argv[idx + 1] : null;
  if (!cfgPath || !fs.existsSync(cfgPath)) {
    throw new Error('capture config not found: ' + cfgPath);
  }
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
  if (!cfg || !Array.isArray(cfg.targets) || cfg.targets.length === 0) {
    throw new Error('capture config has no targets');
  }
  return cfg;
}

// 带超时的页面加载：loadURL 卡住不返回时不至于永久挂起
function loadWithTimeout(win, url, isFile) {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) { done = true; reject(new Error('load timeout: ' + url)); }
    }, LOAD_TIMEOUT_MS);
    const p = isFile ? win.loadFile(url) : win.loadURL(url);
    p.then(() => {
      if (!done) { done = true; clearTimeout(timer); resolve(); }
    }).catch((e) => {
      if (!done) { done = true; clearTimeout(timer); reject(e); }
    });
  });
}

// 等某元素出现（异步渲染的页面用），最多等 maxMs
async function waitForSelector(win, selector, maxMs) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const found = await win.webContents.executeJavaScript(
        `!!document.querySelector(${JSON.stringify(selector)})`, true
      );
      if (found) return true;
    } catch (_) { /* 页面还没就绪，忽略 */ }
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}

// 截单张图（复用传入的窗口，失败抛错，由主循环隔离）
// ⛔ 用单窗口顺序截，不反复 new/destroy BrowserWindow —— 实测反复创建销毁会让第二张起
//    ERR_FAILED(窗口生命周期竞争)。复用一个隐藏窗口顺序 loadURL 最稳。
// 判定目标输出格式：显式 format 优先，否则按 out 后缀推断（.pdf → pdf，其余 → png）
function resolveFormat(target) {
  const fmt = (target.format || '').toLowerCase();
  if (fmt === 'pdf' || fmt === 'png') return fmt;
  return String(target.out || '').toLowerCase().endsWith('.pdf') ? 'pdf' : 'png';
}

async function captureOne(win, target, viewport) {
  const url = target.url || target.file;
  const isFile = !target.url && !!target.file;
  if (!url) throw new Error('target 缺 url/file');
  // 几何自检可以「只测量不出图」：此时不强制 out。其余场景仍需 out。
  const geomOnly = target.geomCheck && !target.out;
  if (!target.out && !geomOnly) throw new Error('target 缺 out');

  const format = resolveFormat(target);

  // 每张截图前把窗口尺寸复位到视口（上一张 fullPage 可能改过高度）
  win.setContentSize(viewport.width, viewport.height);

  await loadWithTimeout(win, url, isFile);
  // 先等 selector（若指定），再补足最小等待时间让样式/图片渲染完
  if (target.waitForSelector) {
    await waitForSelector(win, target.waitForSelector, LOAD_TIMEOUT_MS);
  }
  await new Promise(r => setTimeout(r, target.waitMs || DEFAULT_WAIT_MS));

  // 公式图：注入 KaTeX 渲染 \(...\)/\[...\]/$$。必须在测量/截图前完成。
  if (target.renderMath) {
    try {
      await renderMathIn(win);
      // 渲染后布局可能变化，补一小段稳定时间让回流 + 字体应用到位
      await new Promise(r => setTimeout(r, 250));
    } catch (e) {
      console.error('KATEX_RENDER_FAIL: ' + e.message + ' (图仍会出，公式可能未渲染)');
    }
  }

  // 几何自检：在 renderMath 之后测量(公式已改变盒尺寸)。
  let geom = null;
  if (target.geomCheck) {
    try {
      geom = await geomCheckIn(win);
    } catch (e) {
      geom = { error: 'geom_probe_failed: ' + e.message };
    }
    // 只测量不出图：直接返回几何报告，不写文件。
    if (geomOnly) {
      return { out: null, geom: geom };
    }
  }

  fs.mkdirSync(path.dirname(target.out), { recursive: true });

  // ===== PDF 分支：矢量、单页、无白边 =====
  if (format === 'pdf') {
    const pr = await capturePdf(win, target);
    if (geom) pr.geom = geom;
    return pr;
  }

  // ===== PNG 分支 =====
  // ⛔ 关键：capturePage() 不带参数会截【整个固定宽度视口(1280)】——内容(.fig)只占左侧时，
  //    右侧留大白边（这正是 HTML 流程图 PNG 右侧空白的根因）。PDF 分支早已量 .fig 真实边界
  //    做到无白边，PNG 分支此前漏修。这里复用同源逻辑：量 .fig 的 getBoundingClientRect →
  //    先把窗口撑到能容纳完整内容(含左上偏移) → capturePage(rect) 精确裁到内容区。
  //    无 .fig 的普通页面截图(如前端 UI shot_*.png)保留原 fullPage 整页行为，不受影响。
  // ⛔ 仅当 .fig 是「整张页面的主体」时才按它裁——否则误伤：UI/操作手册截图(shot_*.png)
  //    的页面里若恰好嵌了个 class="fig" 的小元素，会被裁成只剩那个小元素而非整页。
  //    判据：流程图 HTML 由 SKILL 硬约束 `html,body{width:fit-content}` → body 收缩到内容大小
  //    → .fig 宽≈body 宽(占比≥0.9)；而 UI 页面 body 撑满视口，内嵌小 .fig 占比很低 → 不裁、回退整窗。
  let figBox = null;
  try {
    figBox = await win.webContents.executeJavaScript(`
      (function(){
        var f=document.querySelector('.fig'); if(!f) return null;
        var r=f.getBoundingClientRect();
        if(r.width<1||r.height<1) return null;
        // 只有 .fig 撑起整个 body(fit-content 流程图特征)才认；UI 页面里的小 .fig 不认
        var bw=document.body ? document.body.getBoundingClientRect().width : 0;
        if(bw>0 && r.width/bw < 0.9) return null;   // .fig 只占 body 一小块 → 不是流程图主体
        // right/bottom 含任何左上偏移；left/top 作为裁剪原点
        return {left:r.left, top:r.top, right:r.right, bottom:r.bottom,
                width:r.width, height:r.height};
      })()
    `, true);
  } catch (_) { figBox = null; }

  if (figBox) {
    // 有 .fig：把窗口撑到内容右下边界，保证 capturePage 的裁剪矩形完全落在可视区内
    try {
      const needW = Math.min(Math.max(Math.ceil(figBox.right), viewport.width), 8000);
      const needH = Math.min(Math.max(Math.ceil(figBox.bottom), viewport.height), 8000);
      win.setContentSize(needW, needH);
      await new Promise(r => setTimeout(r, 300));
    } catch (_) { /* resize 失败则按现窗口裁，最坏截不全，仍比留白好 */ }
  } else if (target.fullPage) {
    // 无 .fig 的整页截图：保留原逻辑，只把高度拉到内容高度
    try {
      const h = await win.webContents.executeJavaScript(
        'Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)', true
      );
      if (h && h > viewport.height) {
        win.setContentSize(viewport.width, Math.min(Math.ceil(h), 8000));
        await new Promise(r => setTimeout(r, 300));
      }
    } catch (_) { /* 拿不到高度就按视口截 */ }
  }

  // 有 .fig：resize 后重新量一次真实边界（回流可能微调），裁剪到内容区
  let rect = null;
  if (figBox) {
    try {
      rect = await win.webContents.executeJavaScript(`
        (function(){
          var f=document.querySelector('.fig'); if(!f) return null;
          var r=f.getBoundingClientRect();
          if(r.width<1||r.height<1) return null;
          return {x:Math.max(0,Math.floor(r.left)), y:Math.max(0,Math.floor(r.top)),
                  width:Math.ceil(r.width), height:Math.ceil(r.height)};
        })()
      `, true);
    } catch (_) { rect = null; }
  }

  // rect 有效则裁到内容区（无白边）；否则回退整窗截图（原行为）
  const img = (rect && rect.width > 0 && rect.height > 0)
    ? await win.webContents.capturePage(rect)
    : await win.webContents.capturePage();
  const png = img.toPNG();
  if (!png || png.length < 1000) {
    throw new Error('captured image too small (likely blank): ' + png.length + ' bytes');
  }
  fs.writeFileSync(target.out, png);
  return { out: target.out, bytes: png.length, size: img.getSize(), geom: geom || undefined };
}

// PDF 出图：量内容真实像素 → 页面尺寸设成刚好等于内容 → margins 归零 → 单页矢量无白边。
// ⛔ 关键：printToPDF 默认按 A4 纸出，内容比纸小会留白、比纸大会分页(LaTeX 只显示第一页 → 截断)。
//    把 pageSize 设成内容尺寸(px÷96 → inch)可保证「一张图恰好一页、无白边」，等效 drawio --crop。
async function capturePdf(win, target) {
  // 量内容真实像素尺寸（含 padding），向上取整避免边缘被裁掉 1px。
  // ⛔ 不能用 documentElement.scrollWidth/Height：Chromium 里它锁死等于视口(1280×800)，
  //    会把 fit-content 收缩后的真实内容尺寸盖掉 → PDF 页面被撑到视口大小、右侧/底部留大白边。
  //    正确做法：优先量 .fig 容器的真实渲染边界(right/bottom)；无 .fig 才回退到 body 的
  //    scroll/offset(仍不取 documentElement)。
  const dims = await win.webContents.executeJavaScript(`
    (function(){
      var b=document.body, fig=document.querySelector('.fig');
      var w,h;
      if(fig){
        var r=fig.getBoundingClientRect();
        w=r.right; h=r.bottom;   // 量到内容真实右下边界（含任何左上偏移）
      } else {
        w=Math.max(b.scrollWidth, b.offsetWidth, b.clientWidth);
        h=Math.max(b.scrollHeight, b.offsetHeight, b.clientHeight);
      }
      return {w:Math.ceil(w), h:Math.ceil(h)};
    })()
  `, true);

  if (!dims || !dims.w || !dims.h) {
    throw new Error('failed to measure content size for PDF');
  }

  // px → inch（CSS 96dpi）。加 0.02in(≈2px) 余量防浏览器分页阈值把最后一行挤到第 2 页。
  const pageW = dims.w / 96 + 0.02;
  const pageH = dims.h / 96 + 0.02;

  const data = await win.webContents.printToPDF({
    printBackground: true,
    margins: { marginType: 'custom', top: 0, bottom: 0, left: 0, right: 0 },
    pageSize: { width: pageW, height: pageH },
    preferCSSPageSize: false,
  });

  if (!data || data.length < 1000) {
    throw new Error('printToPDF produced too small output (likely blank): ' + (data ? data.length : 0) + ' bytes');
  }
  fs.writeFileSync(target.out, data);
  return { out: target.out, bytes: data.length, size: { width: dims.w, height: dims.h } };
}

async function runCaptureMode() {
  let cfg;
  try {
    cfg = readConfig();
  } catch (e) {
    console.error('CAPTURE_FATAL: ' + e.message);
    app.exit(3);
    return;
  }

  const viewport = cfg.viewport || DEFAULT_VIEWPORT;
  const results = [];
  let anyFail = false;

  // 单个隐藏窗口，顺序截所有目标（避免反复创建销毁窗口的竞争）
  const win = new BrowserWindow({
    width: viewport.width,
    height: viewport.height,
    show: false,
    webPreferences: {
      offscreen: false,
      // 截的是用户生成的项目页面，禁用 node 集成防脚本越权
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  try {
    for (const target of cfg.targets) {
      try {
        const r = await captureOne(win, target, viewport);
        const rec = { ok: true, url: target.url || target.file, out: r.out, bytes: r.bytes };
        if (r.geom) rec.geom = r.geom;
        results.push(rec);
        if (r.out) {
          console.log('CAPTURE_OK: ' + r.out + ' (' + r.bytes + ' bytes)');
        } else {
          console.log('GEOM_CHECK_OK: ' + (target.url || target.file));
        }
      } catch (e) {
        anyFail = true;
        results.push({ ok: false, url: target.url || target.file, out: target.out, error: e.message });
        console.error('CAPTURE_FAIL: ' + (target.out || target.url) + ' — ' + e.message);
      }
    }
  } finally {
    win.destroy();
  }

  // 结果写文件供后端读取（可选）
  if (cfg.resultPath) {
    try {
      fs.mkdirSync(path.dirname(cfg.resultPath), { recursive: true });
      fs.writeFileSync(cfg.resultPath, JSON.stringify({ results }, null, 2), 'utf-8');
    } catch (e) {
      console.error('CAPTURE_RESULT_WRITE_FAIL: ' + e.message);
    }
  }

  console.log('CAPTURE_DONE: ' + results.filter(r => r.ok).length + '/' + results.length + ' succeeded');
  app.exit(anyFail ? 1 : 0);
}

function _start() {
  return app.whenReady().then(runCaptureMode).catch((e) => {
    console.error('CAPTURE_FATAL: ' + (e && e.message)); app.exit(3);
  });
}

// ⛔ 在 Electron 里 `require.main === module` 不可靠(主进程 require.main 行为异于 Node)。
// 用 argv[1](被 electron 加载的脚本) 是否为 capture.js 自己来判断入口场景：
//   - 独立跑 `electron capture.js --mh-capture cfg` → argv[1] 是 capture.js → 自动执行
//   - 打包后 `主exe --mh-capture cfg`(加载 main.js) → argv[1] 是 main.js → 不自动跑，由 main.js 显式调 runCaptureMode()
try {
  const entry = process.argv[1] ? path.basename(process.argv[1]).toLowerCase() : '';
  if (entry === 'capture.js') {
    _start();
  }
} catch (_) { /* ignore */ }

module.exports = { runCaptureMode: _start };

