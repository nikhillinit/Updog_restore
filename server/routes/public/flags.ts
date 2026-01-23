/**
 * @deprecated This route is DEPRECATED and no longer mounted.
 * Use the secure flagsRouter from server/routes/flags.ts instead.
 * That route uses getClientFlags() which filters by exposeToClient=true.
 *
 * Removed from server.ts on 2026-01-22 (Gate 0 security fix)
 */
import { Router } from "express";
import { getFlags } from "../../flags";

// DEPRECATED - Do not use this route
export const flagsRoute = Router()['get']("/flags", (_req: any, res: any) => res["json"](getFlags()));