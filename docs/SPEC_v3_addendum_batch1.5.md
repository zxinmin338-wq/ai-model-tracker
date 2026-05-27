# SPEC v3 Addendum — Batch 1.5

> 这是 SPEC_v3.md 的增量补充。Claude Code 需同时阅读 SPEC_v3.md 和本文件。本文件覆盖 / 替代 SPEC v3 中相关章节的内容(如有冲突,以本文件为准)。
> Batch 1.5 在 Batch 1 完成后执行。严格按本文件 Section 7 的 Order 顺序,每完成一项停下来等用户确认。

---

## 1. 产品理解修正(重要)

用户在团队内部已经在手工维护一张 Excel,形态是:

* 横向时间轴(日期作为列)
* 纵向模型清单(每行一个模型)
* 第一行黄色高亮 + ⭐ 标记的是"我方模型"(Baidu CoBuddy)
* 列包括:模型 / 公司 / Provider / 每日 token / 累计 / 备注
* 备注列标注 free→paid 转换等关键事件

本工具的核心使命,就是把这张 Excel 自动化 + 加上分析层。

折线图是趋势分析的辅助视图,透视表才是日常监测的主视图。Batch 1.5 的核心交付是把这张透视表实现出来。

---

## 2. Database 改动

```sql
ALTER TABLE models ADD COLUMN is_own BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE models ADD COLUMN provider TEXT;  -- 显示的 inference provider 名,如 'Baidu Qianfan', 'NovitaAI', 'SiliconFlow'
```

`provider` 字段需要从 OpenRouter 数据中提取(模型对应的 endpoint provider)。如无法自动获取,允许手动录入,先留空也可。

Seed 一个我方模型:

```sql
UPDATE models SET is_own = true WHERE permaslug = 'baidu/cobuddy-20260430';
```

---

## 3. 透视表组件 `<PivotTable>`

### 3.1 数据结构

```typescript
interface PivotTableProps {
  models: Array<{
    id: number;
    permaslug: string;
    display_name: string;
    brand: string;
    provider?: string;
    is_own: boolean;
    current_status: 'free' | 'paid' | 'transitioning' | 'deprecated';
  }>;
  dateRange: { start: string; end: string };  // YYYY-MM-DD
  metric: 'tokens' | 'requests';
  data: Record<number, Record<string, number | null>>;  // modelId -> date -> value
  events: Array<{ model_id: number; event_date: string; label: string; event_type: string }>;
}
```

### 3.2 视觉规格

**列顺序(从左到右):**

1. 模型(`display_name`,自家模型前加 ⭐)
2. 公司(`brand`)
3. Provider(`provider`,无值显示 "—")
4. 每日列(从 start 到 end,每天一列,列头格式 `MM-DD`)
5. 累计(该模型在 dateRange 内的总和)
6. 备注(从 events 表自动生成,如 "2026-05-13 转付费")

**行视觉:**

* 我方模型(`is_own = true`)整行背景色 `#FFF8E1`(浅黄,与全站色调协调)
* 我方模型名前加 ⭐ emoji(这是唯一允许的 emoji,因为是数据标识不是装饰)
* 其他行白底
* 行间距:`padding: 12px 16px`,字号 `text-sm`
* 表头粘性(sticky),滚动时保持可见

**单元格规则:**

* 数字格式:≥1B 显示 `X.XXB`,≥1M 显示 `XXX.XM`,<1M 显示 `XXX.XK`
* 缺失数据(`null` 或未采集)显示 `—`
* 累计列字重 `font-semibold`
* 列宽:模型 200px、公司 80px、Provider 100px、每日列 80px、累计 100px、备注 200px
* 整表横向可滚动(当列数多时)

**备注列生成逻辑:**

```typescript
function generateRemark(events: Event[]): string {
  // 只显示该 dateRange 内的关键事件
  const relevant = events
    .filter(e => e.event_type === 'free_to_paid' || e.event_type === 'new_release')
    .map(e => `${e.event_date.slice(5)} ${e.label}`);  // 'MM-DD label'
  return relevant.join(' / ');
}
```

### 3.3 排序

* 默认排序:我方模型置顶,其他按累计降序
* 列头可点击切换排序(累计列、任意日期列)
* 排序时我方模型固定在第一行(无论排序方向)

---

## 4. 对比页 `/compare` 改造

### 4.1 加 View Toggle

页面顶部加一个 toggle:`图表` / `表格`,默认 `表格`(因为这是主视图)。

```
┌──────────────────────────────────────────────┐
│  趋势对比                                       │
│                                               │
│  [我方模型选择器 + 推荐竞品 + 已选清单]         │
│                                               │
│  视图: [表格 ✓] [图表]                         │
│  时间: 7天 / 14天 / 30天 / 自定义              │
│  指标: Token / 请求数                          │
│  [导出 ▾]                                      │
│                                               │
│  ┌─ PivotTable 或 LineChart ─┐                │
│  └────────────────────────────┘               │
│                                               │
│  ┌─ LLM 分析卡片 ─┐                            │
│  └─────────────────┘                          │
└──────────────────────────────────────────────┘
```

### 4.2 我方模型选择器(需求 4 实现)

```
我方模型(必选):
┌────────────────────────────────────────────┐
│ ⭐ Baidu CoBuddy                             │  ← 已自动选中(is_own=true)
└────────────────────────────────────────────┘

推荐对比(自动按相关性排序):
☑ InclusionAI Ring 2.6 1T   (同地区/同体量)
☑ Z.ai GLM 4.5 Air           (同地区/同体量)
☐ MiniMax M2.5
☐ Qwen3-Next 80B
[展开所有 free 模型 ▾]
```

**推荐排序逻辑:**

1. 同 `region` 优先(同地区竞品)
2. 调用量量级接近(过去 7d tokens 在我方模型的 0.3x - 3x 之间)
3. 同 `current_status` 优先(都是 free / 都是 paid)
4. 取前 5 个作为默认勾选

**重要:** 如果用户没标记任何 `is_own = true` 的模型,显示提示卡片:"尚未标记我方模型。前往 [设置](/settings) 标记后,对比体验将以你方模型为中心。"

### 4.3 图表视图(保留现有实现)

切到「图表」时显示现有的多 series LineChart + event annotation。我方模型的折线 `strokeWidth: 3`,竞品 `strokeWidth: 2`,我方模型在 legend 加 "(我方)" 后缀。

---

## 5. 导出功能(需求 3)

### 5.1 导出按钮

对比页顶部加一个 `导出 ▾` 下拉:

* 表格视图下显示:`导出表格 (CSV)` / `导出截图 (PNG)`
* 图表视图下显示:`导出图表 (PNG)` / `导出数据 (CSV)`

### 5.2 实现

**CSV 导出:**

```typescript
function exportTableCSV(data: PivotTableData, filename: string): void {
  const headers = ['模型', '公司', 'Provider', ...dateColumns, '累计', '备注'];
  const rows = data.models.map(m => [
    m.is_own ? `⭐ ${m.display_name}` : m.display_name,
    m.brand,
    m.provider ?? '—',
    ...dateColumns.map(d => data.data[m.id]?.[d] ?? ''),
    sumOf(data.data[m.id]),
    generateRemark(data.events.filter(e => e.model_id === m.id))
  ]);

  const csv = [headers, ...rows].map(r => r.map(cell =>
    typeof cell === 'string' && cell.includes(',') ? `"${cell}"` : String(cell)
  ).join(',')).join('\n');

  // 添加 BOM,Excel 才能正确识别 UTF-8
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  triggerDownload(blob, filename);
}
```

**PNG 导出:**

* 安装 `npm i html-to-image`
* 用 `htmlToImage.toPng(elementRef.current)` 转图
* 文件名:`{页面}_{日期范围}_{今天日期}.png`,如 `compare_30d_2026-05-27.png`

**导出文件名约定:**

* CSV: `model_tracker_compare_{start}_to_{end}.csv`
* PNG: `model_tracker_compare_{start}_to_{end}.png`

---

## 6. 详情页峰谷修复

### 6.1 修复 Valley = 0 的 bug

```sql
-- 修复后:过滤掉 delta = 0 或样本数过少的小时
WITH hourly AS (
  SELECT
    EXTRACT(HOUR FROM DATE_TRUNC('hour', captured_at)) AS hour_utc,
    total_tokens - LAG(total_tokens) OVER (PARTITION BY usage_date ORDER BY captured_at) AS delta
  FROM snapshots
  WHERE model_id = $1 AND captured_at >= NOW() - INTERVAL '7 days'
)
SELECT hour_utc, AVG(delta) AS avg_delta, COUNT(*) AS sample_count
FROM hourly
WHERE delta IS NOT NULL AND delta > 0
GROUP BY hour_utc
HAVING COUNT(*) >= 3  -- 至少要 3 个样本才纳入统计
ORDER BY avg_delta DESC;
```

### 6.2 空状态

如果该模型的小时级数据点 < 168(7 天 × 24 小时)的 60%,显示空状态:

```
数据采集中
该模型小时级历史数据需要至少 7 天的连续采集才能生成峰谷分析。
当前已采集 X 天,预计 YYYY-MM-DD 后可用。
```

### 6.3 新增 24 小时分布柱状图

在峰谷卡片之前(更靠上的位置)放一张 24 小时分布柱状图:

* 类型:Recharts BarChart
* X 轴:UTC 0:00 - 23:00
* Y 轴:平均 token 增量
* 颜色:模型自身 `color_hex`
* 高亮:peak hour 柱子描边加粗 + 文字标注"峰",valley hour 同理标注"谷"
* 鼠标 hover:显示该小时的多时区时间 + 平均 delta + 样本数

峰谷卡片现在的作用是对柱状图的文字注释,而不是孤立结论。

---

## 7. 全中文化(需求 1)

### 7.1 中文映射表

新建 `lib/i18n.ts`:

```typescript
export const t = {
  // 导航
  nav: {
    home: '首页',
    compare: '趋势对比',
    transitions: '转付费分析',
    events: '事件管理',
    settings: '设置',
  },
  // 状态
  status: {
    free: '免费',
    paid: '付费',
    transitioning: '转换中',
    deprecated: '已下线',
  },
  // 通用
  common: {
    refresh: '刷新',
    export: '导出',
    edit: '编辑',
    delete: '删除',
    confirm: '确认',
    cancel: '取消',
    loading: '加载中…',
    noData: '暂无数据',
    new: '新',
    own: '我方',
  },
  // 表头
  table: {
    rank: '排名',
    model: '模型',
    brand: '公司',
    provider: 'Provider',  // 保留英文
    status: '状态',
    tokens7d: '近7日 Token',
    growth7d: '近7日增长率',
    discoveredAt: '发现时间',
    cumulative: '累计',
    remark: '备注',
  },
  // 时间范围
  range: {
    today: '今日',
    days7: '近7天',
    days14: '近14天',
    days30: '近30天',
    custom: '自定义',
  },
  // 视图
  view: {
    chart: '图表',
    table: '表格',
  },
  // 指标
  metric: {
    tokens: 'Token',
    requests: '请求数',
    growth: '增长率',
  },
};
```

### 7.2 保留英文的位置

* 模型名 `display_name`(如 "Baidu CoBuddy")
* 品牌名(如 "Anthropic", "Baidu" — 不翻译为"百度",因为是品牌)
* `permaslug` 标识符
* Provider 名(如 "NovitaAI", "SiliconFlow")
* 数字单位(B / M / K)
* 时区缩写(UTC, ET, PT, CET) — 但前面的城市名用中文("北京 / 美东 / 美西 / 中欧")

### 7.3 多时区峰谷卡片的中文化

```
峰值时段(7日内平均最高)
UTC 14:00 - 15:00
北京 22:00 / 美东 10:00 / 美西 07:00 / 中欧 16:00
平均增量:12.4M tokens/小时

谷值时段(7日内平均最低,排除数据缺失)
UTC 09:00 - 10:00
北京 17:00 / 美东 05:00 / 美西 02:00 / 中欧 11:00
平均增量:0.8M tokens/小时
```

---

## 8. 执行顺序(严格按 Order)

### Order 1 — 数据库 & 我方模型机制(30 min)

* ALTER models 表(加 `is_own`、`provider`)
* UPDATE Baidu CoBuddy 为 `is_own = true`
* 新建 `/settings` 简易页:列出所有模型,checkbox 切换 `is_own`
* 完成后停下来验收

### Order 2 — 中文化全站(1.5 hr)

* 创建 `lib/i18n.ts`
* 替换所有 UI 文案为中文
* 验收清单:首页、对比页、转付费分析页、详情页、事件管理页(如已存在)
* 完成后停下来验收

### Order 3 — 透视表 `<PivotTable>` 组件(2 hr)

* 在 `components/pivot-table.tsx` 新建
* 严格按 Section 3 视觉规格实现
* 单独可在 `/compare` 页通过临时按钮触发查看
* 完成后停下来验收

### Order 4 — 对比页 View Toggle 接入(30 min)

* 加 `图表 / 表格` toggle,默认 `表格`
* 表格 mode 渲染 `<PivotTable>`,图表 mode 渲染现有 LineChart
* 完成后停下来验收

### Order 5 — 推荐竞品 + 我方模型高亮(1.5 hr)

* 实现 Section 4.2 的推荐竞品算法
* 我方模型选择器 UI
* 图表 mode 下:我方模型线 `strokeWidth: 3`,legend 加 `(我方)` 后缀
* 完成后停下来验收

### Order 6 — 详情页峰谷修复 + 24小时柱状图(1.5 hr)

* 修复 valley = 0 bug(Section 6.1)
* 增加空状态(Section 6.2)
* 新增 24 小时分布柱状图(Section 6.3)
* 完成后停下来验收

### Order 7 — 导出功能(1 hr)

* `npm i html-to-image`
* 实现 CSV 导出(Section 5.2)
* 实现 PNG 导出(Section 5.2)
* 完成后停下来验收

---

## 9. Batch 1.5 完成的 Acceptance Checklist

整体验收(所有 Order 完成后):

- [ ] 全站 UI 中文(模型名、Provider 名、品牌名保留英文)
- [ ] 对比页默认显示透视表视图
- [ ] 透视表中我方模型行浅黄背景 + ⭐ 标记 + 置顶
- [ ] 透视表的「备注」列自动显示 events 中的事件
- [ ] 切换到「图表」视图,我方模型线明显加粗
- [ ] 推荐竞品按相关性排序,默认勾选合理
- [ ] 表格视图能导出 CSV(用 Excel 打开中文不乱码)
- [ ] 图表视图能导出 PNG
- [ ] 详情页有 24 小时分布柱状图
- [ ] 数据不足时显示中文空状态,不显示 valley=0 的伪结论
- [ ] 设置页能切换模型的「我方」标记

---

## 10. 仍然 Non-goals(不要在 Batch 1.5 做)

- ❌ Batch 2 的事件管理 UI(留到下一个 batch)
- ❌ Batch 3 的 LLM 分析模块
- ❌ Batch 4 的自动发现机制
- ❌ 6m / 1y 时间范围(数据不足)
- ❌ 导出"图 + LLM 分析"的复合 PNG(留到 LLM 模块上线后)
- ❌ 透视表的单元格编辑功能(只读)
- ❌ 透视表的列拖拽 / 自定义列(默认列足够)
