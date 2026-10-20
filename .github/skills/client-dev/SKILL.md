---
name: client-dev
description: Unity 客户端(C#)开发规范，实现或修改客户端逻辑、网络收发时使用。
---

# 客户端开发（Unity / C#）

## 技术栈
- 引擎：Unity
- 语言：C#
- 网络：TCP 长连接 + Protobuf（Google.Protobuf）
- 测试：Unity Test Framework / NUnit

## 必须先读
1. `rules/api-contract.md` —— 接口/协议契约
2. `rules/git-convention.md` —— 提交与分支规范

## 网络层约定
- 所有 socket 收发集中在网络层模块，业务脚本不直接碰 socket
- 收到消息后在主线程统一派发（注意 Unity 线程安全：socket 收包在工作线程，回调要 marshal 回主线程）
- 编解码用生成的 Protobuf 类，禁止手写字节拼接
- 消息帧格式与字段必须严格对齐 rules/api-contract.md

## 目录约定
- 脚本放 Assets/Scripts 下，按功能分子目录
- 网络层、UI、数据、逻辑分层，禁止一个脚本塞所有逻辑

## 提交前自检
- [ ] 已按 api-contract.md 核对消息定义与 msg_id
- [ ] 在 Editor 下能编译通过（无报错）
- [ ] 网络收发在 Editor 里模拟服务器自测过
- [ ] 新增协议已同步更新 docs 中的接口清单
