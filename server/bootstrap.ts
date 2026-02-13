const express = require('express');
const app = express();

// Some other configurations

const PORT = process.env.PORT || 3000;

// Other middlewares

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT} ✅`);
});

// Shutdown messages
app.on('shutdown', () => {
  console.log('Shutting down server... 🔻');
});

app.on('error', (err) => {
  console.error(`Server error: ${err.message} ⚠️`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Server is shutting down... ❌');
  process.exit(0);
});