import process from 'node:process';

export default function sigtermTrappingVercelHandler() {
  process.on('SIGTERM', () => {});
  while (true) {
    // Keep the event loop blocked until the proof watchdog sends SIGKILL.
  }
}
