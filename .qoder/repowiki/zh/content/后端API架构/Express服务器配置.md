# Express服务器配置

<cite>
**本文档引用的文件**
- [server/index.ts](file://server/index.ts)
- [server/admin-routes.ts](file://server/admin-routes.ts)
- [server/db.ts](file://server/db.ts)
- [server/auth.ts](file://server/auth.ts)
- [package.json](file://package.json)
- [ecosystem.config.cjs](file://ecosystem.config.cjs)
- [render.yaml](file://render.yaml)
- [vercel.json](file://vercel.json)
- [VERCEL_RAILWAY_DEPLOY.md](file://VERCEL_RAILWAY_DEPLOY.md)
</cite>

## 目录
1. [简介](#简介)
2. [项目结构](#项目结构)
3. [核心组件](#核心组件)
4. [架构概览](#架构概览)
5. [详细组件分析](#详细组件分析)
6. [依赖关系分析](#依赖关系分析)
7. [性能考虑](#性能考虑)
8. [故障排除指南](#故障排除指南)
9. [结论](#结论)

## 简介

这是一个基于Express.js的API服务器，专门为行程规划应用提供后端服务。该服务器采用现代JavaScript技术栈，集成了SQLite数据库、JWT认证系统和智能缓存策略。项目支持多种部署方式，包括本地开发、Vercel Serverless和Railway云平台。

## 项目结构

该项目采用模块化的服务器架构，主要由以下核心部分组成：

```mermaid
graph TB
subgraph "服务器层"
Express[Express服务器]
Middleware[中间件层]
Routes[路由层]
end
subgraph "业务逻辑层"
Auth[认证模块]
DB[数据库模块]
Cache[缓存模块]
end
subgraph "数据存储层"
SQLite[(SQLite数据库)]
POICache[POI缓存表]
UserDB[用户表]
TripDB[行程表]
end
subgraph "外部服务"
QwenAPI[豆包API]
OSRM[OSRM导航]
Email[邮件服务]
end
Express --> Middleware
Express --> Routes
Routes --> Auth
Routes --> DB
DB --> SQLite
SQLite --> POICache
SQLite --> UserDB
SQLite --> TripDB
Routes --> QwenAPI
Routes --> OSRM
Auth --> Email
```

**图表来源**
- [server/index.ts:29-790](file://server/index.ts#L29-L790)
- [server/db.ts:1-513](file://server/db.ts#L1-L513)

**章节来源**
- [server/index.ts:1-790](file://server/index.ts#L1-L790)
- [package.json:1-59](file://package.json#L1-L59)

## 核心组件

### 服务器初始化与配置

Express服务器在启动时进行以下关键配置：

1. **环境变量加载**：通过dotenv从`.env.local`文件加载配置
2. **端口配置**：支持PORT和API_PORT环境变量
3. **中间件配置**：启用CORS和JSON解析器
4. **静态文件服务**：提供生产环境的静态资源

### 数据库初始化

服务器使用better-sqlite3作为ORM，支持多种部署环境：

- **Vercel环境**：使用/tmp目录作为临时存储
- **Railway环境**：支持/data/aitrip持久化目录
- **本地开发**：使用项目内的server/data目录

### 缓存策略

实现了三层缓存机制：
- **新鲜缓存**：15天内有效
- **陈旧缓存**：15-30天内有效
- **过期缓存**：超过30天

**章节来源**
- [server/index.ts:55-62](file://server/index.ts#L55-L62)
- [server/db.ts:18-27](file://server/db.ts#L18-L27)
- [server/index.ts:64-66](file://server/index.ts#L64-L66)

## 架构概览

该Express服务器采用分层架构设计，清晰分离关注点：

```mermaid
sequenceDiagram
participant Client as 客户端
participant Express as Express服务器
participant Auth as 认证中间件
participant Handler as 业务处理器
participant DB as 数据库层
participant Cache as 缓存层
Client->>Express : HTTP请求
Express->>Auth : 验证JWT令牌
Auth->>Auth : 解析Authorization头
Auth->>Handler : 通过认证
Handler->>Cache : 检查缓存
Cache->>Cache : 返回缓存数据
Handler->>DB : 查询数据库
DB->>DB : 执行SQL查询
DB->>Handler : 返回查询结果
Handler->>Cache : 更新缓存
Cache->>Handler : 缓存成功
Handler->>Express : 处理响应
Express->>Client : HTTP响应
```

**图表来源**
- [server/index.ts:108-144](file://server/index.ts#L108-L144)
- [server/auth.ts:87-113](file://server/auth.ts#L87-L113)

## 详细组件分析

### CORS配置

服务器使用默认的CORS配置，允许跨域请求：

```mermaid
flowchart TD
Request[HTTP请求] --> OriginCheck{检查Origin}
OriginCheck --> |匹配| AllowAccess[允许访问]
OriginCheck --> |不匹配| BlockAccess[阻止访问]
AllowAccess --> Next[继续处理]
BlockAccess --> ErrorResponse[返回403错误]
Next --> Response[生成响应]
```

**图表来源**
- [server/index.ts:60-60](file://server/index.ts#L60-L60)

### JSON解析器设置

服务器配置了10MB的JSON解析限制：

```mermaid
classDiagram
class JSONParser {
+limit : "10mb"
+extended : true
+inflate : true
+strict : true
}
class ExpressApp {
+use(middleware)
+json(options)
}
ExpressApp --> JSONParser : 使用
```

**图表来源**
- [server/index.ts:61-61](file://server/index.ts#L61-L61)

### 静态文件服务

生产环境配置了静态文件服务：

```mermaid
flowchart LR
Request[静态文件请求] --> CheckRoute{检查API路由}
CheckRoute --> |匹配| API[API处理]
CheckRoute --> |不匹配| Static[静态文件服务]
Static --> Dist[dist目录]
Dist --> SPA[SPA回退]
SPA --> Index[index.html]
SPA --> Admin[admin.html]
```

**图表来源**
- [server/index.ts:766-774](file://server/index.ts#L766-L774)

### 认证系统

实现了完整的JWT认证机制：

```mermaid
classDiagram
class AuthMiddleware {
+optionalAuth(req, res, next)
+requireAuth(req, res, next)
+verifyToken(token)
}
class JWTToken {
+userId : number
+email : string
+iat : number
+exp : number
+createToken(userId, email)
+verifyToken(token)
}
class PasswordHash {
+hashPassword(password)
+verifyPassword(password, stored)
}
AuthMiddleware --> JWTToken : 使用
AuthMiddleware --> PasswordHash : 使用
```

**图表来源**
- [server/auth.ts:87-113](file://server/auth.ts#L87-L113)
- [server/auth.ts:47-81](file://server/auth.ts#L47-L81)

### 数据库管理

使用better-sqlite3实现数据持久化：

```mermaid
erDiagram
CITY_POIS {
TEXT city_id PK
TEXT data
INTEGER updated_at
}
USERS {
INTEGER id PK
TEXT email UK
TEXT password
TEXT nickname
TEXT avatar
INTEGER created_at
}
TRIPS {
TEXT id PK
INTEGER user_id FK
TEXT city_id
TEXT city_name
TEXT title
TEXT cover_image
TEXT trip_data
INTEGER is_published
INTEGER allow_comments
TEXT publish_note
INTEGER created_at
INTEGER updated_at
}
COMMENTS {
INTEGER id PK
TEXT trip_id FK
INTEGER user_id FK
TEXT content
INTEGER created_at
}
BOOKINGS {
TEXT id PK
INTEGER user_id FK
TEXT hotel_id
TEXT hotel_name
TEXT hotel_address
TEXT hotel_image
TEXT room_type_id
TEXT room_type_name
TEXT check_in
TEXT check_out
INTEGER nights
TEXT guest_name
TEXT guest_phone
TEXT guest_email
REAL total_price
TEXT status
TEXT city_name
INTEGER created_at
INTEGER updated_at
}
USERS ||--o{ TRIPS : creates
TRIPS ||--o{ COMMENTS : contains
USERS ||--o{ COMMENTS : writes
USERS ||--o{ BOOKINGS : makes
```

**图表来源**
- [server/db.ts:47-144](file://server/db.ts#L47-L144)

**章节来源**
- [server/auth.ts:1-133](file://server/auth.ts#L1-L133)
- [server/db.ts:1-513](file://server/db.ts#L1-L513)

### API路由组织

服务器提供了丰富的API端点：

#### POI相关路由
- `GET /api/pois/:cityId` - 获取城市POI列表
- `POST /api/pois/:cityId/refresh` - 强制刷新POI数据

#### 旅行行程路由
- `GET/POST/PUT/DELETE /api/trips` - 行程管理
- `POST /api/trips/:id/publish` - 发布为游记
- `GET /api/trips/:id/micro-notes` - 微游记管理

#### 用户认证路由
- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录
- `GET /api/auth/me` - 获取当前用户信息

#### 评论系统路由
- `GET/POST/DELETE /api/notes/:id/comments` - 评论管理

**章节来源**
- [server/index.ts:108-757](file://server/index.ts#L108-L757)

### 管理员路由

管理员面板提供了完整的数据管理功能：

```mermaid
flowchart TD
AdminAPI[管理员API] --> Stats[统计信息]
AdminAPI --> Cities[城市管理]
AdminAPI --> POIList[POI列表]
AdminAPI --> Reviews[数据审核]
AdminAPI --> Publishing[数据发布]
Stats --> Dashboard[仪表板统计]
Cities --> CRUD[增删改查]
POIList --> Search[全局搜索]
Reviews --> Diff[差异对比]
Publishing --> Batch[批量发布]
```

**图表来源**
- [server/admin-routes.ts:1-1476](file://server/admin-routes.ts#L1-L1476)

**章节来源**
- [server/admin-routes.ts:1-1476](file://server/admin-routes.ts#L1-L1476)

## 依赖关系分析

```mermaid
graph TB
subgraph "核心依赖"
Express[express: ^5.2.1]
Dotenv[dotenv: ^17.3.1]
BetterSqlite[better-sqlite3: ^12.8.0]
Cors[cors: ^2.8.6]
end
subgraph "开发依赖"
Typescript[typescript: ~5.6.2]
TSX[tsx: ^4.21.0]
Vite[vite: ^6.0.5]
React[react: ^18.3.1]
end
subgraph "服务器文件"
ServerIndex[server/index.ts]
ServerDB[server/db.ts]
ServerAuth[server/auth.ts]
AdminRoutes[server/admin-routes.ts]
end
ServerIndex --> Express
ServerIndex --> Dotenv
ServerDB --> BetterSqlite
ServerAuth --> Express
AdminRoutes --> Express
```

**图表来源**
- [package.json:26-57](file://package.json#L26-L57)

**章节来源**
- [package.json:1-59](file://package.json#L1-L59)

## 性能考虑

### 缓存优化策略

1. **智能缓存刷新**：后台异步刷新过期数据，避免Nginx超时
2. **缓存年龄监控**：实时跟踪缓存数据的新鲜度
3. **去重处理**：对缓存数据进行去重，提高数据质量

### 数据库优化

1. **WAL模式**：使用Write-Ahead Logging提高并发性能
2. **外键约束**：确保数据完整性
3. **索引策略**：合理使用索引提升查询性能

### 部署优化

1. **多环境支持**：支持Vercel Serverless和传统部署
2. **环境变量配置**：灵活的配置管理
3. **静态资源优化**：生产环境的静态文件服务

## 故障排除指南

### 常见问题及解决方案

#### 数据库连接问题
- **症状**：启动时数据库初始化失败
- **原因**：权限不足或路径不存在
- **解决**：检查DB_DIR环境变量和目录权限

#### API密钥配置问题
- **症状**：POI数据获取失败
- **原因**：ARK_API_KEY未配置
- **解决**：在.env.local中设置API密钥

#### 认证失败问题
- **症状**：JWT令牌验证失败
- **原因**：JWT_SECRET配置错误
- **解决**：检查JWT_SECRET环境变量

#### 静态文件服务问题
- **症状**：SPA路由返回404
- **原因**：静态文件路径配置错误
- **解决**：检查distPath配置

**章节来源**
- [server/db.ts:37-44](file://server/db.ts#L37-L44)
- [server/index.ts:755-757](file://server/index.ts#L755-L757)
- [server/auth.ts:10-11](file://server/auth.ts#L10-L11)

## 结论

该Express服务器配置展现了现代Web应用的最佳实践：

1. **模块化设计**：清晰的分层架构便于维护和扩展
2. **性能优化**：智能缓存和数据库优化策略
3. **安全考虑**：完整的认证授权机制
4. **部署灵活性**：支持多种部署方式
5. **可维护性**：良好的代码组织和文档

通过合理的配置和优化，该服务器能够稳定支持行程规划应用的各种需求，并为未来的功能扩展奠定了坚实基础。