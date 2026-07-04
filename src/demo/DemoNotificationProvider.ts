import type { NotificationJob, NotificationType } from '../domain/types';
import { buildNotificationCopy } from '../domain/notifications';
import type { NotificationProvider } from '../repositories/contracts';

export class DemoNotificationProvider implements NotificationProvider {
  createPreview(type: NotificationType, targetId: string, context: Record<string, string>): NotificationJob {
    const content = buildNotificationCopy(type, context);
    return {
      id: `notification-${crypto.randomUUID()}`,
      type,
      targetId,
      recipientName: 'デモ利用者',
      recipientEmail: 'demo@example.invalid',
      subject: content.subject,
      preview: content.preview,
      status: 'sent',
      attempts: 1,
      createdAt: new Date().toISOString(),
    };
  }
}
