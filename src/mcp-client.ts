interface McpClientConfig {
  serverUrl: string;
}

interface McpClient {
  connected: boolean;
  connect(): Promise<void>;
  disconnect(): void;
  sendAction(action: string, params: Record<string, string>): Promise<string | null>;
}

export function createMcpClient(config: McpClientConfig): McpClient {
  let connected = false;

  return {
    get connected() {
      return connected;
    },

    async connect(): Promise<void> {
      try {
        console.log(`MCP: Attempting connection to ${config.serverUrl}...`);
        console.log("MCP: Electron MCP server not yet configured. Skipping.");
        connected = false;
      } catch (error) {
        console.log("MCP: Telegram Desktop control not available.");
        connected = false;
      }
    },

    disconnect(): void {
      connected = false;
    },

    async sendAction(action: string, params: Record<string, string>): Promise<string | null> {
      if (!connected) {
        return null;
      }
      console.log(`MCP: ${action}`, params);
      return null;
    },
  };
}
