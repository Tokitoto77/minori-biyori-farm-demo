import { DemoRepository } from '../demo/DemoRepository';
import type { Services } from '../repositories/contracts';

let services: Services | null = null;

export function createServices(): Services {
  if (services) return services;
  const mode = import.meta.env.VITE_APP_MODE === 'production' ? 'production' : 'demo';
  if (mode === 'production') {
    throw new Error('実運用アダプターはフェーズBで有効化します。VITE_APP_MODE=demoで起動してください。');
  }
  const repository = new DemoRepository();
  services = {
    mode,
    publicRepository: repository,
    bookingRepository: repository,
    adminRepository: repository,
  };
  return services;
}
