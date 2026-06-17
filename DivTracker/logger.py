import logging
import os
import time
import json
from logging.handlers import TimedRotatingFileHandler
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

def setup_logger(service_name, base_dir):
    log_dir = os.path.join(base_dir, "logs")
    if not os.path.exists(log_dir):
        os.makedirs(log_dir)
        
    logger = logging.getLogger(service_name)
    logger.setLevel(logging.INFO)
    
    if logger.hasHandlers():
        logger.handlers.clear()
        
    handler = TimedRotatingFileHandler(
        os.path.join(log_dir, f"{service_name}.log"),
        when="D",
        interval=1,
        backupCount=3,
        encoding="utf-8"
    )
    
    formatter = logging.Formatter('%(asctime)s [%(levelname)s] %(message)s', datefmt='%Y-%m-%d %H:%M:%S')
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)
    
    return logger

class LoggingMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, logger):
        super().__init__(app)
        self.logger = logger

    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        response = await call_next(request)
        process_time = int((time.time() - start_time) * 1000)
        status_code = response.status_code
        log_msg = f"{request.method} {request.url.path} {status_code} {process_time}ms"
        
        if status_code >= 400:
            self.logger.error(log_msg)
        else:
            self.logger.info(log_msg)
            
        return response
