export const LogLevel = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
};

export class Logger {
    constructor(prefix = '', level = LogLevel.DEBUG) {
        this.prefix = prefix;
        this.level = level;
    }

    _formatMessage(levelName, message, data) {
        const timestamp = new Date().toISOString();
        let logString = `[${timestamp}] [${levelName}] ${this.prefix ? `[${this.prefix}] ` : ''}${message}`;
        if (data !== undefined && data !== null) {
            try {
                if (data instanceof Error) {
                    logString += `\n  Error Name: ${data.name}\n  Error Message: ${data.message}\n  Stack: ${data.stack}`;
                } else if (data instanceof TypeError && data.message === 'Failed to fetch') {
                    // Typical network error / CORS
                    logString += `\n  Data: Network/CORS Error: ${data.message}`;
                } else {
                    const dataStr = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);
                    logString += `\n  Data: ${dataStr}`;
                }
            } catch (e) {
                logString += `\n  Data: [Unserializable Object]`;
            }
        }
        return logString;
    }

    debug(message, data) {
        if (this.level <= LogLevel.DEBUG) {
            console.debug(this._formatMessage('DEBUG', message, data));
        }
    }

    info(message, data) {
        if (this.level <= LogLevel.INFO) {
            console.log(this._formatMessage('INFO', message, data));
        }
    }

    warn(message, data) {
        if (this.level <= LogLevel.WARN) {
            console.warn(this._formatMessage('WARN', message, data));
        }
    }

    error(message, error) {
        if (this.level <= LogLevel.ERROR) {
            console.error(this._formatMessage('ERROR', message, error));
        }
    }
}

export const apiLogger = new Logger('APIClient');
