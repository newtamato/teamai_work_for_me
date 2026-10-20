# 直接在 Linux 上编译 VS Linux 工程的工作流

> 生成时间：2026-08-19  
> 目标：减少“本机写代码 → Windows VS2019 打开 → 远程编译到 53.48”的繁琐流程，让 53.48 可以直接命令行编译服务。

## 1. 当前背景

这些服务的 `.sln/.vcxproj` 是 Visual Studio Linux 工程。原始工作流是：

```text
Windows 53.16 / Visual Studio 2019
  -> 打开 caiisvr.sln
  -> VS 通过 SSH 同步源码到 Linux 53.48
  -> VS 在 53.48 调 g++ 编译
```

这种方式的问题：

1. 必须打开 Windows + VS。
2. 53.48 上虽然实际执行的是 g++，但没有独立的 Linux 构建入口。
3. 直接在 `/root/projects/caii-server` 下跑 CMake 目前不行，因为根 CMake 不完整。

## 2. 已确认的关键点

53.16 上这份源码：

```text
F:\teen_projects\callbreak_assist_linux_server\caii-server
```

`third_party/common_utils` 已经初始化，有约 123 个文件。

53.48 上由 VS2019 同步出来的远程编译目录：

```text
/root/projects/caiisvr
```

里面也有完整的：

```text
/root/projects/caiisvr/third_party/common_utils
```

这说明：

```text
VS2019 能编译的关键，是它把完整 common_utils 同步到了 53.48 的 /root/projects/caiisvr。
```

而之前手工检查的：

```text
/root/projects/caii-server
```

里的 `third_party/common_utils` 没有初始化，所以很多服务不能直接编译。

## 3. 新增脚本

新增脚本：

```text
scripts/build-vs-linux-project.py
```

作用：

- 直接读取 `.vcxproj`。
- 提取 `ClCompile` 源文件列表。
- 提取 Linux `IncludePath`。
- 提取 Linux `LibraryPath`。
- 提取 `LibraryDependencies`。
- 用 Linux 上的 `g++` 编译 object。
- 支持增量编译。
- 支持 `--jobs` 并行编译。
- 最后链接出服务可执行文件。

这样就不依赖 Windows 上的 Visual Studio/MSBuild。

## 4. 推荐命令

在 53.48 上，如果使用 VS 已同步出来的目录：

```bash
cd /root/projects/caiisvr
./build-vs-linux-project.py caiisvr/caiisvr.vcxproj --config Debug --platform x64 --jobs 4
```

默认输出：

```text
/root/projects/caiisvr/bin/x64/Debug/caiisvr
```

也可以指定输出路径：

```bash
./build-vs-linux-project.py caiisvr/caiisvr.vcxproj \
  --config Debug \
  --platform x64 \
  --jobs 4 \
  --output /root/projects/caiisvr/bin/x64/Debug/caiisvr
```

清理后重编：

```bash
./build-vs-linux-project.py caiisvr/caiisvr.vcxproj --config Debug --platform x64 --jobs 4 --clean
```

只检查命令，不实际编译：

```bash
./build-vs-linux-project.py caiisvr/caiisvr.vcxproj --config Debug --platform x64 --dry-run
```

## 5. 使用前提

### 5.1 源码必须完整

直接 Linux 编译需要目录里有完整的：

```text
third_party/common_utils
```

否则会报类似：

```text
Missing source files:
  third_party/common_utils/cohttp/cohttp_func.cpp
```

或：

```text
fatal error: configloader/config_loader.h: No such file or directory
```

### 5.2 不建议直接用当前 `/root/projects/caii-server`

当前 `/root/projects/caii-server` 的 `third_party/common_utils` 没初始化，且 53.48 直接拉 submodule 会因为内部 GitLab 凭据失败：

```text
fatal: could not read Username for 'http://gitlab.comfun.org': No such device or address
```

因此短期建议使用 VS 已同步出来的目录：

```text
/root/projects/caiisvr
```

或者把 53.16 上完整的 `third_party/common_utils` 同步到 `/root/projects/caii-server`。

## 6. 当前验证状态

已完成：

1. 确认 53.16 本地 `common_utils` 已存在。
2. 确认 53.48 的 VS 远程目录 `/root/projects/caiisvr` 中 `common_utils` 已存在。
3. 新增 `scripts/build-vs-linux-project.py`。
4. 脚本已同步测试到 53.48 的 `/root/projects/caiisvr/build-vs-linux-project.py`。

已验证成功：

```bash
cd /root/projects/caii-server
scripts/build-caiisvr-linux.sh
```

成功生成：

```text
/root/projects/caii-server/bin/x64/Debug/caiisvr
/root/projects/caii-server/bin/x64/Debug/caiilivesvr
/root/projects/caii-server/bin/x64/Debug/caiirobotsvr
/root/projects/caii-server/bin/x64/Debug/caiichunksvr
```

产物检查：

```text
caiisvr       179M  ELF 64-bit LSB executable, x86-64
caiilivesvr   131M  ELF 64-bit LSB executable, x86-64
caiirobotsvr  136M  ELF 64-bit LSB executable, x86-64
caiichunksvr  283M  ELF 64-bit LSB executable, x86-64
ldd: 均未发现 not found
```

批量构建命令：

```bash
cd /root/projects/caii-server
scripts/build-all-linux.sh
```

期间修复点：

- `.vcxproj` 的条件在 `ItemDefinitionGroup` 父层，脚本需要继承父层条件，否则会把其它配置的库也收进来。
- 静态库链接顺序敏感，脚本用 `-Wl,--start-group/--end-group` 包住库列表。
- 53.48 上 `/usr/local/lib/yqlib/hiredis-1.0.0/debug/libhiredis_ssl.a` 依赖 OpenSSL 1.0 老 API，而当前 OpenSSL 是 1.1.1；脚本在存在时优先使用 `/usr/local/CoLibs/gcc14.2/third_party/lib64/libhiredis.a` 和 `libhiredis_ssl.a`。
- 脚本补充解析 `.vcxproj` 的 `AdditionalIncludeDirectories` 和 `PreprocessorDefinitions`，否则 `caiilivesvr/caiirobotsvr/caiichunksvr` 会缺少 `WITHOUT_YQGAME`、`USE_REMOTE_CONFIG` 等宏。

## 7. 推荐后续改造方向

### 短期方案：脚本桥接 `.vcxproj`

继续使用现有 `.vcxproj` 作为权威工程文件，但 Linux 上通过脚本直接编译。

优点：

- 改动小。
- 不需要马上重写 CMake。
- Windows VS 和 Linux 命令行共用 `.vcxproj` 源文件列表。

缺点：

- 仍然依赖 `.vcxproj` 格式。
- 复杂 post-build、特殊宏、少数工程属性可能需要继续补适配。

### 中期方案：补完整 CMake

为每个服务补 CMake target：

```text
caiisvr
caiichunksvr
caiihall
caiilivesvr
caiirobotsvr
caiiassistsvr
```

优点：

- 更标准。
- 适合 CI。
- 更适合纯 Linux 开发。

缺点：

- 一次性迁移成本比脚本方案高。
- 需要把 `.vcxproj` 中的 include、lib、post-build 逻辑完整迁移到 CMake。

## 8. 建议工作流

短期可以这样：

```text
1. 继续用当前编辑器写代码。
2. 同步源码到 53.48 的完整工程目录。
3. 在 53.48 直接执行 build-vs-linux-project.py。
4. 编译成功后复制 ini/config 到 bin 目录或运行目录。
```

长期目标：

```bash
ssh root@192.168.53.48
cd /root/projects/caii-server
scripts/build-vs-linux-project.py caiisvr/caiisvr.vcxproj --config Debug --platform x64 --jobs 4
```

或迁移完成 CMake 后：

```bash
cmake -S . -B out/build/linux-debug -DCMAKE_BUILD_TYPE=Debug
cmake --build out/build/linux-debug -j$(nproc)
```
