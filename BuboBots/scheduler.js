const cron = require('node-cron');
const db = require('./db');
const googleChat = require('./google_chat_provider');
const telegram = require('./telegram_provider');

const activeJobs = new Map();

async function initScheduler() {
    console.log('[Scheduler] Initializing background scheduler...');
    const schedules = await db.getSchedules();
    console.log(`[Scheduler] Loading ${schedules.length} schedules...`);
    
    schedules.forEach(schedule => {
        if (schedule.active) {
            startJob(schedule);
        }
    });
}

function startJob(schedule) {
    if (activeJobs.has(schedule.id)) {
        activeJobs.get(schedule.id).stop();
    }

    const job = cron.schedule(schedule.cron_expression, async () => {
        let finalMessage = schedule.message;
        
        try {
            if (schedule.is_function) {
                console.log(`[Scheduler] Executing dynamic task module: scheduleTool/${schedule.fn_module}`);
                const path = require('path');
                const modulePath = path.join(__dirname, 'scheduleTool', schedule.fn_module);
                let mod;
                try {
                    mod = await import(`file://${modulePath}`);
                } catch (e) {
                    mod = require(modulePath);
                }
                
                if (typeof mod.getTaskFunction !== 'function') {
                    throw new Error(`getTaskFunction() not found in the module scheduleTool/${schedule.fn_module}`);
                }

                const fn = mod.getTaskFunction();
                if (typeof fn !== 'function') {
                    throw new Error(`getTaskFunction() did not return an executable function in scheduleTool/${schedule.fn_module}`);
                }

                // Parse arguments
                let args = [];
                if (schedule.fn_args) {
                    try {
                        args = JSON.parse(schedule.fn_args);
                    } catch (e) {
                        console.warn(`[Scheduler] Failed to parse fn_args: ${schedule.fn_args}`);
                    }
                }

                const result = await fn(...args);
                
                // Format the result for messaging
                if (typeof result === 'object') {
                    finalMessage = "Task Result:\n" + JSON.stringify(result, null, 2);
                } else {
                    finalMessage = `Task Result: ${result}`;
                }
            } else {
                console.log(`[Scheduler] Running job ${schedule.id} (${schedule.provider}): ${finalMessage}`);
            }

            if (schedule.provider === 'google-chat') {
                if (process.env.ENABLE_GOOGLE_CHAT === 'true') {
                    await googleChat.sendMessage(schedule.target_id, finalMessage);
                }
            } else if (schedule.provider === 'telegram') {
                if (process.env.ENABLE_TELEGRAM_CHAT === 'true') {
                    await telegram.sendMessage(schedule.target_id, finalMessage);
                }
            }
        } catch (err) {
            console.error(`[Scheduler] Job ${schedule.id} execution failed:`, err.message);
        }
    });

    activeJobs.set(schedule.id, job);
}

function stopJob(id) {
    if (activeJobs.has(id)) {
        activeJobs.get(id).stop();
        activeJobs.delete(id);
    }
}

async function reloadSchedules() {
    console.log('[Scheduler] Reloading schedules...');
    // Stop all current jobs
    activeJobs.forEach(job => job.stop());
    activeJobs.clear();
    // Restart all active jobs
    await initScheduler();
}

module.exports = {
    initScheduler,
    startJob,
    stopJob,
    reloadSchedules
};
