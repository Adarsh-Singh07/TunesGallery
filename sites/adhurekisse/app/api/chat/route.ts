import { NextResponse } from 'next/server';

export type ChatMessage = {
  id: string;
  sender: string;
  text: string;
  timestamp: string;
};

// Global in-memory cache for serverless instance
// Note: On Vercel, this is scoped to the specific lambda instance. 
// It will persist while the instance is "warm".
const globalStore = (global as any) as {
  chatMessages: ChatMessage[];
  activeUsers: Map<string, number>;
};

if (!globalStore.chatMessages) {
  globalStore.chatMessages = [
    { id: "1", sender: "Adhure Kisse", text: "Welcome to the global listening room.", timestamp: new Date().toISOString() }
  ];
}
if (!globalStore.activeUsers) {
  globalStore.activeUsers = new Map();
}

// Cleanup stale users (inactive for > 15s)
const cleanupUsers = () => {
  const now = Date.now();
  for (const [id, lastSeen] of Array.from(globalStore.activeUsers.entries())) {
    if (now - lastSeen > 15000) {
      globalStore.activeUsers.delete(id);
    }
  }
};

export async function GET() {
  cleanupUsers();
  // Ensure we show at least a few listeners if the instance is cold, for atmosphere
  const realCount = globalStore.activeUsers.size;
  const displayListeners = Math.max(1, realCount);

  return NextResponse.json({ 
    messages: globalStore.chatMessages, 
    listeners: displayListeners 
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const now = Date.now();
    
    if (body.type === 'ping') {
      const { userId, localMessages } = body;
      if (userId) {
        globalStore.activeUsers.set(userId, now);
      }
      
      // Hydrate serverless memory from active clients!
      if (localMessages && Array.isArray(localMessages)) {
        const merged = new Map<string, ChatMessage>();
        globalStore.chatMessages.forEach(m => merged.set(m.id, m));
        localMessages.forEach((m: ChatMessage) => merged.set(m.id, m));
        
        const sorted = Array.from(merged.values())
          .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          
        globalStore.chatMessages = sorted.slice(-50); // Keep last 50
      }
      
      cleanupUsers();
      return NextResponse.json({ 
        success: true, 
        listeners: Math.max(1, globalStore.activeUsers.size),
        messages: globalStore.chatMessages
      });
    }
    
    if (body.type === 'message') {
      const { sender, text, userId } = body;
      if (userId) {
        globalStore.activeUsers.set(userId, now);
      }
      
      const newMsg: ChatMessage = {
        id: Math.random().toString(36).substring(2, 9),
        sender,
        text,
        timestamp: new Date().toISOString()
      };
      
      globalStore.chatMessages.push(newMsg);
      if (globalStore.chatMessages.length > 50) {
        globalStore.chatMessages.shift();
      }
      
      return NextResponse.json({ success: true, message: newMsg });
    }
    
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
