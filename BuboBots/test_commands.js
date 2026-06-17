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

    console.log("\n=== Testing /buy (Invalid syntax) ===");
    const buyInv1 = await commands.handleCommand('/buy 0700.HK 100 at HKD');
    console.log(buyInv1);

    console.log("\n=== Testing /buy (Invalid amount) ===");
    const buyInv2 = await commands.handleCommand('/buy 0700.HK abc at HKD 450.00 using ZSZQ');
    console.log(buyInv2);

    console.log("\n=== Testing /sell (Invalid syntax) ===");
    const sellInv = await commands.handleCommand('/sell 0700.HK 100 at HKD');
    console.log(sellInv);

    console.log("\n=== Testing /sell (Valid syntax) ===");
    const sellVal = await commands.handleCommand('/sell 0700.HK 50 at HKD 460.00 using ZSZQ');
    console.log(sellVal);

    console.log("\n=== Testing /manual ===");
    const manualVal = await commands.handleCommand('/manual');
    console.log(manualVal);
    
    process.exit(0);
}

runTests();
