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
    subtitle: '免费模型生命周期监控',
    rankings: '模型排行榜',
    thisWeekEvents: '本周事件',
    noEvents: '本周暂无事件记录',
  },
  // 对比页
  compare: {
    subtitle: '选择 2-5 个模型叠加对比',
    totalInRange: '所选周期累计',
  },
  // 转付费分析页
  transitions: {
    subtitle: '归一化到 D-1 = 100%,按转付费日期 D+0 对齐',
    historyCases: '历史转付费案例',
    noData: '暂无 free→paid 转付费事件记录',
    transition: '转付费',
    baseline: '基准线',
    relatedEvents: '相关事件',
  },
  // 详情页
  detail: {
    backToRankings: '← 返回排行榜',
    distribution: '24 小时调用分布',
    eventTimeline: '事件时间线',
    peakValleyNoData: '峰谷分析需要更多小时级数据,请保持数据采集运行。',
    releasedAt: '发行时间',
    monitoredSince: '开始监测',
    region: '发行地区',
  },
  // 筛选器
  filter: {
    brand: '公司',
    status: '状态',
    region: '发行地区',
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
  // 设置页
  settings: {
    title: '设置',
    subtitle: '标记我方模型,对比页将以我方模型为中心展示',
    myModels: '我方模型',
    allModels: '全部模型',
    noOwnModels: '尚未标记我方模型。在下方列表中勾选即可。',
    setProvider: '设置 Provider',
    save: '保存',
  },
};
