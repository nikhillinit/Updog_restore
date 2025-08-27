/**
 * Centralised Slack helper.
 *
 * In CI (SLACK_WEBHOOK_URL unset) it becomes a **no‑op** so
 * code paths are still exercised but nothing is posted.
 *
 * Production can set SLACK_WEBHOOK_URL (or SLACK_TOKEN) to enable alerts.
 */

export interface SlackPayload {
  channel?: string;
  text: string;
  [key: string]: unknown;
}

let postImpl: (payload: SlackPayload) => Promise<void> = async () => {
  /* no‑op */
};

if (process.env['SLACK_WEBHOOK_URL'] || process.env['SLACK_TOKEN']) {
  // Lazy load only when needed so CI + local dev don't need the dependency.
  // Gracefully handle missing @slack/webhook package
  import('@slack/webhook')
    .then(({ IncomingWebhook }) => {
      const url = process.env['SLACK_WEBHOOK_URL'] ?? '';
      const webhook = new IncomingWebhook(url);
      postImpl = async (payload) => {
        await webhook.send(payload);
      };
    })
    .catch((err) => {
      // Package not installed or import failed - continue as no-op
      if (process.env['NODE_ENV'] === 'production' && process.env['SLACK_WEBHOOK_URL']) {
        console.warn('[slack] @slack/webhook not installed, Slack notifications disabled');
      }
    });
}

/**
 * Post a message to Slack; quietly absorbs errors when disabled.
 */
export async function postToSlack(payload: SlackPayload): Promise<void> {
  try {
    await postImpl(payload);
  } catch (err) {
    console.warn('[slack] post failed', err);
  }
}
