import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import i18n from '@/i18n/config';
import {
  AI_SETTINGS_SYNC_EVENT,
  LANGUAGE_SYNC_EVENT,
  PROJECT_ROOT_SYNC_EVENT,
  SEARCH_SETTINGS_SYNC_EVENT,
  SPOTLIGHT_APPEARANCE_SYNC_EVENT,
  type AISettingsSyncPayload,
  type LanguageSyncPayload,
  type ProjectRootSyncPayload,
  type SearchSettingsSyncPayload,
} from '@/lib/appStoreEvents';
import type { SpotlightAppearance } from '@/store/useAppStore';
import { useAppStore } from '@/store/useAppStore';
import { useContextStore } from '@/store/useContextStore';
import type { AIProviderConfig, AIProviderSetting } from '@/types/model';

function areStringArraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function areAIConfigsEqual(left: AIProviderConfig, right: AIProviderConfig): boolean {
  return (
    left.providerId === right.providerId &&
    left.apiKey === right.apiKey &&
    left.baseUrl === right.baseUrl &&
    left.modelId === right.modelId &&
    left.temperature === right.temperature
  );
}

function areProviderSettingsEqual(
  left: Record<string, AIProviderSetting>,
  right: Record<string, AIProviderSetting>
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (!areStringArraysEqual(leftKeys.sort(), rightKeys.sort())) {
    return false;
  }

  return leftKeys.every((key) => {
    const leftSetting = left[key];
    const rightSetting = right[key];

    return Boolean(rightSetting) &&
      leftSetting.apiKey === rightSetting.apiKey &&
      leftSetting.baseUrl === rightSetting.baseUrl &&
      leftSetting.modelId === rightSetting.modelId &&
      leftSetting.temperature === rightSetting.temperature;
  });
}

function areSearchSettingsEqual(
  left: SearchSettingsSyncPayload,
  right: SearchSettingsSyncPayload
): boolean {
  return left.defaultEngine === right.defaultEngine && left.customUrl === right.customUrl;
}

function areSpotlightAppearanceEqual(
  left: SpotlightAppearance,
  right: SpotlightAppearance
): boolean {
  return (
    left.width === right.width &&
    left.defaultHeight === right.defaultHeight &&
    left.maxChatHeight === right.maxChatHeight
  );
}

export function useCrossWindowAppStoreSync(): void {
  useEffect(() => {
    const aiSettingsUnlisten = listen<AISettingsSyncPayload>(AI_SETTINGS_SYNC_EVENT, ({ payload }) => {
      const state = useAppStore.getState();
      if (
        areAIConfigsEqual(state.aiConfig, payload.aiConfig) &&
        areProviderSettingsEqual(state.savedProviderSettings, payload.savedProviderSettings)
      ) {
        return;
      }

      useAppStore.setState({
        aiConfig: payload.aiConfig,
        savedProviderSettings: payload.savedProviderSettings,
      });
    });

    const projectRootUnlisten = listen<ProjectRootSyncPayload>(
      PROJECT_ROOT_SYNC_EVENT,
      ({ payload }) => {
        const state = useAppStore.getState();
        if (
          state.projectRoot !== payload.projectRoot ||
          !areStringArraysEqual(state.recentProjectRoots, payload.recentProjectRoots)
        ) {
          useAppStore.setState({
            projectRoot: payload.projectRoot,
            recentProjectRoots: payload.recentProjectRoots,
          });
        }

        const contextState = useContextStore.getState();
        if (contextState.projectRoot !== payload.projectRoot) {
          void contextState.setProjectRoot(payload.projectRoot);
        }
      }
    );

    const languageUnlisten = listen<LanguageSyncPayload>(LANGUAGE_SYNC_EVENT, ({ payload }) => {
      if (useAppStore.getState().language === payload.language) {
        return;
      }

      useAppStore.setState({ language: payload.language });
      void i18n.changeLanguage(payload.language);
    });

    const searchSettingsUnlisten = listen<SearchSettingsSyncPayload>(
      SEARCH_SETTINGS_SYNC_EVENT,
      ({ payload }) => {
        if (areSearchSettingsEqual(useAppStore.getState().searchSettings, payload)) {
          return;
        }

        useAppStore.setState({ searchSettings: payload });
      }
    );

    const spotlightAppearanceUnlisten = listen<SpotlightAppearance>(
      SPOTLIGHT_APPEARANCE_SYNC_EVENT,
      ({ payload }) => {
        if (areSpotlightAppearanceEqual(useAppStore.getState().spotlightAppearance, payload)) {
          return;
        }

        useAppStore.setState({ spotlightAppearance: payload });
      }
    );

    return () => {
      aiSettingsUnlisten.then((unlisten) => unlisten());
      projectRootUnlisten.then((unlisten) => unlisten());
      languageUnlisten.then((unlisten) => unlisten());
      searchSettingsUnlisten.then((unlisten) => unlisten());
      spotlightAppearanceUnlisten.then((unlisten) => unlisten());
    };
  }, []);
}
