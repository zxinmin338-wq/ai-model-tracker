# AI Model Tracker — Implementation Spec v3
> 给 AI coding agent(Claude Code)的实施规格说明书。**严格按 Section 11 的 Batch 顺序执行,每个 Batch 完成后必须停下来等用户确认,不允许连续执行多个 Batch。不允许擅自添加 SPEC 没写的功能。**
---
## 1. v3 相比 v2 的变化
| 维度 | v2 | v3 |
|---|---|---|
| 定位 | "对内运营辅助分析工具" | **"免费模型生命周期追踪器"**——监测对象明确为 free + free-to-paid 模型 |
| 监测对象 | 6 个手动配置的模型 | **自动发现机制** + 手动配置 |
| 页面数量 | 4 个 | **5 个**(新增 `/events` 事件管理 UI) |
| 决策辅助 | 无 | **LLM 中文分析模块**(集成在每个图表下方) |
| 视觉 | shadcn 默认 | **统一视觉设计系统**(浅蓝/清透/留白) |
| 已知 bug | — | **修复 /transitions 的 X 轴**(D−7 to D+30,不是 D−7 to D+0) |
| 已遗漏 | — | **补齐首页 + 详情页**(含多时区峰谷) |
**当前实际交付状态:** `/compare` 和 `/transitions` 两个页面已部署,数据采集和 events 表工作正常,**但首页和详情页未完成,且 /transitions 的 X 轴范围有 bug**。
---
## 2. 业务定位(明确化)
**这是一个真实在用的内部工具,服务于 AI 厂商运营团队。**
**核心业务问题:** "我们家的免费模型,应该在什么时机、用什么方式转付费,损失最小?"
**为回答这个问题,工具需要追踪:**
- 所有市面上的 free 模型(自动发现 + 手动配置)
- 所有 free → paid 的历史转换事件(归一化到 D+0 对齐对比)
- 每次转换前后的策略上下文(同厂商新免费模型上线?同期竞品动作?)
**核心交付:数据 + 策略上下文 + 中文判断,而不只是看板。**
---
## 3. Tech Stack(FIXED)
| 层 | 选型 |
|---|---|
| 框架 | Next.js 15(App Router)+ TypeScript |
| 样式 | Tailwind CSS v4 + shadcn/ui |
| 数据库 | Supabase（Postgres）|
| 图表 | Recharts |
| LLM | Anthropic SDK（`@anthropic-ai/sdk`），model `claude-sonnet-4-5` |
| 部署 | Vercel |
| 定时任务 | cron-job.org（外部触发 `/api/fetch`）|
| 字体 | Inter（英文）+ system-ui（中文）|
---
## 4. Database Schema（增量更新）
**已有表（不动）：** `models`, `snapshots`, `events`
**改动 `models` 表：**
```sql
ALTER TABLE models ADD COLUMN discovered_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE models ADD COLUMN current_status TEXT DEFAULT 'free' CHECK (current_status IN ('free', 'paid', 'transitioning', 'deprecated'));
ALTER TABLE models ADD COLUMN region TEXT;  -- 'china' | 'us' | 'europe' | 'other',用于筛选
```
**更新现有 6 个模型的 `color_hex` 为新色板：**（见 Section 6 视觉系统）
**新增 `analysis_cache` 表（用于 LLM 分析缓存）：**
```sql
CREATE TABLE analysis_cache (
  id BIGSERIAL PRIMARY KEY,
  cache_key TEXT UNIQUE NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('compare', 'transitions', 'home', 'model_detail')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_analysis_cache_key ON analysis_cache(cache_key);
CREATE INDEX idx_analysis_cache_expires ON analysis_cache(expires_at);
```
`cache_key` 生成规则：`{scope}:{sha1(JSON.stringify({modelIds, dateRange, metric}))}`,30 分钟过期。
---
## 5. Information Architecture
### 5.1 5 个页面
```
/                     首页：排行榜 + KPI 条 + 今日动态 + 全局分析
/compare              趋势对比：多模型叠加 + event annotation + 分析
/transitions          转付费分析：D+0 对齐归一化曲线 + 历史 case 表
/model/[permaslug]    详情：趋势 + 多时区峰谷 + 事件时间线 + 分析
/events               事件管理：列表 + 增改删 UI
```
### 5.2 顶部导航
文本导航,5 个一级入口,**不要 emoji,不要 icon**。
```
[AI Model Tracker]              首页  趋势对比  转付费分析  事件管理
                                                          （设置）
```
active 状态：文字色 `#1A2332` + 底部 2px `#5B8DEF` 下划线
inactive：文字色 `#6B7785`,无下划线
---
## 6. Visual Design System（统一执行）
**风格基调:** 清透、留白、浅蓝、Linear/Vercel/Stripe 式高级感。**不要 emoji、不要花哨动效、不要 glassmorphism 过度、不要发光/霓虹/科技感特效**。
### 6.1 颜色
```css
/* 文字 */
--color-text-primary:   #1A2332;
--color-text-secondary: #6B7785;
--color-text-tertiary:  #94A0AE;
/* 背景 */
--color-bg-base:    #FAFBFC;       /* 全局顶部 */
--color-bg-bottom:  #F0F4F8;       /* 全局底部,做微弱渐变 */
--color-bg-card:    #FFFFFF;
--color-bg-soft:    #E8EEF7;       /* 浅蓝背景块、active tab */
/* 主色 */
--color-primary:        #5B8DEF;
--color-primary-hover:  #4A7DDF;
--color-border:         #E8EEF7;
/* 模型 series 调色板（6 色,model.color_hex 用这套） */
--series-blue:   #5B8DEF;
--series-purple: #9B7EDE;
--series-pink:   #E85B81;
--series-green:  #54B584;
--series-orange: #F0A856;
--series-teal:   #5BB5C5;
```
**全局背景实现:** `<body>` 上加 `bg-gradient-to-b from-[#FAFBFC] to-[#F0F4F8]`,渐变非常微弱几乎看不出。
### 6.2 字体
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
```
```css
font-family: 'Inter', system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif;
```
字重只用 3 档：`400` / `500` / `600`。
### 6.3 字号层级
- 页面主标题: `text-3xl font-semibold tracking-tight`（text color: primary）
- 区块标题: `text-sm font-medium uppercase tracking-wider text-secondary`（卡片顶部小标题）
- 卡片标题: `text-xl font-semibold`（主标题）
- 副标题/描述: `text-base font-normal text-secondary`
- 数据数字: `text-2xl font-semibold`（KPI 用）
- 表格正文: `text-sm font-normal`
- 标签/徽章: `text-xs font-medium`
### 6.4 间距系统
只用 4 的倍数：`4 / 8 / 12 / 16 / 24 / 32 / 48 / 64`（对应 Tailwind `1 / 2 / 3 / 4 / 6 / 8 / 12 / 16`）。
- 页面主内容左右 padding: `48px`（`px-12`）
- 卡片之间垂直间距: `24px`（`space-y-6`）
- 卡片内 padding: `32px`（`p-8`）
- 卡片顶部小标题与主标题之间: `4px`（`mt-1`）
- 主标题与卡片内容之间: `24px`（`mt-6`）
### 6.5 卡片样式
```css
.card {
  background: #FFFFFF;
  border: 1px solid #E8EEF7;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  padding: 32px;
}
```
**不要用更强的阴影**,不要圆角超过 12px。
### 6.6 按钮
```css
/* 主按钮 */
.btn-primary {
  background: #5B8DEF;
  color: #FFFFFF;
  border-radius: 8px;
  padding: 10px 20px;
  font-weight: 500;
  font-size: 14px;
}
.btn-primary:hover { background: #4A7DDF; }
/* 次按钮 */
.btn-secondary {
  background: #FFFFFF;
  color: #5B8DEF;
  border: 1px solid #5B8DEF;
  border-radius: 8px;
  padding: 10px 20px;
}
```
### 6.7 顶部导航
```css
.navbar {
  position: sticky;
  top: 0;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid #E8EEF7;
  padding: 16px 48px;
  z-index: 50;
}
```
**Logo 区域:** 纯文字 "AI Model Tracker",字重 600,**不要任何图标或 emoji**。
### 6.8 Checkbox & Tab
- Checkbox 选中色：`#5B8DEF`（不要默认黑）
- Tab active：背景 `#E8EEF7` + 文字 `#1A2332`
- Tab inactive：背景透明 + 文字 `#6B7785`
### 6.9 图表（Recharts）
```typescript
const CHART_THEME = {
  gridStroke: '#F0F4F8',       // 几乎隐形的网格线
  axisStroke: '#E8EEF7',
  axisTextFill: '#6B7785',
  axisFontSize: 12,
  tooltipBg: '#FFFFFF',
  tooltipBorder: '#E8EEF7',
  referenceLineStroke: '#94A0AE',  // event annotation 默认色
};
```
模型 series 颜色统一使用 Section 6.1 调色板,**禁止使用过艳的纯红、纯蓝、纯绿**。
### 6.10 不允许的视觉元素
- ❌ 任何 emoji（导航、按钮、标题、徽章、loading 状态都不要）
- ❌ 阴影 > `0 4px 12px`
- ❌ 渐变饱和度 > 当前规格
- ❌ 圆角 > 12px（按钮 8px,卡片 12px,这是上限）
- ❌ glassmorphism 强模糊
- ❌ hover 时的位移/缩放动画（只允许颜色变化）
- ❌ 任何"科技感"特效：发光、霓虹、扫光、粒子
- ❌ 圆形 logo / 图标装饰
---
## 7. Page Specs
### 7.1 首页 `/`
**布局（从上到下）:**
```
┌─────────────────────────────────────────────────────┐
│  Navigation                                          │
├─────────────────────────────────────────────────────┤
│                                                      │
│  AI Model Tracker                                    │
│  Free model lifecycle monitoring                     │
│                                                      │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐│
│  │ Tracked │  │ New free│  │ Free→   │  │ Total   ││
│  │ Models  │  │ this wk │  │ Paid wk │  │ Tokens  ││
│  │   24    │  │   3     │  │   1     │  │  3.2T   ││
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘│
│                                                      │
│  ─────── Model Rankings ───────                     │
│  [Filter: Brand ▾] [Status ▾] [Region ▾]            │
│  [Sort: 7d Tokens ▾]                                 │
│                                                      │
│  ┌─────────────────────────────────────────────┐   │
│  │ # │ Model            │ Status │ 7d Tokens │↗│   │
│  │ 1 │ Baidu CoBuddy    │ FREE   │ 12.4B     │+│   │
│  │ 2 │ Ring 2.6 (NEW)   │ FREE   │ 8.9B      │+│   │
│  │ ...                                            │   │
│  └─────────────────────────────────────────────┘   │
│                                                      │
│  ─────── This Week's Events ───────                 │
│  • 2026-05-25  Ring 2.6 launched (InclusionAI)      │
│  • 2026-05-13  Ling 2.6 transitioned to paid        │
│                                                      │
│  ─────── Market Analysis ───────                    │
│  [LLM Analysis Card]                                 │
│                                                      │
└─────────────────────────────────────────────────────┘
```
**KPI 条:** 4 张卡片,横向并列。每张内容:
- Label（小标题,uppercase,secondary 色）
- Value（text-2xl font-semibold,primary 色）
- Optional sub-label
**排行榜表格列:**
- Rank（#）
- Model name（可点击跳转 `/model/[permaslug]`）
- Brand
- Status badge（`free` 浅蓝、`paid` 灰色、`transitioning` 橘色、`deprecated` 红色）
- 7d Tokens（用 `Intl.NumberFormat` 1.2B / 450M 格式）
- 7d Requests
- 7d Growth%（↑↓ 带百分比）
- Discovered badge：如果 `discovered_at > NOW() - 7 days`,显示 NEW 标签
**筛选器:**
- Brand：dropdown,多选
- Status：`free` / `paid` / `transitioning` / `all`
- Region：`china` / `us` / `europe` / `all`
**This Week's Events:** 查 events 表最近 7 天事件,日期倒序,纯文字列表。
**Market Analysis 卡片:** 调 LLM API 生成本周市场全貌的中文分析（详见 Section 8）。
### 7.2 趋势对比 `/compare`
**已实现部分保留,改动如下:**
- 模型选择器改成**带搜索的多选**（用 shadcn `<Command>` 组件）,不再是 6 个 checkbox 平铺
- 默认勾选规则改为：**所有 free 状态模型 + 最近一个月转付费的模型**（不超过 5 个）
- Time Range 增加 `Today (hourly)` 选项,X 轴展示当日逐小时增量
- 指标 tab 增加 `Growth %`（每个模型的 7d 增长率,需要 14d 历史数据）
- 图表下方加 `<AnalysisCard scope="compare" />`
### 7.3 转付费分析 `/transitions`
**已实现部分保留,改动如下:**
- **修复 X 轴 bug:** 范围从 `D-7 to D+0` 改为 `D-7 to D+30`（后续可扩展 D+60 / D+90 通过 tab 切换）
- 模型选择器：默认全选所有有 `free_to_paid` 事件的模型
- 新增「绝对值 / 归一化」切换 toggle
- 新增**历史 case 表格**（图下方）：
  ```
  ┌────────────────────────────────────────────────────────┐
  │ Model            │ Date    │ D+7   │ D+30  │ Successor│
  │ Ling 2.6 1T      │ 05-13   │ -82%  │ -95%  │ Ring 2.6 │
  │ ...                                                     │
  └────────────────────────────────────────────────────────┘
  ```
  - Successor 字段：查 events 表里同模型在 `event_date ± 7 天`内是否有同厂商的 `new_release` 事件
- 图表下方加 `<AnalysisCard scope="transitions" />`
### 7.4 详情页 `/model/[permaslug]`
**完整新建。** 包含:
**A. Header:**
```
[← Back to Rankings]
Baidu CoBuddy                              [FREE] [NEW]
Baidu · cobuddy-20260430
Discovered: 2026-05-20  ·  Region: China
```
**B. View Switcher:** `Today (hourly)` / `7d` / `14d` / `30d`（tabs）
**C. 趋势图:** Recharts LineChart 单 series + 自身 events 的 ReferenceLine
**D. 多时区峰谷卡片（SPEC v2 的设计,本次必须实现）:**
```
┌─ Peak Hours (UTC, last 7d avg) ────────┐
│                                        │
│  14:00 – 15:00 UTC                     │
│  +12.4M tokens/hour                    │
│                                        │
│  Beijing  22:00 – 23:00                │
│  US East  10:00 – 11:00                │
│  US West  07:00 – 08:00                │
│  Central Europe  16:00 – 17:00         │
│                                        │
└────────────────────────────────────────┘
┌─ Valley Hours ─────────────────────────┐
│  09:00 – 10:00 UTC                     │
│  +0.8M tokens/hour                     │
│  ...                                   │
└────────────────────────────────────────┘
```
实现细节见 SPEC v2 Section 7.3 模块 C。`lib/timezones.ts` 用 `Intl.DateTimeFormat({ timeZone: 'Asia/Shanghai' })` 等,**不引入 dayjs / date-fns**。
**E. 事件时间线:** 该模型所有 events 倒序列表
**F. AnalysisCard:** `<AnalysisCard scope="model_detail" />`
### 7.5 事件管理 `/events`（NEW）
**核心：这是团队成员录入策略事件的入口。** v2 里写"靠 SQL INSERT"是错的,**团队工具必须给所有成员 UI**。
**布局:**
```
┌─ Events Timeline ─────────────────────────────────┐
│                                                    │
│  [+ New Event]                                     │
│                                                    │
│  Filter: Model ▾   Type ▾   Date Range ▾          │
│                                                    │
│  2026-05-25  Ring 2.6 launched                    │
│  [new_release] InclusionAI Ring-2.6-1T             │
│  Same-vendor successor to Ling 2.6                 │
│  [Edit] [Delete]                                   │
│                                                    │
│  2026-05-13  Ling 2.6 → Paid                      │
│  [free_to_paid] InclusionAI Ling-2.6-1T           │
│  [Edit] [Delete]                                   │
│                                                    │
│  ... (paginated, 20 per page)                     │
└────────────────────────────────────────────────────┘
```
**New / Edit 表单字段:**
- Model（下拉,from `models` 表）
- Event date（date picker）
- Event type（下拉：5 种 enum）
- Label（input,短描述,必填）
- Description（textarea,长描述,可选）
**Delete 必须有二次确认** dialog。
**API Routes:**
```
POST   /api/events       创建
PATCH  /api/events/:id   更新
DELETE /api/events/:id   删除
GET    /api/events       列表（支持 filter）
```
---
## 8. LLM 中文分析模块
### 8.1 集成位置
`<AnalysisCard />` 组件,放在每个图表下方:
- 首页：scope = `home`,基于全市场数据
- /compare：scope = `compare`,基于当前选中模型 + 时间范围
- /transitions：scope = `transitions`,基于所有 free_to_paid case
- /model/[permaslug]：scope = `model_detail`,基于单模型 + 相关 events
### 8.2 触发与缓存
- 用户切换图表参数 → debounce 1500ms 后自动重新生成
- 显式「刷新分析」按钮
- 缓存：`(scope, modelIds, dateRange, metric)` 组合 hash 作 cache_key,30 分钟过期
- 加载状态：骨架屏 + "分析生成中…"（中文）
- 失败："分析模块暂不可用,请稍后重试"
### 8.3 Server Action 实现
`app/actions/analysis.ts`:
```typescript
'use server';
import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'crypto';
import { supabaseServer } from '@/lib/supabase-server';
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
export async function generateAnalysis(params: {
  scope: 'home' | 'compare' | 'transitions' | 'model_detail';
  modelIds: number[];
  dateRange: string;
  metric: 'tokens' | 'requests' | 'growth';
  dataPoints: any[];
  events: any[];
}): Promise<string> {
  const cacheKey = `${params.scope}:${createHash('sha1').update(JSON.stringify({
    modelIds: params.modelIds.sort(),
    dateRange: params.dateRange,
    metric: params.metric,
  })).digest('hex')}`;
  // 查缓存
  const { data: cached } = await supabaseServer
    .from('analysis_cache')
    .select('content, expires_at')
    .eq('cache_key', cacheKey)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (cached) return cached.content;
  // 调 LLM
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 800,
    messages: [{ role: 'user', content: buildPrompt(params) }],
  });
  const content = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as any).text)
    .join('\n');
  // 写缓存
  await supabaseServer.from('analysis_cache').upsert({
    cache_key: cacheKey,
    scope: params.scope,
    content,
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  });
  return content;
}
```
### 8.4 Prompt 模板
```typescript
function buildPrompt(params: AnalysisParams): string {
  return `你是一个 AI 模型市场分析助手,服务于一个内部运营团队。
他们正在追踪 OpenRouter 平台上免费模型的调用量,核心业务问题是:
"我们家的免费模型,应该在什么时机、用什么方式转付费,损失最小?"
**任务:** 基于以下结构化数据,生成简短的中文分析（150-250 字）。
**严格规则:**
1. 不要编造数据里没有的信息
2. 「决策启示」节如果数据不足以支撑结论,直接说"当前样本量不足以判断 X,建议持续观察",不允许编造结论
3. 不要使用"显著""可能""或许"等模糊词,用具体百分比和日期
4. 不要做无法验证的归因（如"用户偏好转移"）,只描述能从数据看到的现象
5. 全文使用简体中文
**当前分析范围:** ${params.scope}
**时间范围:** ${params.dateRange}
**指标:** ${params.metric}
**数据点:**
${JSON.stringify(params.dataPoints, null, 2)}
**已知策略事件:**
${JSON.stringify(params.events, null, 2)}
**输出格式（严格遵守,使用 Markdown）:**
**当前观察**
[1-2 句总结图表显示的核心信息]
**关键发现**
- [数据点 1,带具体数字]
- [数据点 2,带具体数字]
- [可选,数据点 3]
**策略上下文**
[仅当 events 不为空时输出。结合事件解释数据。无事件则省略整节]
**决策启示**
[1-2 句。如数据不足,明说"数据不足以判断 X"]`;
}
```
### 8.5 AnalysisCard 组件
```tsx
'use client';
import { useEffect, useState } from 'react';
import { generateAnalysis } from '@/app/actions/analysis';
import ReactMarkdown from 'react-markdown';
export function AnalysisCard({ scope, params }: { scope: string; params: any }) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  async function regenerate() {
    setLoading(true);
    setError(null);
    try {
      const result = await generateAnalysis({ scope, ...params });
      setContent(result);
    } catch (e) {
      setError('分析模块暂不可用,请稍后重试');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const timer = setTimeout(regenerate, 1500);
    return () => clearTimeout(timer);
  }, [JSON.stringify(params)]);
  return (
    <div className="card mt-6">
      <div className="flex justify-between items-start mb-4">
        <div>
          <div className="text-sm font-medium uppercase tracking-wider text-secondary">
            Analysis
          </div>
          <div className="text-xl font-semibold mt-1">市场分析</div>
        </div>
        <button onClick={regenerate} className="btn-secondary text-sm">
          刷新分析
        </button>
      </div>
      {loading && <div className="text-secondary">分析生成中…</div>}
      {error && <div className="text-red-500">{error}</div>}
      {!loading && !error && (
        <div className="prose prose-sm max-w-none">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
```
**安装依赖:** `npm i react-markdown @anthropic-ai/sdk`
**环境变量:** `ANTHROPIC_API_KEY` 加到 Vercel 和 `.env.local`
---
## 9. 自动发现新 free 模型
### 9.1 触发时机
每次 `/api/fetch` 被 cron 调用时,**先执行 discovery 再执行采集**。
### 9.2 实现逻辑
```typescript
// lib/discovery.ts
export async function discoverNewFreeModels(): Promise<{ added: number; existing: number }> {
  // 1. 调 OpenRouter 的模型列表 API（用户去 F12 抓出真实 URL）
  const allModels = await fetchOpenRouterModelList();
  // 2. 筛选 pricing 为 0 或标记为 free 的模型
  const freeModels = allModels.filter(m =>
    m.pricing?.prompt === '0' || m.pricing?.prompt === 0 ||
    m.is_free === true
  );
  // 3. 与 models 表 diff
  const { data: existing } = await supabaseServer.from('models').select('permaslug');
  const existingSlugs = new Set(existing?.map(m => m.permaslug) ?? []);
  const newOnes = freeModels.filter(m => !existingSlugs.has(m.id));
  // 4. INSERT 新模型
  if (newOnes.length > 0) {
    const colorPalette = ['#5B8DEF', '#9B7EDE', '#E85B81', '#54B584', '#F0A856', '#5BB5C5'];
    const records = newOnes.map((m, i) => ({
      permaslug: m.id,
      display_name: m.name ?? m.id,
      brand: inferBrand(m.id),  // 从 permaslug 取斜杠前的部分
      color_hex: colorPalette[Math.floor(Math.random() * colorPalette.length)],
      current_status: 'free',
      region: inferRegion(m.id),  // 简单 mapping：deepseek/qwen/baidu/zai → china 等
      discovered_at: new Date().toISOString(),
      is_active: true,
    }));
    await supabaseServer.from('models').insert(records);
  }
  return { added: newOnes.length, existing: existingSlugs.size };
}
```
### 9.3 状态变更检测
每次采集时也要检查：**已有 free 模型是否变成 paid**?
- 如果 OpenRouter 返回的 pricing 不再是 0,自动 UPDATE `current_status = 'paid'`
- **同时自动 INSERT 一条 `free_to_paid` 事件到 events 表**（避免人工漏录）
---
## 10. Models 列表（初始 seed）
用户去 https://openrouter.ai/rankings 核对当前热门 free 模型的 permaslug。建议初始覆盖:
```sql
INSERT INTO models (permaslug, display_name, brand, color_hex, current_status, region) VALUES
  ('baidu/cobuddy-20260430', 'Baidu CoBuddy', 'Baidu', '#5B8DEF', 'free', 'china'),
  ('inclusionai/ling-2.6-1t', 'InclusionAI Ling 2.6 1T', 'InclusionAI', '#9B7EDE', 'paid', 'china'),
  ('inclusionai/ring-2.6-1t', 'InclusionAI Ring 2.6 1T', 'InclusionAI', '#E85B81', 'paid', 'china'),
  ('minimax/m2.5', 'MiniMax M2.5', 'MiniMax', '#F0A856', 'free', 'china'),
  ('qwen/qwen3-next-80b', 'Qwen3-Next 80B', 'Alibaba', '#54B584', 'free', 'china'),
  ('z-ai/glm-4.5-air', 'Z.ai GLM 4.5 Air', 'Z.ai', '#5BB5C5', 'free', 'china');
```
（具体 permaslug 用户核对后修改）
**Seed events:**
```sql
INSERT INTO events (model_id, event_date, event_type, label, description) VALUES
  ((SELECT id FROM models WHERE permaslug = 'inclusionai/ling-2.6-1t'),
   '2026-05-13', 'free_to_paid', 'Ling 转收费',
   'Ling 2.6 1T 由免费档转为付费。同日 Ring 2.6 1T 作为新免费模型上线接替。'),
  ((SELECT id FROM models WHERE permaslug = 'inclusionai/ring-2.6-1t'),
   '2026-05-13', 'new_release', 'Ring 上线接替',
   'Ring 2.6 1T 作为新免费模型上线,接替转付费的 Ling。'),
  ((SELECT id FROM models WHERE permaslug = 'inclusionai/ring-2.6-1t'),
   '2026-05-15', 'free_to_paid', 'Ring 也转收费', 'Ring 2.6 1T 上线两天后也转为付费。');
```
---
## 11. Batch 执行计划
**严格按顺序,每个 Batch 完成后必须输出 acceptance checklist 并停下来等用户手动确认。不允许连续执行两个 Batch。**
### Batch 0：视觉系统（预计 30 分钟）
**目标:** 全局应用 Section 6 视觉设计系统。**不动业务逻辑、不动数据流、不动组件结构,只改样式。**
任务:
1. 在 `app/globals.css` 定义 Section 6.1 的 CSS 变量
2. 引入 Inter 字体
3. 改 `<body>` 背景为浅蓝微弱渐变
4. 删除所有 emoji（包括 logo、导航、按钮、徽章里的）
5. 更新顶部导航样式（sticky + backdrop-blur + 文字导航）
6. 更新所有 card / button / checkbox / tab 样式
7. 更新 Recharts 图表的网格/坐标轴颜色
8. UPDATE `models` 表的 `color_hex` 为 Section 6.1 新调色板
**Acceptance:**
- [ ] 全站无 emoji
- [ ] 字体加载为 Inter
- [ ] 卡片有统一的圆角 12px + 浅边框 + 微弱阴影
- [ ] 按钮、checkbox、tab 都是浅蓝色调
- [ ] 图表的网格线几乎隐形
### Batch 1：基础页面补齐（预计 4 小时）
**目标:** 实现首页 `/` 和详情页 `/model/[permaslug]`,修复 `/transitions` 的 X 轴 bug。
任务:
1. ALTER `models` 表（加 `discovered_at`、`current_status`、`region`）
2. 实现首页（Section 7.1）
3. 实现详情页（Section 7.4）
4. 修复 `/transitions` X 轴范围为 `D-7 to D+30`
5. 在 `/transitions` 加历史 case 表格
**Acceptance:**
- [ ] 首页有 KPI 条、排行榜、events 列表
- [ ] 排行榜支持 brand/status/region 筛选
- [ ] 排行榜支持按 7d Tokens / 7d Growth% 排序
- [ ] 排行榜行可点击跳详情页
- [ ] 详情页有趋势图 + **多时区峰谷卡片**（必须有） + 事件时间线
- [ ] 多时区峰谷卡片显示 UTC / 北京 / 美东 / 美西 / 中欧 5 个时区
- [ ] /transitions X 轴显示到 D+30
- [ ] /transitions 下方有历史 case 表格（D+7 / D+30 衰减率 / Successor）
### Batch 2：事件管理 UI（预计 3 小时）
任务:
1. 实现 `/events` 页（Section 7.5）
2. 实现 API routes：`POST/PATCH/DELETE /api/events`
3. 顶部导航加 Events 入口
**Acceptance:**
- [ ] 能在 UI 里新增事件
- [ ] 能编辑现有事件
- [ ] 能删除事件（带二次确认）
- [ ] 列表能按 model / type 筛选
- [ ] 新增/编辑事件后,/compare 和 /transitions 的图表能立即反映
### Batch 3：LLM 中文分析模块（预计 4 小时）
任务:
1. `npm i react-markdown @anthropic-ai/sdk`
2. 创建 `analysis_cache` 表
3. 实现 `app/actions/analysis.ts`（Section 8.3）
4. 实现 `<AnalysisCard />` 组件（Section 8.5）
5. 把 AnalysisCard 集成到 4 个页面下方
6. 在 Vercel 配置 `ANTHROPIC_API_KEY`
**Acceptance:**
- [ ] 4 个页面下方都有分析卡片
- [ ] 切换图表参数 1.5s 后自动重新生成
- [ ] 有「刷新分析」按钮
- [ ] 输出中文,格式严格符合 Section 8.4 模板
- [ ] 30 分钟内重复访问同参数走缓存（看 Supabase analysis_cache 表有数据）
- [ ] 失败时显示中文报错提示
### Batch 4：自动发现 + 增长率 + 杂项（预计 3 小时）
任务:
1. 实现 `lib/discovery.ts`（Section 9.2）
2. 修改 `/api/fetch` 路由,采集前先跑 discovery
3. 实现状态变更检测（Section 9.3）
4. `/compare` 增加 `Growth %` 指标 tab
5. `/compare` 增加 `Today (hourly)` 时间范围
6. 模型选择器改成 shadcn `<Command>` 搜索多选
**Acceptance:**
- [ ] 手动触发 `/api/fetch`,日志里能看到 discovery 结果
- [ ] 新发现的 free 模型自动出现在排行榜
- [ ] 排行榜中 `discovered_at < 7 天`的模型显示 NEW 徽章
- [ ] /compare 增长率% 指标能正确计算
- [ ] /compare Today (hourly) 显示当日逐小时增量
---
## 12. Non-goals（MVP 不做）
- ❌ 周报邮件订阅
- ❌ 用户系统（登录、注册、权限）
- ❌ 多平台数据源（ZenMux 等）
- ❌ 数据导出 / 对外 API
- ❌ 暗黑模式
- ❌ i18n / 多语言切换（中文为主,部分 UI 词保留英文）
- ❌ 图表上画批注/箭头/手动标注
- ❌ 阈值告警 / 邮件通知
- ❌ 6 month / 1 year 视图（UI 留位置,数据攒够后再做）
- ❌ Mobile 完全适配（基本响应式即可）
---
## 13. 给 Claude Code 的执行约束
**这一节非常重要,Claude Code 必须遵守。**
1. **严格分批执行。** 完成 Batch 0 后停下来等用户确认 → 完成 Batch 1 后停下来 → 以此类推。**禁止连续执行多个 Batch。**
2. **每个 Batch 完成后,主动输出该 Batch 的 acceptance checklist**,让用户逐项打勾确认。不要默认通过。
3. **不允许擅自添加功能。** 任何 Section 12 列出的 Non-goals,即使想到了也不做。如果觉得某功能有价值,先在回复里提出建议,等用户同意后才能加。
4. **不要重写已工作的代码。** `/compare` 和 `/transitions` 现有的核心逻辑（查询、状态、event annotation）已经能跑,**只允许在视觉（Batch 0）和明确 bug 修复（Batch 1 的 X 轴）处修改**,不允许重构。
5. **遇到不确定的实现细节,问用户**,不要自己猜。例如：OpenRouter 的模型列表 API URL、permaslug 列表、events seed data 的具体日期等。
6. **每个 Batch 完成后,git commit + push,commit message 用清晰的 "Batch N: <描述>"**,便于回滚。
7. **保持视觉风格统一。** Batch 0 之后,所有新页面必须使用 Section 6 定义的视觉系统,不允许偏离。
8. **本 SPEC 的 Section 编号是规范引用。** 用户说"看 Section 7.4" / "执行 Batch 2" 时,Claude Code 必须查阅对应内容,不要凭记忆。
