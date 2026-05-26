# mlens

`mlens` 是一个面向链上公开地址分析的命令行工具，主要用于生成单地址、单链的资产证明 HTML 报告。

它以 GitHub Releases 形式分发，不通过 npm 面向终端用户发布。

## 安装

安装最新版：

```bash
curl -fsSL https://raw.githubusercontent.com/97-web3/mlens-cli/main/install.sh | bash
```

安装指定版本，例如 `v0.1.2`：

```bash
MLENS_VERSION=v0.1.2 curl -fsSL https://raw.githubusercontent.com/97-web3/mlens-cli/main/install.sh | bash
```

安装完成后可验证：

```bash
mlens --version
mlens --help
```

## 更新

更新到最新版，直接重新执行安装命令即可：

```bash
curl -fsSL https://raw.githubusercontent.com/97-web3/mlens-cli/main/install.sh | bash
```

更新到指定版本：

```bash
MLENS_VERSION=v0.1.2 curl -fsSL https://raw.githubusercontent.com/97-web3/mlens-cli/main/install.sh | bash
```

如果你此前就是通过安装脚本安装的，一般不需要先卸载，重复执行会覆盖更新当前安装目录。

Windows 用户更新方式：
- 到 GitHub Releases 下载新的 `mlens-windows-x64.zip` 或 `mlens-windows-arm64.zip`
- 解压并替换旧版本文件

## 支持平台

- macOS Apple Silicon：`darwin-arm64`
- macOS Intel：`darwin-x64`
- Linux x64
- Linux arm64
- Windows x64 / arm64：通过 GitHub Releases 手动下载 zip

最新发布页：

https://github.com/97-web3/mlens-cli/releases/latest

## 首次使用

启动交互界面：

```bash
mlens
```

首次使用建议先完成链 API 配置：

```text
/chain-config
```

当前链配置说明：
- `eth`：需要 Etherscan API key
- `bsc`：需要 Etherscan V2 / BSC 对应 API key
- `tron`：需要 TronGrid API key
- `btc`：默认使用公开的 mempool 适配器，不要求单独配置 key

如果启动时检测到缺失配置，`mlens` 也会在界面里提示你补齐。

## 使用方法

### 1. 用命令直接生成报告

标准格式：

```text
/report <address> <chain> [output.html]
```

示例：

```text
/report 0x65f0ec303ad5007be21f6808febb3edccd1369e1 bsc
/report 0x464e146614D53B675B74cD04d2d727b2c04aeABa eth ./reports/my-eth-report.html
/report bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080 btc
```

支持链：
- `eth`
- `bsc`
- `tron`
- `btc`

如果不传输出路径，报告会默认写到当前工作目录下：

```text
./molian-reports/mlens-asset-proof-<chain>-<address>.html
```

### 2. 用自然语言发起报告流程

你也可以直接输入自然语言，`mlens` 会在识别到明确的“资产证明 / report”意图后，自动转成分阶段报告流程。

示例：

```text
给这个地址生成资产证明报告 0x65f0ec303ad5007be21f6808febb3edccd1369e1 bsc
帮我出一份这个地址的链上资产证明 0x464e146614D53B675B74cD04d2d727b2c04aeABa
```

建议：
- 最好同时给出地址和链，结果最稳定
- 如果没有给链，`mlens` 会尝试自动判断；无法确定时会继续追问

### 3. 查看帮助和版本

```bash
mlens --help
mlens --version
```

## 报告输出说明

生成的报告是 HTML 文件，适合：
- 本地浏览器打开
- 归档留存
- 发给他人查看

报告流程会分阶段执行，通常包括：
- 收集链上数据
- 构建量化报告
- 渲染 HTML
- 写入最终文件

## 常用示例

生成 BSC 地址报告：

```text
/report 0x65f0ec303ad5007be21f6808febb3edccd1369e1 bsc
```

生成 ETH 地址报告并指定输出文件：

```text
/report 0x464e146614D53B675B74cD04d2d727b2c04aeABa eth ./reports/eth-proof.html
```

直接让 agent 帮你出报告：

```text
请给这个地址生成资产证明报告 0x464e146614D53B675B74cD04d2d727b2c04aeABa eth
```

## 环境变量

- `MLENS_INSTALL_DIR`
  - 二进制和随附资源的解压目录
  - 默认：`~/.mlens`

- `MLENS_BIN_DIR`
  - `mlens` 包装脚本的安装目录
  - 默认优先：`/usr/local/bin`
  - 不可写时回退到：`~/.local/bin`

- `MLENS_VERSION`
  - 安装或更新指定 release tag
  - 例如：`v0.1.2`

## Windows 安装

Windows 不走 shell 安装脚本。

请直接从这里下载：

https://github.com/97-web3/mlens-cli/releases/latest

选择对应文件：
- `mlens-windows-x64.zip`
- `mlens-windows-arm64.zip`

解压后运行 `mlens.exe` 即可。

## 发行方式

`mlens` 当前只通过 GitHub Releases 分发：

https://github.com/97-web3/mlens-cli/releases
