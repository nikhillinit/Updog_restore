# Comprehensive AI-Augmented Workflow Guide (Part 2)

## Continuation: Coding Pairs, Superpowers, Logic Skills, and Reference

**Note:** This is Part 2 of the Comprehensive Workflow Guide. See
[COMPREHENSIVE-WORKFLOW-GUIDE.md](COMPREHENSIVE-WORKFLOW-GUIDE.md) for Parts
I-III.

---

## Part IV: Coding Pairs Workflows (continued)

### PATTERN A: Driver-Navigator (AI Drives, Human Navigates) - continued

```
Human (Navigator): "Yes, looks good. Continue."

AI (Driver): "📝 Chunk 2: Create POST /snapshots route handler
────────────────────────────────────────────────────────
router.post('/funds/:fundId/portfolio/snapshots', idempotencyMiddleware, async (req, res) => {
  // Validate params
  const { fundId } = FundIdParamSchema.parse(req.params);

  // Validate body
  const body = CreateSnapshotRequestSchema.parse(req.body);

  // Verify fund exists
  await verifyFundExists(fundId);

  // Create snapshot
  const snapshot = await snapshotService.createSnapshot({
    fundId,
    name: body.name,
    idempotencyKey: req.idempotencyKey,
  });

  return res.status(202).json({
    snapshotId: snapshot.id,
    statusUrl: `/api/snapshots/${snapshot.id}`,
  });
});

✓ Code review with code-reviewer agent
✓ /test-smart
🛑 CHECKPOINT: Does the handler look correct?"
```
