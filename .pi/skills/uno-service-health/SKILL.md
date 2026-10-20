---
name: uno-service-health
description: Check and auto-start the UNO/caii service stack on 192.168.53.48. Use when the user asks whether UNO services, caii services, or the UNO server on 53.48 are running/healthy, or asks to bring them up. Never access 192.168.103.154.
---

# UNO service health

Use this skill for requests such as:

- “检查 UNO 服务在 53.48 上是否正常运行”
- “看看 caii 服务起来了没有”
- “如果没起来就启动 UNO 服务”
- “检查并拉起 53.48 的 UNO 服务”

## Procedure

Run the repository health/start script on the 53.48 runtime host:

```bash
ssh root@192.168.53.48 'cd /root/projects/caii-server && ./scripts/check-and-start-unosvr.sh'
```

The script:

1. checks all services managed by `manage-unosvr.sh`;
2. starts the stack only when one or more services are stopped;
3. prints the final status.

If `/root/projects/caii-server` is not the active deployment root, invoke the same script with the detected deployment root explicitly:

```bash
ssh root@192.168.53.48 'cd /root/projects/caii-server && UNOSVR_ROOT=/root/projects/caii-server ./scripts/check-and-start-unosvr.sh'
```

## Safety

- This skill is authorized to start missing services on `192.168.53.48`.
- Do not restart already-running services unless the user explicitly asks for a restart.
- Do not access, probe, or modify `192.168.103.154`.
- Do not expose credentials or inspect credential files.
- Report each service's final status, PID, and port when available, plus any startup failure or warning.
