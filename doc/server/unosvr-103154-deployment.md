# UNO Server 53.48 → 103.154 部署与管理

本文是 UNO 服务端开发环境的同步和运行手册。

## 1. 环境职责

| 环境 | 用途 |
|---|---|
| `192.168.53.48` | 个人开发、编译、功能测试 |
| `192.168.103.154` | 小组共享开发环境 |

53.48 是构建源环境。代码修改、编译和稳定性验证必须先在 53.48 完成，再同步到 103.154。

旧 Carrom 环境保持不动：

```text
/root/game/caiisvr
```

新 UNO 共享环境使用：

```text
/root/game/unosvr
```

## 2. 目录布局

```text
/root/game/unosvr/
├── bin/x64/Debug/
│   ├── assist/
│   ├── chat/
│   ├── chunk/
│   ├── hall/
│   ├── live/
│   ├── robot/
│   ├── svr/
│   └── test/
├── run/
├── runlogs/
├── deploy-manifest.sha256
└── manage-unosvr.sh
```

主要可执行文件：

```text
bin/x64/Debug/svr/caiisvr
bin/x64/Debug/chunk/caiichunksvr
bin/x64/Debug/live/caiilivesvr
bin/x64/Debug/robot/caiirobotsvr
bin/x64/Debug/assist/caiiassistmpsvr
bin/x64/Debug/assist/caiiassistsvr
bin/x64/Debug/hall/caiihall
bin/x64/Debug/hall/caiihallmp
bin/x64/Debug/test/caii-test
```

## 3. 编译命令

在 53.48 上执行。

### caiisvr

```bash
cd /root/projects/caii-server
./scripts/build-caiisvr-linux.sh Debug x64
```

输出：

```text
/root/projects/caii-server/bin/x64/Debug/svr/caiisvr
```

### caiichunksvr

```bash
cd /root/projects/caii-server
./scripts/build-caiichunksvr-linux.sh Debug x64
```

输出：

```text
/root/projects/caii-server/bin/x64/Debug/chunk/caiichunksvr
```

### 全量构建

```bash
cd /root/projects/caii-server
./scripts/build-all-linux.sh Debug x64
```

除非确实需要，否则不要为了单个服务使用全量构建。

## 4. 同步命令

同步脚本位于 53.48：

```text
/root/projects/caii-server/scripts/sync-unosvr-to-103154.sh
```

正常同步：

```bash
cd /root/projects/caii-server
./scripts/sync-unosvr-to-103154.sh
```

只查看待同步内容：

```bash
./scripts/sync-unosvr-to-103154.sh --dry-run
```

目标目录：

```text
root@192.168.103.154:/root/game/unosvr/bin/x64/Debug
```

同步内容包括：

- 可执行文件；
- `*.ini`；
- `*.json`；
- 各服务的 `config/`；
- UNO 运行所需的配置文件。

明确排除：

- `credentials.tsv`；
- `*.log`、日志备份；
- `*.pid`；
- `*.bak*`、`*.backup-*`；
- `runlogs/`；
- `.DS_Store` 和临时文件。

脚本不使用 `rsync --delete`，不会删除目标端额外文件。

同步完成后会生成：

```text
/root/game/unosvr/deploy-manifest.sha256
```

## 5. SSH 同步认证

53.48 使用专用密钥连接 103.154：

```text
/root/.ssh/unosvr_sync_ed25519
```

私钥只保留在 53.48，权限必须为 `600`。不要把私钥提交到 Git 或复制到工作区。

如需检查连接：

```bash
ssh -i /root/.ssh/unosvr_sync_ed25519 \
    -o IdentitiesOnly=yes \
    root@192.168.103.154 'echo sync-key-ok'
```

## 6. 103.154 配置覆盖

同步脚本会在目标环境应用以下环境差异，不修改 53.48 源配置：

### AssistMP

新部署的 `caiiassistmpsvr` 使用：

```text
192.168.103.154:4530
```

`hall/caiihall.ini` 会被设置为：

```ini
[assistsvr]
ip=192.168.103.154
port=4530
```

### Live MP 广告地址

`live/caiilivesvr.ini`：

```ini
mp_ip=192.168.103.154
```

### 其他服务

Chunk、Game、Live、Robot 等服务使用同步过来的 Debug 配置。若某服务的本地端口或依赖地址发生变化，应只修改 103.154 的部署配置，不要反向污染 53.48 的测试配置。

## 7. 服务管理

管理脚本位于：

```text
/root/game/unosvr/manage-unosvr.sh
```

查看全部服务：

```bash
cd /root/game/unosvr
./manage-unosvr.sh status all
```

启动全部服务：

```bash
./manage-unosvr.sh start all
```

停止全部服务：

```bash
./manage-unosvr.sh stop all
```

重启全部服务：

```bash
./manage-unosvr.sh restart all
```

单独操作：

```bash
./manage-unosvr.sh status caiichunksvr
./manage-unosvr.sh start caiichunksvr
./manage-unosvr.sh stop caiichunksvr
./manage-unosvr.sh restart caiichunksvr
```

支持的服务名称可通过脚本 usage 查看，主要包括：

```text
caiichunksvr
caiiassistmpsvr
caiiassistsvr
caiichatmpsvr
caiihallmp
caiihall
caiilivesvr
caiilivempsvr
caiirobotsvr
caiisvrmp
caiisvr
```

## 8. 启动顺序

`start all` 使用以下依赖顺序：

```text
caiichunksvr
→ caiiassistmpsvr
→ caiiassistsvr
→ caiichatmpsvr
→ caiihallmp
→ caiihall
→ caiilivesvr / caiilivempsvr
→ caiirobotsvr
→ caiisvrmp
→ caiisvr
```

Chunk 必须先启动，因为 Assist 服务启动时会立即连接 Chunk 的 `4520` 端口。停止时使用反向顺序。

脚本通过 `/proc/<pid>/exe` 检查进程，能够识别从服务目录执行的 `./caiisvr`、`./caiiassistsvr` 等进程，不依赖完整命令行参数。

## 9. 验证清单

同步后、启动前：

```bash
find /root/game/unosvr/bin/x64/Debug -type f | sort
sha256sum /root/game/unosvr/bin/x64/Debug/svr/caiisvr
sha256sum /root/game/unosvr/bin/x64/Debug/chunk/caiichunksvr
```

启动后：

```bash
./manage-unosvr.sh status all
ss -lntp
find /root/game/unosvr/runlogs -type f -maxdepth 1 -print
```

重点检查：

- Chunk 是否监听 `4520`；
- Game 是否监听配置中的 Game 端口；
- Live 是否监听 `4580`；
- Live MP 地址是否为 `192.168.103.154`；
- Hall 是否能连接本机 AssistMP `4530`；
- 启动日志中是否出现端口绑定失败或配置文件缺失；
- 新服务是否没有误使用 `/root/game/caiisvr` 的旧二进制。

## 10. 发布原则

标准流程：

```text
53.48 修改代码
→ 53.48 编译
→ 53.48 测试
→ 确认稳定
→ sync-unosvr-to-103154.sh --dry-run
→ sync-unosvr-to-103154.sh
→ 103.154 校验 SHA256
→ 单服务重启或 restart all
→ status、端口、日志验证
```

如果只修改了 Chunk，优先执行：

```bash
./manage-unosvr.sh restart caiichunksvr
```

不要因为单个服务更新而无条件重启全部服务。

任何部署失败时，先保留目标端日志和 `deploy-manifest.sha256`，不要立即覆盖或清理现场。
