const { spawn, exec } = require('child_process');
const path = require('path');
const kill = require('tree-kill');

console.log('╔═══════════════════════════════════════╗');
console.log('║   🚀 Bestell App Launcher            ║');
console.log('╚═══════════════════════════════════════╝\n');

// Process storage
const processes = [];

// Step 1: Initialize database
console.log('📦 Stap 1: Database initialiseren...');
const initDb = spawn('node', ['database.js'], {
    cwd: __dirname,
    stdio: 'inherit',
    shell: true
});

initDb.on('close', (code) => {
    if (code !== 0) {
        console.error(`\n❌ Database initialisatie mislukt met code ${code}`);
        process.exit(1);
    }

    console.log('\n✅ Database geïnitialiseerd!\n');

    // Step 2: Start server
    console.log('🌐 Stap 2: Backend server starten...');
    const server = spawn('node', ['server.js'], {
        cwd: __dirname,
        stdio: 'pipe',
        shell: true
    });
    processes.push({ name: 'Server', process: server });

    // Capture server output
    server.stdout.on('data', (data) => {
        const output = data.toString();
        process.stdout.write(`[SERVER] ${output}`);

        // When server is ready, start Salesforce worker
        if (output.includes('Server running')) {
            console.log('\n✅ Server is actief!\n');
            startSalesforceWorker();
            startSapWorker(); // NEW: Start SAP integration
            startBackupWorker();
        }
    });

    server.stderr.on('data', (data) => {
        process.stderr.write(`[SERVER ERROR] ${data}`);
    });

    server.on('close', (code) => {
        console.log(`\n⚠️ Server gestopt met code ${code}`);
        killAll();
    });
});

// Step 3: Start Salesforce Worker (optional)
function startSalesforceWorker() {
    if (processes.find(p => p.name === 'SF-Worker')) {
        console.log('⚠️ Salesforce Worker draait al!');
        return;
    }
    console.log('🔗 Stap 3: Salesforce Worker starten...');

    const sfWorker = spawn('node', ['sf-integratie.js'], {
        cwd: __dirname,
        stdio: 'pipe',
        shell: true
    });
    processes.push({ name: 'SF-Worker', process: sfWorker });

    sfWorker.stdout.on('data', (data) => {
        process.stdout.write(`[SF-WORKER] ${data}`);
    });

    sfWorker.stderr.on('data', (data) => {
        const output = data.toString();

        // Distinguish between Warnings and Errors
        if (output.includes('Warning') || output.includes('warning') || output.includes('⚠️')) {
            process.stdout.write(`[SF-WORKER WARN] ${output}`);
        } else if (output.includes('RABBITMQ_URL') || output.includes('SF_USERNAME')) {
            console.log('\n⚠️ Salesforce Worker niet gestart: Configuratie ontbreekt (optioneel)');
        } else {
            process.stdout.write(`[SF-WORKER ERROR] ${output}`);
        }
    });

    sfWorker.on('close', (code, signal) => {
        if (code !== 0 && code !== null) {
            console.log(`\n⚠️ Salesforce Worker gestopt met code ${code}`);
        } else if (signal) {
            // Only log if it wasn't us (we use SIGKILL in stopSalesforceWorker, usually doesn't need log if we triggered it)
            // But good to know.
            console.log(`\n🛑 Salesforce Worker beëindigd door signaal: ${signal}`);
        }
    });
}

// Step 4: Start Backup Worker
function startBackupWorker() {
    console.log('💾 Stap 4: Backup Worker starten...');

    const backupWorker = spawn('node', ['backup_worker.js'], {
        cwd: __dirname,
        stdio: 'pipe',
        shell: true
    });
    processes.push({ name: 'Backup-Worker', process: backupWorker });

    backupWorker.stdout.on('data', (data) => {
        process.stdout.write(`[BACKUP] ${data}`);
    });

    backupWorker.stderr.on('data', (data) => {
        process.stdout.write(`[BACKUP ERROR] ${data}`);
    });
}

// Step 5: Start SAP Worker
function startSapWorker() {
    console.log('🏭 Stap 5: SAP IDoc Worker starten...');

    const sapWorker = spawn('node', ['sap_worker.js'], {
        cwd: __dirname,
        stdio: 'pipe',
        shell: true
    });
    processes.push({ name: 'SAP-Worker', process: sapWorker });

    sapWorker.stdout.on('data', (data) => {
        process.stdout.write(`[SAP-IDOC] ${data}`);
    });

    sapWorker.stderr.on('data', (data) => {
        process.stdout.write(`[SAP-ERROR] ${data}`);
    });
}

// Cleanup function
function killAll() {
    console.log('\n\n🛑 Alle processen stoppen...');
    processes.forEach(({ name, process }) => {
        console.log(`   Stopping ${name}...`);
        process.kill();
    });

    // Check if running in PM2 and stop the process explicitly
    if (process.env.pm_id) {
        console.log(`   Stopping PM2 process ${process.env.pm_id}...`);
        exec(`pm2 stop ${process.env.pm_id}`, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error stopping PM2 process: ${error}`);
                process.exit(1);
            }
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
}

// Handle termination signals
process.on('SIGINT', killAll);
process.on('SIGTERM', killAll);

initDb.on('error', (err) => {
    console.error('❌ Fout bij starten van database.js:', err);
    process.exit(1);
});

// Show helpful info after startup
// Show helpful info after startup
setTimeout(() => {
    console.log('\n╔═══════════════════════════════════════╗');
    console.log('║   ✨ Applicatie Actief!              ║');
    console.log('╚═══════════════════════════════════════╝');
    console.log('\n📍 Endpoints:');
    console.log('   🏠 Frontend:  http://localhost:3000/index.html');
    console.log('   🔐 Login:     http://localhost:3000/login.html');
    console.log('   📦 Products:  http://localhost:3000/api/products');
    console.log('\n🎮  Controls (via remote.js):');
    console.log('   Run: node remote.js');
    console.log('   [s] Stop Salesforce Worker (Test DLQ)');
    console.log('   [r] Restart Salesforce Worker\n');
}, 2000);

// Stop Salesforce Worker function
function stopSalesforceWorker() {
    const index = processes.findIndex(p => p.name === 'SF-Worker');
    if (index !== -1) {
        const { process: proc } = processes[index];
        // Remove from list first to prevent race conds or duplicate killing
        processes.splice(index, 1);

        // Kill the process tree
        kill(proc.pid, 'SIGKILL', (err) => {
            if (err) {
                console.error('Failed to kill Salesforce Worker:', err);
            } else {
                console.log('\n🛑 Salesforce Worker handmatig gestopt (DLQ Test Mode).');
            }
        });
    } else {
        console.log('\n⚠️ Salesforce Worker draait niet.');
    }
}

// Handle Remote Control via Socket.io
const httpServer = require("http").createServer();
const { Server } = require("socket.io");
const io = new Server(httpServer, {
    cors: { origin: "*" }
});

httpServer.listen(6000, "0.0.0.0", () => {
    console.log('\n📡 Remote control server listening on port 6000 (0.0.0.0)');
});

io.on("connection", (socket) => {
    // console.log(`New connection: ${socket.id}`);

    socket.on("command:s", () => {
        console.log("\n[Remote] Command received: Stop Salesforce Worker");
        stopSalesforceWorker();
    });

    socket.on("command:r", () => {
        console.log("\n[Remote] Command received: Restart Salesforce Worker");
        startSalesforceWorker();
    });
});