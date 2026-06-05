import { Router } from 'express';
import type { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { insertActivitySchema, type Activity } from '@shared/schema';
import type { ApiError } from '@shared/types';
import { toNumber } from '@shared/number';
import { handleNumberParseError } from '../lib/number-parse-error';
import { enforceProvidedFundScope, getVerifiedFundScope } from '../lib/auth/provided-fund-scope';
import { storage } from '../storage';

const router = Router();

const activitiesLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

router['get']('/activities', activitiesLimiter, async (req: Request, res: Response) => {
  try {
    const fundIdQuery = req.query['fundId'];

    let activities: Activity[];
    if (fundIdQuery) {
      // Explicit fund: parse, then enforce the caller's scope before reading.
      const parsedId = toNumber(fundIdQuery as string, 'fund ID');
      if (parsedId <= 0) {
        const error: ApiError = {
          error: 'Invalid fund ID query',
          message: `Fund ID must be a positive integer, received: ${fundIdQuery}`,
        };
        return res.status(400).json(error);
      }
      if (!(await enforceProvidedFundScope(req, res, parsedId))) {
        return;
      }
      activities = await storage.getActivities(parsedId);
    } else {
      // No fund specified: re-verify the caller's scope and read only their funds.
      // getActivities(undefined) would return ALL funds' activities (cross-fund leak).
      const scope = await getVerifiedFundScope(req);
      if (!scope) {
        const error: ApiError = {
          error: 'Unauthorized',
          message: 'Valid authorization is required to list activities',
        };
        return res.status(401).json(error);
      }
      activities = scope.unrestricted
        ? await storage.getActivities()
        : await storage.getActivities(scope.fundIds);
    }

    const sortedActivities = activities.sort((left: Activity, right: Activity) => {
      const dateA = left.activityDate ? new Date(left.activityDate).getTime() : 0;
      const dateB = right.activityDate ? new Date(right.activityDate).getTime() : 0;
      return dateB - dateA;
    });

    return res.json(sortedActivities);
  } catch (error) {
    if (handleNumberParseError(error, res, 'Invalid fund ID query')) {
      return;
    }

    const apiError: ApiError = {
      error: 'Database query failed',
      message: error instanceof Error ? error.message : 'Failed to fetch activities',
    };
    return res.status(500).json(apiError);
  }
});

router.post('/activities', activitiesLimiter, async (req: Request, res: Response) => {
  try {
    const result = insertActivitySchema.safeParse(req.body);
    if (!result.success) {
      const error: ApiError = {
        error: 'Invalid activity data',
        message: 'Activity validation failed',
        details: { validationErrors: result.error.issues },
      };
      return res.status(400).json(error);
    }

    const activityData = {
      type: result.data.type,
      title: result.data.title,
      activityDate: result.data.activityDate ? new Date(result.data.activityDate) : new Date(),
    };
    const activity = await storage.createActivity(activityData);
    return res.status(201).json(activity);
  } catch (error) {
    const apiError: ApiError = {
      error: 'Database operation failed',
      message: error instanceof Error ? error.message : 'Failed to create activity',
    };
    return res.status(500).json(apiError);
  }
});

export default router;
