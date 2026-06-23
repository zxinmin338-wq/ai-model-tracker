export const t = {
  // 导航
  nav: {
    home: '首页',
    compare: '模型对比',
    vendors: '厂商对比',
  },
  // 状态
  status: {
    free: '免费',
    paid: '付费',
    transitioning: '转换中',
    deprecated: '已下线',
  } as Record<string, string>,
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
    back: '返回排行榜',
    all: '全部',
  },
  // 表头
  table: {
    rank: '排名',
    model: '模型',
    brand: '公司',
    provider: 'Provider',
    platform: '平台',
    status: '状态',
    tokens7d: '近7日 Token',
    requests7d: '近7日请求数',
    growth7d: '近7日增长',
    releasedAt: '发行时间',
    monitoredSince: '开始监测',
    cumulative: '累计',
    remark: '备注',
    date: '日期',
    successor: '替代模型',
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
  // KPI
  kpi: {
    trackedModels: '跟踪模型数',
    newFreeThisWeek: '本周新增免费',
    freeToPaidThisWeek: '本周转付费',
    total7dTokens: '近7日总 Token',
  },
  // 首页
  home: {
    title: 'AI Model Tracker',
    subtitle: '跨平台 AI 模型调用量与市场身位',
    rankings: '模型排行榜',
    rankingsDesc: '全平台 AI 模型调用量排行',
    thisWeekEvents: '本周事件',
    noEvents: '本周暂无事件记录',
  },
  // 对比页
  compare: {
    subtitle: '任选两个模型，在同一平台上对比调用量、身位与趋势',
    totalInRange: '所选周期累计',
  },
  // 详情页
  detail: {
    backToRankings: '← 返回排行榜',
    distribution: '24 小时调用分布',
    platformDistribution: '平台分布',
    eventTimeline: '事件时间线',
    peakValleyNoData: '峰谷分析需要更多小时级数据,请保持数据采集运行。',
    noHourlyData: '该模型为日级数据,无小时级分布(小时粒度仅 OpenRouter 平台支持)。',
    noFreeData: '该模型无 Free 通道数据。',
    noStandardData: '该模型无 Paid 通道数据。',
    releasedAt: '发行时间',
    monitoredSince: '开始监测',
    region: '发行地区',
  },
  // 筛选器
  filter: {
    brand: '公司',
    status: '状态',
    region: '发行地区',
    platform: '平台',
    channel: '通道',
    china: '中国',
    us: '美国',
    europe: '欧洲',
  },
  // 峰谷
  peakValley: {
    peak: '峰值时段',
    valley: '谷值时段',
    peakSuffix: '(7日平均最高)',
    valleySuffix: '(7日平均最低)',
    avgDelta: '平均增量',
    perHour: 'tokens/小时',
    dataNote: '数据按 OpenRouter 3 小时刷新粒度展示',
    distribution: '24 小时调用分布',
    noData: '峰谷分析需要更多小时级数据,请保持数据采集运行。',
  },
  // 时区
  timezone: {
    beijing: '北京',
    usEast: '美东',
    usWest: '美西',
    centralEurope: '中欧',
  },
};
