import type { NotificationJob, NotificationType } from '../domain/types';
import type { NotificationProvider } from '../repositories/contracts';

const copy: Record<NotificationType, { subject: string; body: string }> = {
  bookingAccepted: { subject: 'ご予約を受け付けました', body: 'ご予約ありがとうございます。当日は開始10分前を目安に受付へお越しください。' },
  guestCanceled: { subject: 'キャンセルを受け付けました', body: 'ご予約のキャンセルを承りました。また畑でお会いできる日を楽しみにしています。' },
  waitlistPromoted: { subject: 'ご予約を確定できるようになりました', body: '空きが出たため、キャンセル待ちからご予約へ繰り上げました。' },
  slotCanceled: { subject: '収穫体験の開催中止について', body: '生育・天候状況により開催を中止いたします。ご迷惑をおかけし申し訳ありません。' },
};

export class DemoNotificationProvider implements NotificationProvider {
  createPreview(type: NotificationType, targetId: string, context: Record<string, string>): NotificationJob {
    const template = copy[type];
    return {
      id: `notification-${crypto.randomUUID()}`,
      type,
      targetId,
      recipientName: 'デモ利用者',
      recipientEmail: 'demo@example.invalid',
      subject: template.subject,
      preview: `${context.experience ?? '収穫体験'} ${context.date ?? ''}\n\n${template.body}`.trim(),
      status: 'sent',
      attempts: 1,
      createdAt: new Date().toISOString(),
    };
  }
}
