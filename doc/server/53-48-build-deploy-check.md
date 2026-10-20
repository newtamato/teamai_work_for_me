# 53.48 上 caii-server 各服务编译/部署可行性检查

> 检查时间：2026-08-19  
> 服务器：`root@192.168.53.48`  
> 目录：`/root/projects/caii-server`  
> 检查方式：只做构建环境、工程文件、依赖、语法/链接探测；没有替换线上文件、没有启动/停止业务服务。

## 1. 总体结论

当前 53.48 上：

- **可以确认能命令行编译出可执行文件的服务：`caiihall`**。
- **其它核心服务暂时不能直接在 53.48 命令行编译**，主要原因是仓库缺少 `third_party/common_utils` 相关源码/头文件，且 Linux 上没有可直接使用的 VS/MSBuild 工具链。
- 仓库根目录 CMake 当前也不完整，不能直接用来编译全部服务，甚至 `caiichunksvr` 的 CMake 配置阶段也会失败。

简表：

| 服务 | 作用 | 53.48 当前能否命令行编译 | 能否部署 | 主要原因 |
| --- | --- | --- | --- | --- |
| `caiihall` | 大厅服 | **可以，已实测链接成功** | 可以手工部署 | 源码引用完整，依赖库存在 |
| `caiichunksvr` | 业务服 | 暂时不行 | 暂时不建议 | CMake 缺文件；源码缺 `configloader/*` 等 common_utils 头/源 |
| `caiisvr` | 游戏服 | 暂时不行 | 暂时不建议 | 缺 `dingding.h` / common_utils 相关源码；无可用命令行工程 |
| `caiilivesvr` | 直播/聊天服 | 暂时不行 | 暂时不建议 | 缺 `yqudp.h` / common_utils 相关头；无可用命令行工程 |
| `caiirobotsvr` | 机器人服 | 暂时不行 | 暂时不建议 | 缺 `game_hall_def2.h` / common_utils 相关源码 |
| `caiiassistsvr` | 辅助/支付服 | 暂时不行 | 暂时不建议 | 缺 `buspool.hpp` / common_utils 相关源码 |
| `caiilogsvr` | 日志服 | 暂时不行 | 暂时不建议 | vcxproj 引用的 `../common/configloader/*` 等文件缺失 |

## 2. 53.48 环境

已确认服务器上有：

```text
cmake: /root/cmake-4.1.0-rc4-linux-x86_64/bin/cmake
make:  /usr/bin/make
g++:   /usr/bin/g++
g++:   GCC 9.3.1
```

没有：

```text
msbuild
dotnet
devenv
xbuild
ninja
```

所以 `.sln/.vcxproj` 这类 Visual Studio Linux 工程不能直接在 53.48 上用 MSBuild 编译。

## 3. 依赖库情况

53.48 上大部分工程依赖库存在，包括：

```text
spdlog
mysqlcppconn
mysqlclient
yqgame
yqnetwrapper
yqnet
yqhttp
protobuf
tclog
log4cplus / log4cplusS
jsoncpp
boost_filesystem
boost_system
boost_thread
boost_date_time
boost_regex
boost_serialization
boost_url
boost_json
pthread
z
ssl
crypto
cryptopp
hiredis
hiredis_ssl
yqredis
yqrabbitmq
rabbitmq
```

典型路径：

```text
/usr/local/CoLibs/gcc9.1/CoYqLib/include
/usr/local/CoLibs/gcc9.1/CoYqLib/lib
/usr/local/CoLibs/gcc9.1/third_party/include
/usr/local/CoLibs/gcc9.1/third_party/lib
/usr/local/CoLibs/gcc9.1/third_party/lib64
/usr/local/lib/yqlib
/usr/local/include/yqinclude
```

也就是说当前最大问题不是系统库缺失，而是仓库内公共源码/头文件和命令行构建系统不完整。

## 4. 根 CMake 状态

仓库根目录有：

```text
CMakeLists.txt
CMakePresets.json
cmake/base.cmake
cmake/caiichunksvr.cmake
```

但根 CMake 当前只 include 了：

```cmake
include(${CMAKE_CURRENT_SOURCE_DIR}/cmake/caiichunksvr.cmake)
```

也就是说 CMake 只配置了 `caiichunksvr` target，没有 `caiisvr`、`caiihall`、`caiilivesvr`、`caiirobotsvr`、`caiiassistsvr` 等 target。

尝试执行：

```bash
cd /root/projects/caii-server
cmake --preset linux-debug
```

失败 1：CMake 4.1 对老版本 RapidJSON CMakeLists 不兼容：

```text
Compatibility with CMake < 3.5 has been removed from CMake.
```

加兼容参数后：

```bash
cmake -S . -B out/build/linux-debug-system \
  -DCMAKE_BUILD_TYPE=Debug \
  -DCMAKE_POLICY_VERSION_MINIMUM=3.5
```

失败 2：缺少 CMake 引用文件：

```text
include could not find requested file:
/root/projects/caii-server/common/common_file_list.cmake
```

因此根 CMake 当前不能直接作为稳定构建入口。

## 5. 各服务详细检查

### 5.1 `caiihall`

工程文件：

```text
caiihall/caiihall.sln
caiihall/caiihall.vcxproj
```

`.vcxproj` 引用情况：

```text
ClCompile: 9
ClInclude: 9
缺失引用: 0
```

源码列表：

```text
pb/hall/hall_game.pb.cc
caiihall/client/block_client.cpp
caiihall/client/notify_client.cpp
caiihall/hall_common/common_func.cpp
caiihall/hall_common/yqudp.cpp
caiihall/main.cpp
caiihall/main_server.cpp
caiihall/manager/hall_cache.cpp
caiihall/manager/hall_config.cpp
```

已做语法检查：所有 `.cpp` 均通过，仅有 deprecated warning。

已做实际链接编译，命令输出结论：

```text
BUILD_OK
```

临时产物：

```text
/tmp/caii-build-check-hall/caiihall
```

因此：

```text
caiihall 当前可以在 53.48 上命令行编译。
```

部署输入文件：

```text
caiihall/ini/caiihall.ini
caiihall/ini/caiihall_log.ini
```

`.vcxproj` 对 `caiihall` 没有有效 RemotePostBuild 部署命令；如果需要部署，需要约定目标目录，例如：

```text
/root/projects/caii-server/bin/x64/Debug/
```

然后手工复制：

```bash
mkdir -p bin/x64/Debug
cp /tmp/caii-build-check-hall/caiihall bin/x64/Debug/
cp caiihall/ini/*.ini bin/x64/Debug/
```

> 本次检查没有执行上述部署复制。

### 5.2 `caiichunksvr`

工程文件：

```text
caiichunksvr/caiichunksvr.sln
caiichunksvr/caiichunksvr.vcxproj
```

`.vcxproj` 引用情况：

```text
ClCompile: 92
ClInclude: 154
缺失引用: 65
```

典型缺失：

```text
../third_party/common_utils/buspool.hpp
../third_party/common_utils/cohttp/cohttp_func.h
../third_party/common_utils/configloader/config_loader.h
../third_party/common_utils/configloader/mconfig/config.h
../third_party/common_utils/dingding.h
../third_party/common_utils/game_hall_def2.h
../third_party/common_utils/mysql/db_schema.cpp
../third_party/common_utils/mysql/mysql_mgr.cpp
../third_party/common_utils/redis/redis_mgr.cpp
../third_party/common_utils/redis/redis_pool.cpp
```

入口语法探测：

```text
fatal error: configloader/config_loader.h: No such file or directory
```

CMake 也不能配置通过，原因见第 4 节。

结论：

```text
caiichunksvr 当前不能直接编译。需要补齐 common_utils 和 common_file_list.cmake，或重建 CMake target。
```

部署输入文件包括：

```text
caiichunksvr/config/*.json
caiichunksvr/ini/*.ini
```

`.vcxproj` post build 逻辑大致是：

```bash
mkdir -p config
cp -r config $(RemoteOutDir)
cp -u ini/*.ini $(RemoteOutDir)
```

### 5.3 `caiisvr`

工程文件：

```text
caiisvr/caiisvr.sln
caiisvr/caiisvr.vcxproj
```

`.vcxproj` 引用情况：

```text
ClCompile: 63
ClInclude: 123
缺失引用: 64
```

典型缺失：

```text
../third_party/common_utils/cohttp/cohttp_func.cpp
../third_party/common_utils/common_func.cpp
../third_party/common_utils/configloader/config_loader.cpp
../third_party/common_utils/dingding.cpp
../third_party/common_utils/mysql/db_schema.cpp
../third_party/common_utils/redis/redis_pool.cpp
../third_party/common_utils/yqspdlog/yqspdlog.cpp
```

入口语法探测：

```text
fatal error: dingding.h: No such file or directory
```

结论：

```text
caiisvr 当前不能直接编译。需要补齐 common_utils 或改 include/source 引用。
```

部署输入文件：

```text
caiisvr/config/*.json
caiisvr/ini/*.ini
```

`.vcxproj` post build 逻辑：

```bash
mkdir -p ../bin/x64/Debug/config
cp -u config/*.json ../bin/x64/Debug/config/
cp -u ini/*.ini ../bin/x64/Debug/
```

### 5.4 `caiilivesvr`

工程文件：

```text
caiilivesvr/caiilivesvr.sln
caiilivesvr/caiilivesvr.vcxproj
```

`.vcxproj` 引用情况：

```text
ClCompile: 38
ClInclude: 63
缺失引用: 47
```

典型缺失：

```text
../third_party/common_utils/common_func.h
../third_party/common_utils/configloader/config_loader.h
../third_party/common_utils/dingding.h
../third_party/common_utils/game_hall_def2.h
../third_party/common_utils/redis/redis_pool.h
../third_party/common_utils/yqspdlog/yqspdlog.h
```

入口语法探测：

```text
fatal error: yqudp.h: No such file or directory
```

注意：仓库中存在其它服务自己的 `yqudp.h`，例如：

```text
caiihall/hall_common/yqudp.h
caiilogsvr/yqudp.h
```

但 `caiilivesvr` 的工程引用/当前 include 路径下没有找到它需要的版本。

结论：

```text
caiilivesvr 当前不能直接编译。
```

部署输入文件：

```text
caiilivesvr/config/*.json
caiilivesvr/ini/*.ini
```

`.vcxproj` post build 逻辑：

```bash
mkdir -p config
cp -r config $(RemoteOutDir)
cp -u ini/*.ini $(RemoteOutDir)
```

### 5.5 `caiirobotsvr`

工程文件：

```text
caiirobotsvr/caiirobotsvr.sln
caiirobotsvr/caiirobotsvr.vcxproj
```

`.vcxproj` 引用情况：

```text
ClCompile: 40
ClInclude: 99
缺失引用: 59
```

典型缺失：

```text
../third_party/common_utils/cohttp/cohttp_func.cpp
../third_party/common_utils/common_func.cpp
../third_party/common_utils/configloader/config_loader.cpp
../third_party/common_utils/game_hall_def2.h
../third_party/common_utils/redis/redis_pool.cpp
../third_party/common_utils/yqspdlog/yqspdlog.cpp
```

入口语法探测：

```text
fatal error: game_hall_def2.h: No such file or directory
```

结论：

```text
caiirobotsvr 当前不能直接编译。
```

部署输入文件：

```text
caiirobotsvr/config/*.json
caiirobotsvr/ini/*.ini
```

`.vcxproj` post build 逻辑：

```bash
cp -u config/*.json ../bin/x64/Debug/config/
cp -u ini/*.ini ../bin/x64/Debug/
```

### 5.6 `caiiassistsvr`

工程文件：

```text
caiiassistsvr/caiiassistsvr.sln
caiiassistsvr/caiiassistsvr.vcxproj
```

`.vcxproj` 引用情况：

```text
ClCompile: 38
ClInclude: 114
缺失引用: 66
```

典型缺失：

```text
../third_party/common_utils/buspool.hpp
../third_party/common_utils/cohttp/cohttp_func.cpp
../third_party/common_utils/configloader/config_loader.cpp
../third_party/common_utils/dingding.cpp
../third_party/common_utils/mysql/mysql_mgr.cpp
../third_party/common_utils/redis/redis_pool.cpp
```

入口语法探测：

```text
fatal error: buspool.hpp: No such file or directory
```

结论：

```text
caiiassistsvr 当前不能直接编译。
```

部署输入文件：

```text
caiiassistsvr/config/dingding.json
caiiassistsvr/ini/*.ini
```

`.vcxproj` post build 逻辑：

```bash
cp -u config/dingding.json ../bin/x64/Debug/config/dingding.json
cp -u ini/$(TargetName).ini ../bin/x64/Debug
cp -u ini/$(TargetName)_log.ini ../bin/x64/Debug
```

### 5.7 `caiilogsvr`

工程文件：

```text
caiilogsvr/caiilogsvr.vcxproj
```

`.vcxproj` 引用情况：

```text
ClCompile: 11
ClInclude: 69
缺失引用: 15
```

典型缺失：

```text
../common/common_func.cpp
../common/configloader/config_loader.cpp
../common/configloader/mconfig/config.cpp
../common/configloader/mconfig/json_parse.cpp
../common/ref_object.hpp
../common/singleton.hpp
../common/work_thread.hpp
```

结论：

```text
caiilogsvr 当前不能直接编译。
```

## 6. 为什么多数服务现在不能编译

主要问题有三个：

### 6.1 缺 `third_party/common_utils`

多个服务 `.vcxproj` 都引用：

```text
../third_party/common_utils/...
```

但 53.48 当前仓库中这批文件不存在或为空，导致源码编译缺头/缺源。

### 6.2 根 CMake 不完整

根 CMake 只覆盖 `caiichunksvr`，而且还缺：

```text
common/common_file_list.cmake
```

### 6.3 Visual Studio Linux 工程不能直接在 Linux 上编译

`.sln/.vcxproj` 是 VS Linux 项目格式。正常用法是由 Windows 上的 Visual Studio 远程调用 Linux 编译；53.48 自己没有 `msbuild` 等工具，所以不能直接：

```bash
msbuild caiisvr.sln
```

## 7. 部署可行性

如果某服务能产出可执行文件，部署本身不复杂，主要是：

1. 复制二进制。
2. 复制 `ini/*.ini`。
3. 复制 `config/*.json`。
4. 确认运行目录和动态库路径。
5. 确认 MySQL/Redis/CheckSvr/LogSvr 等配置指向正确环境。

当前只有 `caiihall` 已实测能产出二进制，因此只有它可以进入“手工部署验证”阶段。

其它服务由于尚不能编译，不建议部署。

## 8. 建议下一步

### 短期：先补齐源码依赖

需要确认 `third_party/common_utils` 应该从哪里来：

- 是否是 git submodule 没拉？
- 是否是内部公共库没有提交？
- 是否原本依赖 `/usr/local/include/yqinclude` 中的已安装头，而 `.vcxproj` 仍引用旧路径？
- 是否 53.48 上的仓库不是完整版本？

优先检查：

```bash
git submodule status
git status --short
find third_party/common_utils -maxdepth 3 -type f | head
```

### 中期：修复 CMake

推荐补齐统一 CMake，而不是继续依赖 `.sln/.vcxproj`。

建议顺序：

1. 先让 `caiihall` 进入 CMake，因为它最小且已确认能编译。
2. 补 `common_file_list.cmake` 或改成 `file(GLOB...)` 方式。
3. 补齐 `third_party/common_utils` 后，依次加入：
   - `caiichunksvr`
   - `caiisvr`
   - `caiilivesvr`
   - `caiirobotsvr`
   - `caiiassistsvr`

### 长期：形成一键构建脚本

目标命令：

```bash
cmake -S . -B out/build/linux-debug -DCMAKE_BUILD_TYPE=Debug -DCMAKE_POLICY_VERSION_MINIMUM=3.5
cmake --build out/build/linux-debug -j$(nproc)
```

或：

```bash
./scripts/build-all.sh Debug
```

并统一输出到：

```text
bin/x64/Debug/
bin/x64/Release/
```

## 9. 本次检查没有做的事

- 没有修改 53.48 仓库源码。
- 没有部署到业务运行目录。
- 没有启动/停止任何业务进程。
- 没有修复 CMake。
- 没有补齐缺失的 `third_party/common_utils`。
