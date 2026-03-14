const commands = require('./commands');

async function runTests() {
    console.log("=== Testing /echo ===");
    const echoRes = await commands.handleCommand('/echo hello world');
    console.log(echoRes);

    console.log("\n=== Testing /alert (Invalid) ===");
    const alertInv = await commands.handleCommand('/alert AAPL 250');
    console.log(alertInv);

    console.log("\n=== Testing /alert (Absolute) ===");
    const alertAbs = await commands.handleCommand('/alert TSLA 150 200');
    console.log(alertAbs);

    console.log("\n=== Testing /alert (Relative Percentage) ===");
    const alertRel = await commands.handleCommand('/alert MSFT -5% +10%');
    console.log(alertRel);

    console.log("\n=== Testing /alerts ===");
    const alertsRes = await commands.handleCommand('/alerts');
    console.log(alertsRes);

    console.log("\n=== Testing /help ===");
    const helpRes = await commands.handleCommand('/help');
    console.log(helpRes);

    console.log("\n=== Testing Invalid Command ===");
    const invalidRes = await commands.handleCommand('/unknownXYZ');
    console.log(invalidRes);
    
    process.exit(0);
}

runTests();
