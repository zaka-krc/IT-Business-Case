const { spawn } = require('child_process');
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
        const error = data.toString();
        // If RabbitMQ or Salesforce is not configured, show warning but don't crash
        if (error.includes('RABBITMQ_URL') || error.includes('SF_USERNAME')) {
            console.log('\n⚠️ Salesforce Worker niet gestart: Configuratie ontbreekt (optioneel)');
            console.log('   Tip: Configureer .env met RABBITMQ_URL en Salesforce credentials\n');
        } else {
            process.stderr.write(`[SF-WORKER ERROR] ${error}`);
        }
    });

    sfWorker.on('close', (code) => {
        if (code !== 0 && code !== null) {
            console.log(`\n⚠️ Salesforce Worker gestopt met code ${code}`);
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
        process.stderr.write(`[BACKUP ERROR] ${data}`);
    });
}

// Cleanup function
function killAll() {
    console.log('\n\n🛑 Alle processen stoppen...');
    processes.forEach(({ name, process }) => {
        console.log(`   Stopping ${name}...`);
        process.kill();
    });
    process.exit(0);
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
    console.log('\n🎮  Controls:');
    console.log('   [s] Stop Salesforce Worker (Test DLQ)');
    console.log('   [r] Restart Salesforce Worker');
    console.log('   [q] Quit Application');
    console.log('\n⌨️  Druk op CTRL+C om te stoppen\n');
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

// Handle Keyboard Input
const readline = require('readline');
readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
}

process.stdin.on('keypress', (str, key) => {
    if (key.ctrl && key.name === 'c') {
        killAll();
    } else if (key.name === 'q') {
        killAll();
    } else if (key.name === 's') {
        stopSalesforceWorker();
    } else if (key.name === 'r') {
        startSalesforceWorker();
    }
});