import type { NotificationType } from './types';

const copy: Record<NotificationType, { subject: string; body: string }> = {
  bookingAccepted: { subject: 'ご予約を受け付けました', body: 'ご予約ありがとうございます。当日は開始10分前を目安に受付へお越しください。' },
  guestCanceled: { subject: 'キャンセルを受け付けました', body: 'ご予約のキャンセルを承りました。また畑でお会いできる日を楽しみにしています。' },
  waitlistPromoted: { subject: 'ご予約を確定できるようになりました', body: '空きが出たため、キャンセル待ちからご予約へ繰り上げました。' },
  slotCanceled: { subject: '収穫体験の開催中止について', body: '生育・天候状況により開催を中止いたします。ご迷惑をおかけし申し訳ありません。' },
};

export function buildNotificationCopy(type: NotificationType, context: Record<string, string>): { subject: string; preview: string } {
  const template = copy[type];
  const reason = type === 'slotCanceled' && context.reason
    ? `\n中止理由：${context.reason}`
    : '';
  return {
    subject: template.subject,
    preview: `${context.experience ?? '収穫体験'} ${context.date ?? ''}\n\n${template.body}${reason}`.trim(),
  };
}
