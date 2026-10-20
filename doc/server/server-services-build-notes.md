# caii-server 服务拆分与编译现状

> 生成时间：2026-08-19  
> 范围：基于当前 `caii-server` 仓库、已有配置、CMake/Visual Studio Linux 工程文件，以及对服务器 `192.168.53.48:/root/projects/caii-server` 的一次编译环境检查。

## 1. 主要服务目录

当前仓库下主要 server 目录：

```text
caiisvr          游戏服，管理房间、桌子、匹配、牌局状态、结算触发等
caiichunksvr     业务服，玩家资产、排行、任务、道具、礼物、关注粉丝、联盟等
caiihall         大厅服，对接 checksvr/block 相关大厅连接、房间配置更新等
caiilivesvr      直播/桌内聊天服，管理 LiveChat、观众、聊天广播、礼物聊天通知等
caiirobotsvr     机器人服，生成机器人资料、机器人隐藏分/档位、进入游戏等
caiiassistsvr    辅助服，支付/RabbitMQ/业务辅助通知相关
caiilogsvr       日志服
caiimpsvr        game mp 代理/网关配置目录
caiihallmp       hall mp 代理/网关配置目录
caiilivempsvr    live mp 代理/网关配置目录
caiiassistmpsvr  assist mp 代理/网关配置目录
TestServer       测试服务/测试聊天实现
```

## 2. 服务之间的大致关系

```text
客户端
  │
  ├─ 大厅连接 → caiihall / caiihallmp
  │      └─ 获取用户/大厅状态、房间配置变更等
  │
  ├─ 游戏连接 → caiisvr / caiimpsvr
  │      ├─ 匹配、房间、桌子、牌局流程
  │      ├─ 需要玩家业务数据时访问 caiichunksvr
  │      └─ 需要机器人时对接 caiirobotsvr
  │
  ├─ 直播/聊天连接 → caiilivesvr / caiilivempsvr
  │      ├─ 桌内聊天/直播聊天实时广播
  │      ├─ 观众/主播/LiveChat 缓存
  │      └─ 礼物相关业务会对接 caiichunksvr
  │
  └─ 辅助/支付/业务通知 → caiiassistsvr / caiiassistmpsvr
         └─ RabbitMQ、支付回调、业务辅助通知等

caiichunksvr
  ├─ MySQL: caiidb
  ├─ Redis: 玩家缓存、排行榜、任务、粉丝关注、联盟、活动、锁等
  └─ LogSvr: 业务日志发送
```

## 3. 和前面分析主题的对应关系

| 主题 | 主要服务 | 说明 |
| --- | --- | --- |
| 实时房间/桌子/匹配 | `caiisvr` | 房间和桌子主要在内存对象里，不是 MySQL 表直接存实时桌子 |
| 隐藏分匹配 | `caiisvr` | `tbl_player_hide_score` + Redis 缓存，匹配默认使用 `GameUser::HideScore()` |
| 玩家资产/排行/任务 | `caiichunksvr` | 大部分 MySQL/Redis 业务数据在这里处理 |
| 粉丝/关注 | `caiichunksvr` | `tbl_player_follow` / `tbl_player_fans`，新粉丝通知也是这里发 |
| 亲密度 | `caiichunksvr` | `tbl_player_friendship`，送礼/VIP 对局等增加 |
| 直播/桌内聊天 | `caiilivesvr` | 当前生产逻辑主要实时转发，未看到写聊天历史 Redis 的逻辑 |
| 机器人/AI | `caiirobotsvr` + `caiisvr` | 机器人隐藏分/档位在 robotsvr，游戏服触发机器人进入 |

## 4. 编译工程现状

仓库根目录有一个 CMake：

```text
CMakeLists.txt
CMakePresets.json
cmake/base.cmake
cmake/caiichunksvr.cmake
```

但当前根 CMake 只 include 了：

```cmake
include(${CMAKE_CURRENT_SOURCE_DIR}/cmake/caiichunksvr.cmake)
```

也就是说：

```text
当前 CMake 只定义了 caiichunksvr target。
```

其它服务主要是 Visual Studio Linux 工程：

```text
caiisvr/caiisvr.sln + caiisvr.vcxproj
caiihall/caiihall.sln + caiihall.vcxproj
caiilivesvr/caiilivesvr.sln + caiilivesvr.vcxproj
caiirobotsvr/caiirobotsvr.sln + caiirobotsvr.vcxproj
caiiassistsvr/caiiassistsvr.sln + caiiassistsvr.vcxproj
caiilogsvr/caiilogsvr.vcxproj
```

这些 `.vcxproj` 是 Linux 项目，里面包含远程 Linux 编译路径、include path、library path、post build command 等，例如：

```text
/usr/local/CoLibs/gcc9.1/CoYqLib/include
/usr/local/CoLibs/gcc9.1/third_party/include
/usr/local/include/yqinclude
/usr/local/lib/yqlib/...
```

## 5. 服务器编译环境检查

已确认可以 SSH 到：

```text
root@192.168.53.48:/root/projects/caii-server
```

服务器上存在：

```text
cmake: /root/cmake-4.1.0-rc4-linux-x86_64/bin/cmake
make:  /usr/bin/make
g++:   /usr/bin/g++
```

并且存在部分依赖目录：

```text
/usr/local/CoLibs/gcc9.1/CoYqLib/include
/usr/local/lib/yqlib
```

## 6. 已尝试的 CMake 配置结果

尝试在服务器执行：

```bash
cd /root/projects/caii-server
cmake --preset linux-debug
```

第一次失败原因：服务器上的 CMake 是 4.1，`third_party/rapidjson` 的 `cmake_minimum_required` 太老，CMake 4 默认不兼容。

错误摘要：

```text
Compatibility with CMake < 3.5 has been removed from CMake.
add -DCMAKE_POLICY_VERSION_MINIMUM=3.5 to try configuring anyway.
```

继续加兼容参数：

```bash
cmake -S . -B out/build/linux-debug-system \
  -DCMAKE_BUILD_TYPE=Debug \
  -DCMAKE_POLICY_VERSION_MINIMUM=3.5
```

第二次失败原因：当前仓库缺少 CMake 引用的文件：

```text
/root/projects/caii-server/common/common_file_list.cmake
```

错误摘要：

```text
include could not find requested file:
/root/projects/caii-server/common/common_file_list.cmake
```

因此：

```text
当前仓库的 CMake 编译链路还不完整，至少 caiichunksvr 不能直接通过现有 CMake 配置成功。
```

## 7. 我能否在服务器上编译这些服务？

可以，但目前分两种情况：

### 7.1 直接能尝试的

服务器连接和基础工具是可用的，可以继续尝试编译。

### 7.2 当前阻塞点

目前不能“一条命令直接编译全部服务”，原因：

1. 根 CMake 只配置了 `caiichunksvr`。
2. 根 CMake 还引用了缺失文件 `common/common_file_list.cmake`。
3. 其它服务没有 CMake target，主要依赖 Visual Studio Linux `.vcxproj` 工程。
4. 如果不通过 Visual Studio Remote Build，就需要把 `.vcxproj` 中的源文件/include/lib 配置迁移成 CMake 或 Makefile。

## 8. 建议下一步

如果目标是“服务器上一键编译几个核心服务”，建议做以下之一：

### 方案 A：修复并扩展 CMake，推荐

1. 补齐或生成 `common/common_file_list.cmake`。
2. 确认 `pb/pb_file_list.cmake` 是否完整。
3. 为以下服务分别添加 CMake target：
   - `caiisvr`
   - `caiichunksvr`
   - `caiihall`
   - `caiilivesvr`
   - `caiirobotsvr`
   - `caiiassistsvr`
4. 加一个总 target 或脚本：

```bash
cmake -S . -B out/build/linux-debug -DCMAKE_BUILD_TYPE=Debug -DCMAKE_POLICY_VERSION_MINIMUM=3.5
cmake --build out/build/linux-debug -j$(nproc)
```

优点：后续可重复、可自动化、可 CI。

### 方案 B：沿用 Visual Studio Linux 项目

用 VS Remote Linux 工具链打开 `.sln` 编译。

优点：改动小。  
缺点：不适合我在命令行里自动化批量构建，也不适合后续 CI。

### 方案 C：手工从 `.vcxproj` 生成 Makefile

解析各服务 `.vcxproj` 中的：

- `ClCompile`
- `ClInclude`
- `IncludePath`
- `LibraryPath`
- `LibraryDependencies`

生成每个服务的编译脚本。

优点：不必完整改 CMake。  
缺点：后续维护成本较高。

## 9. 当前推荐

推荐先走方案 A：修复 CMake。因为当前仓库已经有 CMake 基础，只是没有覆盖全部服务。

优先顺序：

1. 先让 `caiichunksvr` CMake 编译通过。
2. 再加入 `caiisvr`。
3. 然后加入 `caiilivesvr`、`caiihall`、`caiirobotsvr`、`caiiassistsvr`。

这样后面分析、改代码、验证都会更方便。
