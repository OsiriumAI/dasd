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
    coincap: { command: "npx", args: ["coincap-mcp"] },
    binance: { command: "npx", args: ["binance-mcp"] },
        "dexpaprika": {
      "command": "npx",
      "args": ["dexpaprika-mcp"]
    },
        "mcp-cryptowallet-evm": {
      "command": "npx",
      "args": [
        "@mcp-dockmaster/mcp-cryptowallet-evm"
      ]
    },
       "mcp-crypto-price": {
      "command": "npx",
      "args": ["-y", "mcp-crypto-price"]
    },
    alchemy: { command: "npm", args: ["exec", "--", "@alchemy/mcp-server"], }
  }
};

const openAIApiKey = process.env.OPENAI_API_KEY || '';
const llm = new ChatOpenAI({ modelName: 'gpt-4.1', openAIApiKey });
const client = MCPClient.fromDict(config);
let agent: MCPAgent | null = null;

// List available servers
app.get('/api/servers', (req, res) => {
  res.json({ servers: Object.keys(config.mcpServers) });
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

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
