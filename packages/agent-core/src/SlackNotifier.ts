export interface SlackConfig {
  webhookUrl: string;
  channel?: string;
  username?: string;
  enabled?: boolean;
}

export interface SlackAlert {
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  agentName: string;
  timestamp: string;
  context?: Record<string, any>;
}

export class SlackNotifier {
  private config: Required<SlackConfig>;

  constructor(config: SlackConfig) {
    this.config = {
      channel: '#ai-agents',
      username: 'Agent Monitor',
      enabled: true,
      ...config,
    };
  }

  async sendAlert(alert: SlackAlert): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    const color = this.getSeverityColor(alert.severity);
    const emoji = this.getSeverityEmoji(alert.severity);

    const payload = {
      channel: this.config.channel,
      username: this.config.username,
      attachments: [
        {
          color,
          title: `${emoji} ${alert.title}`,
          text: alert.message,
          fields: [
            {
              title: 'Agent',
              value: alert.agentName,
              short: true,
            },
            {
              title: 'Severity',
              value: alert.severity.toUpperCase(),
              short: true,
            },
            {
              title: 'Timestamp',
              value: alert.timestamp,
              short: false,
            },
          ],
          footer: 'AI Agent Monitor',
          ts: Math.floor(Date.parse(alert.timestamp) / 1000),
        },
      ],
    };

    // Add context fields if provided
    if (alert.context) {
      Object.entries(alert.context).forEach(([key, value]) => {
        payload.attachments[0].fields.push({
          title: key,
          value: typeof value === 'object' ? JSON.stringify(value) : String(value),
          short: true,
        });
      });
    }

    try {
      const response = await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Slack API responded with status ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to send Slack alert:', error);
      // Don't throw - we don't want monitoring to break the main application
    }
  }

  async sendCrashAlert(
    agentName: string,
    error: Error,
    context: Record<string, any> = {}
  ): Promise<void> {
    await this.sendAlert({
      severity: 'critical',
      title: 'Agent Crash Detected',
      message: `Agent "${agentName}" has crashed: ${error.message}`,
      agentName,
      timestamp: new Date().toISOString(),
      context: {
        errorType: error.constructor.name,
        stack: error.stack?.split('\n').slice(0, 3).join('\n'), // First 3 lines
        ...context,
      },
    });
  }

  async sendFailureAlert(
    agentName: string,
    operation: string,
    failureCount: number,
    threshold: number
  ): Promise<void> {
    await this.sendAlert({
      severity: 'warning',
      title: 'High Failure Rate Detected',
      message: `Agent "${agentName}" has ${failureCount} failures in operation "${operation}" (threshold: ${threshold})`,
      agentName,
      timestamp: new Date().toISOString(),
      context: {
        operation,
        failureCount,
        threshold,
      },
    });
  }

  async sendRecoveryAlert(
    agentName: string,
    operation: string
  ): Promise<void> {
    await this.sendAlert({
      severity: 'info',
      title: 'Agent Recovery',
      message: `Agent "${agentName}" has recovered and is operating normally in operation "${operation}"`,
      agentName,
      timestamp: new Date().toISOString(),
      context: {
        operation,
      },
    });
  }

  private getSeverityColor(severity: SlackAlert['severity']): string {
    switch (severity) {
      case 'critical':
        return 'danger';
      case 'warning':
        return 'warning';
      case 'info':
        return 'good';
      default:
        return 'warning';
    }
  }

  private getSeverityEmoji(severity: SlackAlert['severity']): string {
    switch (severity) {
      case 'critical':
        return '🚨';
      case 'warning':
        return '⚠️';
      case 'info':
        return 'ℹ️';
      default:
        return '❓';
    }
  }
}