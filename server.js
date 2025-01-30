const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

// Keep track of all connected clients
const clients = new Set();

// Keep track of the current state
let currentState = {
  timeLeft: 31,
  isRunning: false,
  currentRound: 1,
  stateVersion: 0,
  serverTime: Date.now()
};

wss.on('connection', (ws) => {
  // Add new client to the set
  clients.add(ws);
  
  console.log('Client connected. Total clients:', clients.size);

  ws.on('message', (message) => {
    const data = JSON.parse(message);
    console.log('Received:', data);

    switch (data.type) {
      case 'STATE_UPDATE':
        // Update the current state
        currentState = data.payload;
        // Broadcast to all clients except sender
        broadcast(ws, {
          type: 'STATE_UPDATE',
          payload: currentState
        });
        break;

      case 'REQUEST_SYNC':
        // Send current state to the requesting client
        ws.send(JSON.stringify({
          type: 'SYNC_RESPONSE',
          payload: {
            ...currentState,
            serverTime: Date.now()
          }
        }));
        break;
    }
  });

  ws.on('close', () => {
    // Remove client from the set
    clients.delete(ws);
    console.log('Client disconnected. Total clients:', clients.size);
  });
});

// Broadcast message to all clients except sender
function broadcast(sender, data) {
  const message = JSON.stringify(data);
  for (const client of clients) {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

console.log('WebSocket server running on port 8080');