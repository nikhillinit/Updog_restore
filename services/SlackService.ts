/**
 * @deprecated Slack integration removed - see Guardian logs for structured logging
 * @throws {Error} Always - prevents accidental usage
 */
export class SlackService {
  constructor() {
    throw new Error('SlackService deprecated - use structured logs instead');
  }

  static send(): never {
    throw new Error('SlackService deprecated - use structured logs instead');
  }

  static notify(): never {
    throw new Error('SlackService deprecated - use structured logs instead');
  }
}

export default SlackService;
