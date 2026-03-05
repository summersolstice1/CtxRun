import { AgentToolRegistry } from './registry';
import { runAgentTurn } from './runtime';
import { registerFsTools } from './tools/fs';
import { registerWebTools } from './tools/web';
import { AgentRunOptions, AgentRunResult } from './types';

let defaultRegistry: AgentToolRegistry | null = null;

function getDefaultRegistry(): AgentToolRegistry {
  if (defaultRegistry) return defaultRegistry;

  const registry = new AgentToolRegistry();
  registerFsTools(registry);
  registerWebTools(registry);
  defaultRegistry = registry;
  return registry;
}

export async function runDefaultAgentTurn(options: AgentRunOptions): Promise<AgentRunResult> {
  const registry = getDefaultRegistry();
  return runAgentTurn(registry, options);
}
