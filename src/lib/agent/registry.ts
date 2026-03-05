import { AgentToolDefinition, AgentToolHandler, AgentToolRegistration } from './types';

export class AgentToolRegistry {
  private readonly definitions = new Map<string, AgentToolDefinition>();
  private readonly handlers = new Map<string, AgentToolHandler>();

  register(registration: AgentToolRegistration): void {
    const { definition, handler } = registration;
    this.definitions.set(definition.name, definition);
    this.handlers.set(definition.name, handler);
  }

  getDefinition(name: string): AgentToolDefinition | undefined {
    return this.definitions.get(name);
  }

  getHandler(name: string): AgentToolHandler | undefined {
    return this.handlers.get(name);
  }

  listDefinitions(): AgentToolDefinition[] {
    return Array.from(this.definitions.values());
  }
}
