import { Router } from "express";
import { getFlags } from "../../flags";

export const flagsRoute = Router()['get']("/flags", (_req: any, res: any) => res["json"](getFlags()));