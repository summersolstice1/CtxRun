import type { LucideIcon } from 'lucide-react';
import {
  Bot,
  Database,
  DownloadCloud,
  Info,
  Monitor,
  Search as SearchIcon,
  Shield,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SettingsNavButton } from './SettingsUi';
import type { SettingsSection } from './types';

interface SettingsNavProps {
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
}

interface NavItem {
  section: SettingsSection;
  icon: LucideIcon;
  labelKey: string;
}

interface NavGroup {
  titleKey: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    titleKey: 'settings.groupCore',
    items: [
      { section: 'general', icon: Monitor, labelKey: 'settings.navGeneral' },
      {
        section: 'searchWorkspace',
        icon: SearchIcon,
        labelKey: 'settings.navSearchWorkspace',
      },
      { section: 'ai', icon: Bot, labelKey: 'settings.navAI' },
    ],
  },
  {
    titleKey: 'settings.groupContent',
    items: [
      { section: 'library', icon: DownloadCloud, labelKey: 'settings.navLibrary' },
      { section: 'data', icon: Database, labelKey: 'settings.navDataMaintenance' },
    ],
  },
  {
    titleKey: 'settings.groupTrust',
    items: [
      { section: 'security', icon: Shield, labelKey: 'settings.navSecurity' },
      { section: 'about', icon: Info, labelKey: 'settings.navAbout' },
    ],
  },
];

export function SettingsNav({ activeSection, onSectionChange }: SettingsNavProps) {
  const { t } = useTranslation();

  return (
    <div className="w-56 bg-secondary/5 border-r border-border p-3 space-y-3 overflow-y-auto custom-scrollbar shrink-0">
      {NAV_GROUPS.map((group) => (
        <div className="space-y-1" key={group.titleKey}>
          <div className="px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
            {t(group.titleKey)}
          </div>
          {group.items.map((item) => {
            const Icon = item.icon;
            return (
              <SettingsNavButton
                key={item.section}
                active={activeSection === item.section}
                onClick={() => onSectionChange(item.section)}
                icon={<Icon size={14} />}
                label={t(item.labelKey)}
                testId={`settings-nav-${item.section}`}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
