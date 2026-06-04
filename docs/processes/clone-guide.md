---
status: ACTIVE
last_updated: 2026-05-21
---

# Clone Guide

Use a blobless partial clone when clone transfer size matters:

```bash
git clone --filter=blob:none https://github.com/nikhillinit/Updog_restore.git
```

Blobless clones download commits and trees up front, then fetch file contents on
demand. This preserves commit history for normal developer workflows while
avoiding an immediate download of historical blobs that are not needed for the
current checkout.

Use a normal clone when you need every historical blob available offline:

```bash
git clone https://github.com/nikhillinit/Updog_restore.git
```

If your Git version supports it, `git backfill` can later download missing
objects for a partial clone. Do not use `git fetch --unshallow` as a partial
clone repair step unless the clone was also created as shallow.

## Archive Policy

Tracked `archive/` and `docs/archive/` directories are banned from HEAD. The
historical blobs remain reachable in full clones because the repository has not
been rewritten. This is intentional: history rewrite is reserved for secrets,
PII, legal/compliance removal, external-transfer constraints, or severe measured
repository-size problems.
