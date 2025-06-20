import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { MCPAgent, MCPClient } from './index.js';
import { ChatOpenAI } from '@langchain/openai';

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

// Example config for MCPClient (adjust as needed)
const config = {
  mcpServers: {
    coincap: { command: "npx", args: ["coincap-mcp"], info: "Coincap price feed MCP server." },
    binance: { command: "npx", args: ["binance-mcp"], info: "Binance MCP server for crypto data." },
    "dexpaprika": {
      command: "npx",
      args: ["dexpaprika-mcp"],
      info: "DEXPaprika MCP server for decentralized exchange data."
    },
    "mcp-cryptowallet-evm": {
      command: "npx",
      args: ["@mcp-dockmaster/mcp-cryptowallet-evm"],
      info: "EVM Crypto Wallet MCP server."
    },
    "mcp-coincap-jj": {
      command: "npx",
      args: ["-y", "@bujaayjaay/mcp-coincap-jj"],
      env: {
        COINCAP_API_KEY: "fb9c037a3cb5711ff6368e23ccd9fa23bc7ff2c4967550d680622cea9ceae998"
      },
      info: "Coincap JJ MCP server with API key."
    },
    alchemy: { command: "npm", args: ["exec", "--", "@alchemy/mcp-server"], info: "Alchemy MCP server for blockchain data." }
  }
};

const openAIApiKey = process.env.OPENAI_API_KEY || '';
const llm = new ChatOpenAI({ modelName: 'gpt-4.1', openAIApiKey });
const client = MCPClient.fromDict(config);
let agent: MCPAgent | null = null;

// List available servers with their config
app.get('/api/servers', (req, res) => {
  // Return both the server names and their config, and allow info field dynamically
  res.json({ servers: Object.entries(config.mcpServers).map(([name, cfg]) => {
    const info = typeof cfg === 'object' && 'info' in cfg ? (cfg as any).info || '' : '';
    return { name, config: cfg, info };
  }) });
});

// Connect to a selected server
app.post('/api/connect', async (req: Request, res: Response): Promise<void> => {
  const { server } = req.body;
  if (!server || !(server in config.mcpServers)) {
    res.status(400).json({ error: 'Server not found' });
    return;
  }
  try {
    // Cleanup previous session if it exists
    if (agent) {
      agent = null;
    }
    // Create new session
    await client.createSession(server, true);
    agent = new MCPAgent({ llm, client, maxSteps: 10 });
    res.json({ success: true });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: errorMsg });
  }
});

// Send a message to the MCPAgent (must be connected)
app.post('/api/message', async (req, res) => {
  const { message } = req.body;
  if (!agent) {
    res.status(400).json({ error: 'No server connected. Please connect first.' });
    return;
  }
  try {
    const response = await agent.run(message);
    res.json({ response });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: errorMsg });
  }
});

// Add/update server info field
app.post('/api/server-info', (req, res) => {
  const { server, info } = req.body;
  if (!server || !(server in config.mcpServers)) {
    res.status(400).json({ error: 'Server not found' });
    return;
  }
  // Allow info field to be set dynamically
  (config.mcpServers as any)[server].info = info;
  res.json({ success: true });
});

// Prefetch and set info for each server based on available tools
async function prefetchAndSetServerInfo() {
  const serverNames = Object.keys(config.mcpServers);
  for (const name of serverNames) {
    try {
      const session = await client.createSession(name, true);
      const connector = session.connector;
      // Ensure connector is initialized and tools are fetched
      await connector.initialize();
      const tools = connector.tools;
      if (Array.isArray(tools) && tools.length > 0) {
        // Compose info string from tool names and descriptions
        const toolDescriptions = tools.map(t => `- ${t.name}: ${t.description || ''}`).join('\n');
        (config.mcpServers as any)[name].info = `Available tools for this server:\n${toolDescriptions}`;
      } else {
        (config.mcpServers as any)[name].info = 'No tools available for this server.';
      }
    } catch (err) {
      (config.mcpServers as any)[name].info = 'Failed to fetch tools: ' + (err instanceof Error ? err.message : String(err));
    }
  }
}

// Call prefetch on startup
prefetchAndSetServerInfo().then(() => {
  console.log('Server info fields updated with available tools.');
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});