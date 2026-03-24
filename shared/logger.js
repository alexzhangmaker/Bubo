const winston = require('winston');
require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

/**
 * Creates a winston logger with daily rotation.
 * @param {string} serviceName 
 * @param {string} baseDir 
 * @returns {winston.Logger}
 */
function createLogger(serviceName, baseDir) {
  const logDir = path.join(baseDir, 'logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const transport = new winston.transports.DailyRotateFile({
    filename: path.join(logDir, `${serviceName}-%DATE%.log`),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '3d' // Keep 3 days
  });

  const logger = winston.createLogger({
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.printf(info => `${info.timestamp} [${info.level.toUpperCase()}] ${info.message}`)
    ),
    transports: [
      transport,
      new winston.transports.Console()
    ]
  });

  return logger;
}

/**
 * Truncates string to specified byte length.
 * @param {any} data 
 * @param {number} len 
 * @returns {string}
 */
function truncate(data, len = 100) {
  if (data === undefined || data === null) return '';
  let str = typeof data === 'string' ? data : JSON.stringify(data);
  if (str.length > len) {
    return str.substring(0, len) + '...';
  }
  return str;
}

/**
 * Express middleware for logging requests and responses.
 * @param {winston.Logger} logger 
 * @returns {Function}
 */
function loggingMiddleware(logger) {
  return (req, res, next) => {
    const start = Date.now();
    const { method, url, body } = req;
    
    // Capture response body for small responses
    const oldSend = res.send;
    let responseBody;

    res.send = function(chunk) {
      responseBody = chunk;
      return oldSend.apply(res, arguments);
    };

    res.on('finish', () => {
      const duration = Date.now() - start;
      const status = res.statusCode;
      const reqStr = truncate(body);
      const resStr = truncate(responseBody);

      const logMessage = `${method} ${url} ${status} ${duration}ms | Req: ${reqStr} | Res: ${resStr}`;
      
      if (status >= 400) {
        logger.error(logMessage);
      } else {
        logger.info(logMessage);
      }
    });

    next();
  };
}

module.exports = { createLogger, loggingMiddleware };
