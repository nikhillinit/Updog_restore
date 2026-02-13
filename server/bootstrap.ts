// Import required modules
import { loadEnv } from './env';
import { buildProviders } from './providers';
import { createServer } from './server';
import { gracefulShutdown } from './shutdown';

type StartupEnv = { port: number; }

async function bootstrap() {
    // Load environment variables
    const env: StartupEnv = loadEnv();

    // Build the providers
    const providers = buildProviders();

    // Create the server with the providers
    const server = createServer(providers);

    // Start the server and listen on the specified port
    server.listen(env.port, () => {
        console.log(`Server is running on http://localhost:${env.port}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
        console.log('SIGTERM received: closing HTTP server');
        await gracefulShutdown(server);
        process.exit(0);
    });

    process.on('SIGINT', async () => {
        console.log('SIGINT received: closing HTTP server');
        await gracefulShutdown(server);
        process.exit(0);
    });
}

bootstrap().catch(err => {
    console.error('Bootstrap failed:', err);
    process.exit(1);
});