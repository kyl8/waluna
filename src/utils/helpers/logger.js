import pino from 'pino';

// Detecta nível de log do ambiente
const LOG_LEVEL = import.meta.env.VITE_LOG_LEVEL || (import.meta.env.DEV ? 'debug' : 'info');

// Configuração do Pino logger
const pinoLogger = pino({
  level: LOG_LEVEL,
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
      singleLine: false,
      messageFormat: '{levelLabel} [{context}] {msg}',
    },
  },
});

class Logger {
  constructor(context = 'App') {
    this.context = context;
    this.pinoLogger = pinoLogger.child({ context });
  }

  debug(message, data = null) {
    if (data) {
      console.debug(`🔍 [${this.context}] ${message}`, data);
      this.pinoLogger.debug({ data }, message);
    } else {
      console.debug(`🔍 [${this.context}] ${message}`);
      this.pinoLogger.debug(message);
    }
  }

  info(message, data = null) {
    if (data) {
      console.info(`ℹ️  [${this.context}] ${message}`, data);
      this.pinoLogger.info({ data }, message);
    } else {
      console.info(`ℹ️  [${this.context}] ${message}`);
      this.pinoLogger.info(message);
    }
  }

  warn(message, data = null) {
    if (data) {
      console.warn(`⚠️  [${this.context}] ${message}`, data);
      this.pinoLogger.warn({ data }, message);
    } else {
      console.warn(`⚠️  [${this.context}] ${message}`);
      this.pinoLogger.warn(message);
    }
  }

  error(message, error = null) {
    if (error instanceof Error) {
      console.error(`❌ [${this.context}] ${message}`, {
        name: error.name,
        message: error.message,
        stack: error.stack,
      });
      this.pinoLogger.error({ err: error }, message);
    } else if (error) {
      console.error(`❌ [${this.context}] ${message}`, error);
      this.pinoLogger.error({ error }, message);
    } else {
      console.error(`❌ [${this.context}] ${message}`);
      this.pinoLogger.error(message);
    }
  }

  group(label) {
    console.group(`📦 ${label}`);
    return () => console.groupEnd();
  }

  time(label) {
    console.time(label);
    return () => console.timeEnd(label);
  }

  table(data) {
    console.table(data);
    this.pinoLogger.debug({ data }, 'Table data');
  }

  trace(message = 'Trace') {
    console.trace(`🔗 [${this.context}] ${message}`);
  }

  performance(label, fn) {
    const start = performance.now();
    const result = fn();
    const end = performance.now();
    const duration = (end - start).toFixed(2);
    console.log(`⏱️  [${this.context}] ${label}: ${duration}ms`);
    this.pinoLogger.debug({ duration: `${duration}ms` }, label);
    return result;
  }

  async asyncPerformance(label, fn) {
    const start = performance.now();
    const result = await fn();
    const end = performance.now();
    const duration = (end - start).toFixed(2);
    console.log(`⏱️  [${this.context}] ${label}: ${duration}ms`);
    this.pinoLogger.debug({ duration: `${duration}ms` }, label);
    return result;
  }
}

// Default logger instance
const logger = new Logger('Waluna');

export default logger;
export { Logger };



