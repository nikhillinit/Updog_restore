import { isMemoryMode } from "../env";
import { RepoBag } from "./interfaces";
import { MemoryFundRepo } from "./memory";
import { DbFundRepo } from "./db";

export function makeRepos(args: { db: unknown | null }): RepoBag {
  if (isMemoryMode() || !args.db) {
    return { fund: new MemoryFundRepo() };
    }
  return { fund: new DbFundRepo(args.db as any) };
}
