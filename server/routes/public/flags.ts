import { Router } from "express";
import { getFlags } from "../../flags";

export const flagsRoute = Router().get("/flags", (_req, res) => res.json(getFlags()));