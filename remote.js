const io = require("socket.io-client");
const readline = require('readline');

// Get IP from args or default to the user's server
const target = process.argv[2] || "http://10.2.160.224:6000";

// Connect to the control server
console.log(`Connecting to remote control server at ${target}...`);
const socket = io(target);

socket.on("connect", () => {
    console.log('✅ Connected to start.js');
    console.log('\n🎮  Remote Controls:');
    console.log('   [s] Stop Salesforce Worker');
    console.log('   [r] Restart Salesforce Worker');
    console.log('   [q] Quit Application (and this remote)');
    console.log('\n⌨️  Press keys to send commands...');
});

socket.on("connect_error", (err) => {
    console.error(`Connection Error: ${err.message}`);
    console.log("Make sure start.js is running and port 6000 is open on the server.");
});

socket.on("disconnect", () => {
    console.log("❌ Disconnected from server. Is start.js running?");
    process.exit(0);
});

// Handle Keyboard Input
readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
}

process.stdin.on('keypress', (str, key) => {
    if (key.ctrl && key.name === 'c') {
        console.log("Exiting remote...");
        process.exit(0);
    } else if (key.name === 'q') {
        console.log("Sending: Quit");
        socket.emit("command:q");
        setTimeout(() => process.exit(0), 100); // Give time to send
    } else if (key.name === 's') {
        console.log("Sending: Stop Salesforce Worker");
        socket.emit("command:s");
    } else if (key.name === 'r') {
        console.log("Sending: Restart Salesforce Worker");
        socket.emit("command:r");
    }
});
