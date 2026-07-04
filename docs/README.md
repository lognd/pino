# Documentation index -- melpino

Two kinds of docs live here, for two different audiences:

| Directory/file | For | Read when you're... |
|---|---|---|
| [design/](design/README.md) | Engineers/agents building or modifying a feature | Implementing something, or trying to understand *why* it's built the way it is |
| [deployment.md](deployment.md) | Whoever is standing up or redeploying the site | Setting up a fresh VPS, or redeploying after a gap |
| [secrets.md](secrets.md) | Same as above | Generating, rotating, or figuring out where a secret lives |
| [usage.md](usage.md) | Anyone using the deployed site | Using it as a student, a guest booking a class, or as the admin |
| [runbooks/restore.md](runbooks/restore.md) | Whoever is operating the site | Something's actually broken and you need to restore from backup |

Start at the root [README.md](../README.md) if you haven't already --
it's the shortest path to "how do I even run this locally."

## Status

`design/` is intentionally kept close to a pre-implementation spec (see
[00-overview.md](design/00-overview.md)) -- this project is still in the
scaffold stage. `deployment.md`, `usage.md`, and `runbooks/restore.md`
below are currently SCAFFOLD-STAGE STUBS: short pointers to the design
docs with a `TODO(P7)` marker, not full operational documentation --
they describe a deployed system that does not exist yet. `secrets.md`
is further along (a real secret inventory) since the secret *names* are
already locked even though the values behind most of them aren't set up
yet. Every doc here gets updated in the same change as the code once
real implementation lands, and should stop being a stub the moment
there is something real to operate.
