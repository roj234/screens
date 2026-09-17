# screens — Web 终端管理工具

基于 Web 的命令行进程管理工具，可通过浏览器远程执行命令并实时查看输出。

## 功能特性

- **快捷方式（Preset）管理** — 预定义命令、工作目录、运行模式，一键启动
- **实时日志流** — 通过 WebSocket 推送 stdout/stderr 输出，支持虚拟滚动，加载较早的日志记录
- **多标签页** — 同时运行多个命令会话，互不干扰
- **系统监控** — CPU 与内存使用率实时图表，显示服务器运行时间
- **颜色渲染** — 支持ANSI SGI转义序列，并自动在日志中移除它们。
  - 你可能需要设置环境变量让子进程启用颜色

## 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
# 1. 构建前端
npm run dev

# 2. 启动后端（另一个终端）
node backend/server.js
```

### 生产模式

```bash
# 1. 构建
npm run build

# 2. 启动
node backend/server.js
```

服务默认监听 `http://localhost:3000`，可通过环境变量 `PORT` 修改端口。

## 项目结构

```
wssh/
├── backend/               # 后端源码
│   ├── server.js          # HTTP + WebSocket 服务入口
│   ├── process-manager.js # 进程生命周期管理
│   ├── preset-store.js    # 快捷方式持久化 (JSON 文件)
│   ├── system-info.js     # 系统信息采集 (CPU/内存)
│   ├── tokenizer.js       # 命令行参数解析
│   └── ring-buffer.js     # 环形缓冲区 (日志存储)
├── src/                   # 前端源码
│   ├── app.js             # 应用入口，初始化逻辑
│   ├── desktop.js         # 主页面 (快捷方式 + 系统监控)
│   ├── terminal.js        # 终端标签页 (日志渲染)
│   ├── tabs.js            # 标签页管理组件
│   ├── ws-client.js       # WebSocket 客户端 (含自动重连)
│   ├── charts.js          # Canvas 折线图组件
│   └── style.css          # 全局样式
├── data/                  # 运行时数据
│   └── presets.json       # 快捷方式存储
├── dist/                  # 构建产物
├── package.json
└── vite.config.js
```

## 使用说明

1. 打开浏览器访问 `http://localhost:3000`
2. 在左侧「新建快捷方式」表单中填写命令信息并保存
3. 点击快捷方式按钮即可启动命令会话
4. 切换标签页查看不同会话的实时输出
5. 右侧面板查看服务器 CPU / 内存状态

## 配置项

- `PORT` — 服务端口（默认 `3000`）
- 快捷方式中的「单例」选项可防止同一命令重复启动
- 日志模式选「文件」可将输出持久化到 `data/logs/` 目录

对 `preset.json` 的修改刷新网页生效，每个进程可以配置 env charset 等详细参数