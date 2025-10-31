# Scripts — Stage Normalization v3.4

- `scripts/normalize-stages-batched.ts`
  - Dry run: `ts-node scripts/normalize-stages-batched.ts`
  - Apply: `ts-node scripts/normalize-stages-batched.ts --apply`
  - Resume:
    `ts-node scripts/normalize-stages-batched.ts --apply --resume-from <last_id>`

- `scripts/verify-backup-integrity.cjs`
  - `node scripts/verify-backup-integrity.cjs ./backups`

- `scripts/test-restore.sh`
  - `bash scripts/test-restore.sh ./backups/latest.sql`

- `scripts/audit-api-consumers.sh`
  - `bash scripts/audit-api-consumers.sh`

## Notes

- Ensure environment variables are set (see `.env.example`).
- For TypeScript scripts, use `ts-node` or add an npm script:
  ```json
  {
    "scripts": {
      "normalize:batched": "ts-node scripts/normalize-stages-batched.ts"
    }
  }
  ```
