import { IgnoredSecretsManager } from '@/components/settings/IgnoredSecretsManager';

export function SecuritySection() {
  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex-1 min-h-0">
        <IgnoredSecretsManager />
      </div>
    </div>
  );
}
