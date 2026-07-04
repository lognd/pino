# Runbook: restoring from backup

Referenced from [design/11-deployment.md](../design/11-deployment.md)'s
backup section. See [deployment.md](../deployment.md) and
[secrets.md](../secrets.md)'s `BACKUP_R2_*` entry for how backups
actually get off the VPS.

**SCAFFOLD-STAGE STUB.** There is no deployed database or storage
volume to restore yet -- `ops/backup.sh` and `ops/backup.Dockerfile`
are scaffolded (nightly `pg_dump` + waiver/storage tarball, pushed
off-box to a dedicated R2 bucket) but have never run against a real
stack. This file's job is to become the literal restore procedure
(fetch from R2, drop/recreate schema, restore, restore storage files,
verify) once there is a real backup to practice restoring from.

**Waivers are legal documents** (see
[design/06-waivers-and-legal.md](../design/06-waivers-and-legal.md)) --
this runbook must be tested once, for real, before the first real
class is booked (see TODO.md's gate). Do not treat this stub as
sufficient on its own.

TODO(P7): write for real during the deploy phase, and actually
rehearse a restore before go-live (see TODO.md).
