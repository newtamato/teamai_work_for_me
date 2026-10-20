---
name: uno-server-deploy
description: Build, deploy, and restart a selected UNO/caii server service on 192.168.53.48. Use when the user asks to compile, deploy, restart, or validate a UNO server service after source changes. Never target 192.168.103.154 unless the user explicitly asks for shared-environment publishing.
---

# UNO server build/deploy/restart

Use this skill for the personal UNO validation server `root@192.168.53.48`.

## Safety boundaries

- Edit source only in local `caii-server/`.
- `192.168.53.48` is for compilation and runtime validation.
- Do not access `192.168.103.154` unless the user explicitly requests shared-environment publishing.
- Before changing a remote file, inspect local and remote `git status` and compare the target file. Never overwrite unrelated remote working-tree changes.
- Do not use `rsync --delete`.
- Do not copy credentials, logs, pid files, caches, or build metadata.
- A successful compile is not a successful deployment; report deployment and process status separately.

## Standard paths

Local source:

```text
/Users/joliehou/ct_workspace/uno_workspace/caii-server
```

Remote source/build tree:

```text
/root/projects/caii-server
```

The remote build outputs Debug binaries under:

```text
/root/projects/caii-server/bin/x64/Debug/<service-dir>/
```

The remote management script defaults to `/root/game/unosvr`, which may be absent or may be a different deployment. For the personal 53.48 validation build, always set:

```bash
UNOSVR_ROOT=/root/projects/caii-server
```

## Supported service names

The management script accepts:

```text
caiichunksvr caiiassistmpsvr caiiassistsvr caiichatmpsvr caiihallmp caiihall caiilivesvr caiilivempsvr caiirobotsvr caiisvrmp caiisvr
```

Only restart the affected service unless the user explicitly asks for the whole stack.

## Workflow

### 1. Inspect status and target

```bash
git -C caii-server status --short
ssh root@192.168.53.48 'cd /root/projects/caii-server && git status --short'
ssh root@192.168.53.48 'cd /root/projects/caii-server && ./scripts/manage-unosvr.sh --help'
```

If the same source file is modified differently on the remote, do not replace the whole file. Apply only the intended patch after backing up the remote file, or stop and ask for clarification.

### 2. Sync source changes

For a clean matching remote checkout, use an exact `scp` for each changed source file. For a remote checkout with unrelated modifications, preserve them and apply only the requested hunk. Record the resulting remote path and checksum.

### 3. Compile

For the standard game server:

```bash
ssh root@192.168.53.48 \
  'cd /root/projects/caii-server && ./scripts/build-caiisvr-linux.sh Debug x64'
```

Use the corresponding project build script for other services when available. Treat compiler warnings as warnings, but require the script's final success marker (for example `BUILD_OK`).

### 4. Deploy and restart

The build output is already in the remote source/build tree. Restart the selected service against that tree:

```bash
ssh root@192.168.53.48 \
  'cd /root/projects/caii-server && \
   UNOSVR_ROOT=/root/projects/caii-server \
   ./scripts/manage-unosvr.sh restart caiisvr'
```

Replace `caiisvr` with the requested service. Do not use the default `/root/game/unosvr` path for 53.48 validation unless it has been explicitly confirmed to be the intended deployment.

### 5. Verify

```bash
ssh root@192.168.53.48 \
  'cd /root/projects/caii-server && \
   UNOSVR_ROOT=/root/projects/caii-server \
   ./scripts/manage-unosvr.sh status caiisvr'
```

Also inspect the target PID and the latest service log if needed. Confirm the process is running from the expected `/root/projects/caii-server/bin/x64/Debug/...` directory.

## Reporting

Always report:

- source file(s) synchronized or patched;
- build command and result;
- deployment root and service name;
- restart command and PID/status;
- warnings or remaining risks;
- whether `caii-test` or runtime validation was run.

Do not claim the user-facing behavior is fixed until the user validates the live flow or a real protocol test passes.
