import { Router } from 'express';
import type { Request, Response } from 'express';
import { insertActivitySchema, type Activity } from '@shared/schema';
import type { ApiError } from '@shared/types';
import { NumberParseError, toNumber } from '@shared/number';
import { storage } from '../storage';

const router = Router();

router['get']('/activities', async (req: Request, res: Response) => {
  try {
    const fundIdQuery = req.query['fundId'];
    let fundId: number | undefined;

    if (fundIdQuery) {
      const parsedId = toNumber(fundIdQuery as string, 'fund ID');
      if (parsedId <= 0) {
        const error: ApiError = {
          error: 'Invalid fund ID query',
          message: `Fund ID must be a positive integer, received: ${fundIdQuery}`,
        };
        return res.status(400).json(error);
      }
      fundId = parsedId;
    }

    const activities = await storage.getActivities(fundId);
    const sortedActivities = activities.sort((left: Activity, right: Activity) => {
      const dateA = left.activityDate ? new Date(left.activityDate).getTime() : 0;
      const dateB = right.activityDate ? new Date(right.activityDate).getTime() : 0;
      return dateB - dateA;
    });

    return res.json(sortedActivities);
  } catch (error) {
    if (error instanceof NumberParseError) {
      const apiError: ApiError = {
        error: 'Invalid fund ID query',
        message: error.message,
      };
      return res.status(400).json(apiError);
    }

    const apiError: ApiError = {
      error: 'Database query failed',
      message: error instanceof Error ? error.message : 'Failed to fetch activities',
    };
    return res.status(500).json(apiError);
  }
});

router.post('/activities', async (req: Request, res: Response) => {
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
