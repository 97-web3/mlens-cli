# 墨链 链镜 MVP 设计

## 概要

本设计定义一个基于 `packages/coding-agent` 的薄定制终端产品：`墨链 链镜`。

目标是在尽量复用现有 `pi` 编码能力、工具调用、会话管理、模型切换和 TUI 交互骨架的前提下，交付一个面向链上公共地址分析的 Agent TUI。第一版以单地址分析为核心，支持 `ETH`、`BSC`、`BTC`、`SOL`，数据来源先接第三方公开 API。

## 产品定位

- 公司品牌名：`墨链`
- 产品显示名：`墨链 链镜`
- 产品定位：链上公共地址分析 Agent TUI
- 一阶段形态：在现有 `packages/coding-agent` 上增加独立入口，而不是重写整套 CLI/TUI
- 主要用户：
  - 内部分析师，强调效率、连续追问、会话沉淀
  - 外部客户演示或交付场景，强调品牌一致性和结果可解释性

## 命名

- 显示名：`墨链 链镜`
- 推荐包名：`@molian/molian-lens-agent`
- 推荐可执行名：`mlens`

MVP 阶段仍基于 `packages/coding-agent` 源码树演进，不立即拆出独立 workspace package。第一版通过新增 `mlens` 入口、品牌配置和内置扩展完成产品化；`@molian/molian-lens-agent` 作为后续独立发布时的推荐包名。

## 目标

- 复用 `coding-agent SDK + pi-tui` 的会话和交互能力
- 提供独立的 `墨链` 品牌入口
- 保留现有 `pi` 的会话管理、工具调用、模型切换、设置和会话树能力
- 提供 `/analyze <address> [chain]` 单地址分析主命令
- 输出固定结构的地址分析报告
- 在同一会话中支持后续追问
- 通过链别工具适配层对接第三方公开链上数据接口

## 非目标

- 不重写现有 `InteractiveMode` 消息区、编辑器、会话树和设置页
- 不在 MVP 中实现多地址批量分析
- 不在 MVP 中实现复杂地址关系图或可视化资金路径图
- 不在 MVP 中实现多角色权限系统、后台管理系统或组织级管理
- 不在 MVP 中实现自建索引器或自有链上数据仓

## 核心用户流

### 1. 启动产品

用户运行 `mlens`，进入与现有 `pi` 类似的交互界面，但启动文案、标题和帮助信息体现 `墨链 链镜` 品牌。

### 2. 发起单地址分析

用户通过主命令发起分析：

```text
/analyze <address> [chain]
```

其中 `chain` 可选值为 `eth`、`bsc`、`btc`、`sol`。

如果未指定 `chain`：

- `BTC` 与 `SOL` 由地址格式直接识别
- `ETH` 与 `BSC` 仅识别为 `EVM` 类，不自动猜具体链，要求用户明确指定

### 3. 产出报告

Agent 基于工具结果输出固定报告结构，然后用户继续追问。

### 4. 追问

用户可以继续询问该地址的活跃周期、交互对象、风险特征或最近行为。追问沿用现有会话管理，不引入新存储格式。

## 交互原则

- 第一版的标准入口是 `/analyze`
- 用户直接粘贴地址时，系统提示或引导用户使用 `/analyze`
- 不引入新的复杂多步向导
- 分析完成后，回到普通对话流
- 用户仍然可以使用 `/model`、`/settings`、`/resume`、`/new`、`/tree`、`/compact` 等现有能力

## 架构概览

MVP 采用“三层薄定制”：

1. 新入口层
2. 内置品牌与命令扩展层
3. 链上数据工具适配层

### 1. 新入口层

新增 `墨链` 专用 CLI 入口，但复用现有 runtime/session 体系：

- 复用 `createAgentSessionServices`
- 复用 `createAgentSessionFromServices`
- 复用 `createAgentSessionRuntime`
- 复用 `InteractiveMode`

该入口负责：

- 选择 `墨链 链镜` 的品牌配置
- 注入品牌化文案和系统提示词
- 注入默认扩展工厂
- 启动现有交互模式

### 2. 内置品牌与命令扩展层

通过 `DefaultResourceLoader` 的 `systemPromptOverride` 与 `extensionFactories` 注入：

- 默认系统提示词
- `/analyze` 命令
- 链上地址分析工具
- 帮助文本中的墨链品牌信息

这一层不改写通用会话语义，只做品牌和领域能力装配。

### 3. 链上数据工具适配层

按链拆分工具和 provider 适配器：

- 命令层负责触发分析
- 工具层负责向模型暴露可调用能力
- provider 适配器负责第三方 API 到内部统一结构的转换

UI 不直接依赖第三方 API 字段名。

## 必须引入的品牌配置抽象

当前 `packages/coding-agent/src/config.ts` 中的 `APP_NAME` 来自 package 级 `package.json` 的 `piConfig.name`，属于全局单值配置。如果保持在同一个 package 中新增 `mlens` 入口，仅靠增加一个 bin 名并不能让 `pi` 与 `墨链 链镜` 同时拥有不同的品牌名、帮助文本和启动标题。

因此 MVP 必须引入一个小范围的品牌配置抽象，例如 `AppProfile`：

```ts
type AppProfile = {
  appName: string;
  appTitle: string;
  configDirName: string;
  exportNamePrefix: string;
  shareViewerUrl?: string;
};
```

要求：

- 现有 `pi` 默认行为保持不变
- `mlens` 可以在同一 package 内覆盖品牌相关文本
- 品牌注入只影响文案、启动页、帮助文本、导出文件前缀等，不改变会话格式

## 推荐模块布局

建议新增以下模块：

- `packages/coding-agent/src/molian/cli.ts`
- `packages/coding-agent/src/molian/main.ts`
- `packages/coding-agent/src/molian/profile.ts`
- `packages/coding-agent/src/molian/system-prompt.ts`
- `packages/coding-agent/src/molian/extension.ts`
- `packages/coding-agent/src/molian/commands/analyze.ts`
- `packages/coding-agent/src/molian/tools/types.ts`
- `packages/coding-agent/src/molian/tools/resolve-chain.ts`
- `packages/coding-agent/src/molian/tools/get-evm-address-overview.ts`
- `packages/coding-agent/src/molian/tools/get-btc-address-overview.ts`
- `packages/coding-agent/src/molian/tools/get-sol-address-overview.ts`
- `packages/coding-agent/src/molian/tools/get-address-risk-signals.ts`
- `packages/coding-agent/src/molian/providers/evm.ts`
- `packages/coding-agent/src/molian/providers/btc.ts`
- `packages/coding-agent/src/molian/providers/sol.ts`

MVP 需要在 `packages/coding-agent/package.json` 中增加 `mlens` 对应的 `bin` 条目。

## 命令设计

### `/analyze`

格式：

```text
/analyze <address> [chain]
```

行为：

- 解析参数
- 校验地址格式
- 处理链别识别或链别歧义
- 向当前 session 发送一条格式固定的用户消息
- 由模型根据系统提示词和工具能力完成实际分析

命令处理器本身不直接拼装最终报告，也不自己抓取 API。它只负责把用户意图变成一条确定性更强的分析请求，让 Agent 去调用工具。

推荐命令模板语义：

- 目标地址
- 已知链别，或需要先判定
- 必须产出固定 6 段报告
- 必须在结论中说明当前结论基于公开数据源

这样做的原因：

- 保持命令层轻量
- 复用现有 agent/tool loop
- 让同一批工具同时可被普通对话和 `/analyze` 使用

## 工具集

MVP 最小工具集如下。

### `resolve_chain_for_address`

输入：

- `address`

输出：

- `btc`
- `sol`
- `evm`
- `unknown`

说明：

- 该工具只区分 `BTC`、`SOL`、`EVM`
- `ETH` 与 `BSC` 地址格式相同，不能靠地址本身区分

### `get_evm_address_overview`

输入：

- `chain: "eth" | "bsc"`
- `address`

输出：

- 原生币余额
- 交易总数
- 首次活跃时间
- 最近活跃时间
- 近期交易摘要
- 高频交互对手
- 标签候选

### `get_btc_address_overview`

输入：

- `address`

输出：

- 当前余额或 UTXO 汇总
- 总收入/总支出
- 交易总数
- 首次活跃时间
- 最近活跃时间
- 主要输入输出关系摘要

### `get_sol_address_overview`

输入：

- `address`

输出：

- SOL 余额
- 代币账户摘要
- 交易总数
- 首次活跃时间
- 最近活跃时间
- 常见 program 交互摘要
- 高频交互对手

### `get_address_risk_signals`

输入：

- 标准化地址画像结果

输出：

- 规则化风险和行为信号数组

例如：

- 长期沉睡后激活
- 高频归集
- 高频中转
- 交互高度集中
- 疑似交易所风格地址
- 疑似机器人风格行为

## 统一数据结构

所有链都归一化到统一的内部结构，报告层只依赖该结构：

```ts
type AddressOverview = {
  chain: "eth" | "bsc" | "btc" | "sol";
  address: string;
  balanceSummary: {
    nativeSymbol: string;
    nativeBalance: string;
    assets?: Array<{ symbol: string; amount: string }>;
  };
  activitySummary: {
    txCount: number;
    firstSeenAt?: string;
    lastSeenAt?: string;
    recentActivityWindow?: string;
  };
  transferSummary: {
    totalIn?: string;
    totalOut?: string;
    largeTransfers?: Array<{ timestamp?: string; amount: string; symbol: string; direction: "in" | "out" }>;
  };
  counterparties: Array<{
    address: string;
    label?: string;
    txCount?: number;
    relation?: string;
  }>;
  labels: Array<{
    label: string;
    confidence?: "low" | "medium" | "high";
    source?: string;
  }>;
  sourceMeta: {
    provider: string;
    partial: boolean;
    notes: string[];
  };
};
```

## 第三方数据源策略

第一版数据源采用第三方公开接口，但实现上不把具体供应商写死在 UI 和工具接口中。

实现原则：

- `ETH/BSC` 使用 explorer 风格 REST 接口
- `BTC` 使用公开地址/交易 REST 接口
- `SOL` 使用公开 RPC 或索引增强接口
- 所有 provider 通过环境变量配置 base URL 和 API key

建议的环境变量形式：

- `MOLIAN_ETH_API_URL`
- `MOLIAN_ETH_API_KEY`
- `MOLIAN_BSC_API_URL`
- `MOLIAN_BSC_API_KEY`
- `MOLIAN_BTC_API_URL`
- `MOLIAN_BTC_API_KEY`
- `MOLIAN_SOL_API_URL`
- `MOLIAN_SOL_API_KEY`

这意味着后续替换为墨链内部 API 时，只需要替换 provider 适配器，而不必改 slash command、系统提示词、会话层或 TUI。

## 系统提示词原则

默认系统提示词需要把产品角色从“通用编码助手”改成“链上公共地址分析 Agent”，但不移除编码工具能力。

系统提示词的核心要求：

- 先基于证据再下判断
- 默认使用链上工具收集事实
- 输出固定 6 段报告
- 明确声明结论基于公开数据源，不保证覆盖全部链上活动
- 当链别不足以确定时，要求用户补充
- 后续追问时优先复用已有上下文，不重复抓取无关数据

## 报告结构

固定报告结构如下。

### 1. 地址概览

- 链别
- 地址
- 标签猜测
- 首次活跃
- 最近活跃
- 当前活跃状态

### 2. 流水统计

- 总流入
- 总流出
- 交易次数
- 时间分布
- 显著大额交易

### 3. 资产与余额

- 当前原生币余额
- 主要资产
- 近期显著变化

### 4. 对手方与交互模式

- 高频交互地址
- 可能的交易所、桥、合约或 program
- 交互集中度

### 5. 风险与特征判断

- 沉睡地址
- 归集地址
- 中转密集
- 疑似机器人
- 疑似交易所热钱包
- 证据不足时明确写出证据不足

### 6. 结论摘要

- 3 到 6 行摘要
- 说明该地址像什么类型
- 说明最近在做什么
- 说明是否值得进一步追踪

## 会话行为

- 保留现有 `SessionManager` 及 JSONL 会话格式
- 不新增专有会话数据库
- `/analyze` 的结果直接进入普通消息流
- 后续追问沿用已有上下文
- 不要求自定义 session schema 即可完成 MVP

如果后续需要“当前分析地址”的 UI 状态栏，可在后续版本通过扩展消息或 session metadata 增量加入，不作为 MVP 依赖。

## UI 改动边界

### 必做

- 启动标题和帮助文本体现 `墨链`
- 新二进制入口 `mlens`
- 新主命令 `/analyze`
- 默认系统提示词变更为链上地址分析定位

### 保持不变

- 编辑器
- 消息渲染
- 工具执行组件
- 会话树
- 设置页
- 模型切换
- 快捷键主流程

### 明确不纳入 MVP

- 定制化报告面板
- 自定义图表区
- 资金路径可视化
- 全新首页布局

## 错误处理

### 地址格式错误

- 直接拒绝
- 返回支持的链类型提示

### 链别歧义

- `ETH/BSC` 不自动猜
- 明确要求用户补充链别

### 第三方 API 失败

- 工具返回结构化错误
- Agent 向用户说明失败链别、失败工具和失败原因

### 数据不完整

- `sourceMeta.partial = true`
- 报告中明确说明仅基于当前公开数据源

### 无法形成判断

- 报告允许输出“证据不足”
- 禁止无依据强行贴标签

## 测试策略

MVP 测试分为四类。

### 1. 工具适配层单测

验证第三方返回能稳定转换为 `AddressOverview`。

建议位置：

- `packages/coding-agent/test/molian/providers/*.test.ts`

### 2. 地址识别单测

验证：

- `BTC` 地址识别
- `SOL` 地址识别
- `EVM` 地址识别
- `ETH/BSC` 歧义分支

建议位置：

- `packages/coding-agent/test/molian/resolve-chain.test.ts`

### 3. 命令入口测试

验证 `/analyze`：

- 参数解析
- 缺少地址时报错
- 歧义链别提示
- 命令生成的用户消息模板

建议位置：

- `packages/coding-agent/test/molian/analyze-command.test.ts`

### 4. 会话级集成测试

验证：

- `/analyze` 之后能进入工具调用
- 工具结果进入消息流
- 报告输出后可继续追问

建议位置：

- `packages/coding-agent/test/molian/session-flow.test.ts`

MVP 不做真实第三方 API 的不稳定端到端测试；外部依赖通过夹具或 provider mock 固定。

## 交付边界

MVP 交付项：

- `墨链 链镜` 独立入口
- 品牌化启动和帮助文案
- `/analyze <address> [chain]`
- `ETH / BSC / BTC / SOL` 单地址分析
- 固定结构报告
- 第三方公开数据源适配层
- 同会话追问能力

MVP 不包含：

- 多地址对比
- 地址关系图
- 图形化路径分析
- 批量文件导入分析
- 自建数据仓
- 外部客户权限和租户系统

## 演进路径

如果 MVP 验证有效，后续优先级建议为：

1. 多地址批量分析
2. 关系和路径视图
3. 更强的标签体系
4. 内部数据源切换
5. 从 `packages/coding-agent` 中抽离为独立 package

## 实施约束

- 保持 `pi` 默认行为向后兼容
- 不删除现有功能
- 尽量通过新入口、配置装配和内置扩展完成产品化
- 会话格式不变
- 第三方 provider 仅通过适配器引入，不在 UI 层直接引用

## 本设计的最终结论

`墨链 链镜` MVP 采用“基于 `packages/coding-agent` 的独立品牌入口 + 内置扩展 + 链上工具适配层”的实现方式。第一版不重写现有 TUI 骨架，而是在保留 `pi` 会话和编码能力的前提下，增加一个以 `/analyze` 为中心的单地址链上公共数据分析工作流。
