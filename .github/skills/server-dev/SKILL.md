---
name: server-dev
description: Linux 服务端(C++)开发规范，实现或修改后端逻辑、TCP 协议处理时使用。
---

# 服务端开发（Linux / C++）

## 技术栈
- 语言：C++（C++17 起）
- 平台：Linux
- 网络：TCP 长连接 + Protobuf 序列化
- 构建：CMake

## 必须先读
1. `rules/api-contract.md` —— 接口/协议契约，一切网络消息以此为准
2. `rules/git-convention.md` —— 提交与分支规范

## 协议处理标准流程
收包 → 粘包/半包处理（按长度头拆帧）→ 反序列化 Protobuf → 按 msg_id 路由到 handler → 业务处理 → 序列化响应 → 回包

## 编码约定
- 网络层与业务层分离：编解码、连接管理独立成模块，业务 handler 不直接碰 socket
- 每个消息类型一个 handler 函数，用 msg_id 注册
- 所有对外接口校验参数 + 鉴权，异常要能被捕获并返回错误码，不能崩进程
- 用 RAII 管理 socket/fd，禁止裸 new/delete 管理连接生命周期
- 日志统一走日志模块，关键路径（建连、断连、错误）必须打日志

## 提交前自检
- [ ] 已按 api-contract.md 核对消息定义与 msg_id
- [ ] 粘包/半包处理正确（用多包、半包用例验证）
- [ ] 错误分支有处理，不会让进程崩溃
- [ ] 本地能编译通过（cmake + 构建脚本）
- [ ] 新增协议已同步更新 docs 中的接口清单
