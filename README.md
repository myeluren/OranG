# BidAI 智能投标标书生成系统

基于大语言模型（LLM）的智能投标标书生成系统，帮助投标企业大幅提升标书质量与交付速度。

## 功能特性

- **招标文件解析**：支持 PDF、Word 文档上传，自动提取文本内容
- **大纲智能生成**：LLM 精读招标文件，识别投标要求、评分标准，自动生成符合要求的大纲
- **内容自动生成**：逐章生成投标内容，支持断点续传
- **字数额度管理**：按订阅周期管理字数额度，支持额度耗尽回滚机制
- **多租户支持**：支持多企业/团队使用，数据隔离
- **管理后台**：用户管理、租户管理、套餐管理、LLM 配置、数据统计
- **双主题支持**：白天/深夜模式，响应式布局

## 技术栈

- **前端**：Next.js 14 + Tailwind CSS + shadcn/ui
- **后端**：Python 3.11 + FastAPI
- **数据库**：MySQL 8.0
- **任务队列**：Celery + Redis
- **部署**：Docker Compose

## 快速开始

### 前置要求

- Docker Desktop (Windows/Mac/Linux)
- 至少 4GB 可用内存

### 启动步骤

1. 克隆项目后，进入项目目录：

```bash
cd 智能投标V2
```

2. 复制环境变量文件：

```bash
cp .env.example .env
```

3. 使用 Docker Compose 启动所有服务：

```bash
docker-compose up -d
```

4. 等待服务启动完成后，访问：
   - 前端：http://localhost:3000
   - 后端 API：http://localhost:8000
   - API 文档：http://localhost:8000/docs

### 默认账号

首次启动后，使用以下账号登录管理后台：

- 用户名：admin
- 密码：Admin2026!

## 项目结构

```
智能投标V2/
├── backend/                 # FastAPI 后端
│   ├── app/
│   │   ├── api/            # API 路由
│   │   ├── core/           # 核心配置
│   │   ├── models/         # 数据库模型
│   │   └── schemas/        # Pydantic schemas
│   └── requirements.txt
│
├── frontend/               # Next.js 前端
│   ├── src/
│   │   ├── app/           # 页面
│   │   ├── components/    # 组件
│   │   └── lib/           # 工具函数
│   └── package.json
│
├── docker-compose.yml      # Docker 编排
├── init.sql                # 数据库初始化
└── README.md
```

## 主要页面

| 页面 | 路径 | 说明 |
|-----|-----|-----|
| 登录 | `/login` | 用户登录 |
| 注册 | `/register` | 用户注册 |
| 工作台 | `/dashboard` | 项目列表、概览 |
| 新建项目 | `/projects/new` | 创建标书项目 |
| 任务列表 | `/tasks` | 任务管理 |
| 账户 | `/account` | 账户信息 |
| 管理-用户 | `/admin/users` | 用户管理 |
| 管理-租户 | `/admin/tenants` | 租户管理 |
| 管理-套餐 | `/admin/plans` | 套餐管理 |
| 管理-LLM | `/admin/llm` | LLM 配置 |
| 管理-统计 | `/admin/stats` | 数据统计 |

## 配置说明

### 后端环境变量

| 变量 | 说明 | 默认值 |
|-----|-----|-------|
| DATABASE_URL | MySQL 连接字符串 | mysql+aiomysql://bidai:bidai2026@mysql:3306/bidai |
| REDIS_URL | Redis 连接字符串 | redis://redis:6379/0 |
| SECRET_KEY | JWT 密钥 | 需修改 |
| ACCESS_TOKEN_EXPIRE_MINUTES | Token 过期时间(分钟) | 1440 |

### 前端环境变量

| 变量 | 说明 | 默认值 |
|-----|-----|-------|
| NEXT_PUBLIC_API_URL | 后端 API 地址 | http://localhost:8000 |

## 许可证

MIT License
