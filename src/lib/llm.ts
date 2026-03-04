import { AIProviderConfig } from "@/types/model";
import { fetch } from '@tauri-apps/plugin-http';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  reasoning?: string;
  attachments?: ChatMessageAttachment[];
}

export type ChatMessageContent = string | ChatContentPart[];

export interface ChatMessageAttachment {
  id: string;
  kind: 'image' | 'file_text';
  name: string;
  mime: string;
  size: number;
  previewUrl?: string;
}

export type ChatContentPart =
  | { type: 'text'; text: string }
  | {
      type: 'image_url';
      image_url: {
        url: string;
        detail?: 'auto' | 'low' | 'high';
      };
    };

export interface ChatRequestMessage {
  role: 'system' | 'user' | 'assistant';
  content: ChatMessageContent;
}

export async function streamChatCompletion(
  messages: ChatRequestMessage[],
  config: AIProviderConfig,
  onChunk: (contentDelta: string, reasoningDelta: string) => void,
  onError: (err: string) => void,
  onFinish: () => void
) {
  try {
    if (!config.apiKey) {
      throw new Error("API Key not configured. Please go to Settings.");
    }

    const body = {
      model: config.modelId,
      messages: messages,
      stream: true,
      temperature: config.temperature,
    };

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error ${response.status}: ${errorText}`);
    }

    if (!response.body) throw new Error("No response body");

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;

        const dataStr = trimmed.replace("data: ", "");
        if (dataStr === "[DONE]") break;

        try {
          const json = JSON.parse(dataStr);
          const delta = json.choices?.[0]?.delta;

          if (delta) {
            const contentDelta = delta.content || "";
            const reasoningDelta = delta.reasoning_content || delta.reasoning || "";

            if (contentDelta || reasoningDelta) {
                onChunk(contentDelta, reasoningDelta);
            }
          }
        } catch (e) {
        }
      }
    }

    onFinish();

  } catch (error: any) {
    onError(error.message || "Unknown error");
    onFinish();
  }
}
