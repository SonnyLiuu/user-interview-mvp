export type AIMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type AIJsonRequest = {
  taskName: string;
  model: string;
  messages: AIMessage[];
  schemaName: string;
  schema: object;
};

export interface AIProvider {
  generateJson<T>(input: AIJsonRequest): Promise<T>;
}
