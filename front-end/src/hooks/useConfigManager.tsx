import { createContext, useContext } from 'react';
import { type ConfigManager } from '../actions/ConfigManager';
import { type ApisixConfig } from '../actions/SchemaValidation';

export interface ConfigManagerState {
    configManager: ConfigManager;
    config: ApisixConfig | null;
    configText: string;
    schema: Record<string, unknown> | null;
    schemaLoading: boolean;
    setConfig: (config: ApisixConfig | null, text: string) => void;
    fetchSchema: () => Promise<void>;
}

export const ConfigManagerContext = createContext<ConfigManagerState | null>(null);

export const useConfigManager = () => {
    const context = useContext(ConfigManagerContext);
    if (!context) {
        throw new Error('useConfigManager must be used within a ConfigManagerProvider');
    }
    return context;
};
