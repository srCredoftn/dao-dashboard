import { Request, Response, NextFunction } from "express";

interface LogEntry {
  timestamp: string;
  method: string;
  url: string;
  ip: string;
  userAgent: string;
  responseTime: number;
  statusCode: number;
  userId?: string;
  userEmail?: string;
}

export const logger = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const start = Date.now();

  // Store original end function
  const originalEnd = res.end;

  // Override end function to capture response time and status
  res.end = function (this: Response, ...args: any[]) {
    const responseTime = Date.now() - start;

    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.originalUrl,
      ip: req.ip || req.connection.remoteAddress || "unknown",
      userAgent: req.get("User-Agent") || "unknown",
      responseTime,
      statusCode: res.statusCode,
    };

    // Add user info if available (from auth middleware)
    if (req.user) {
      logEntry.userId = req.user.id;
      logEntry.userEmail = req.user.email;
    }

    // Color code based on status
    const statusColor = getStatusColor(res.statusCode);
    const methodColor = getMethodColor(req.method);

    // Format the log message
    const logMessage = [
      `${statusColor}${res.statusCode}\x1b[0m`,
      `${methodColor}${req.method.padEnd(7)}\x1b[0m`,
      `${req.originalUrl}`,
      `${responseTime}ms`,
      req.user ? `[${req.user.email}]` : "[anonymous]",
    ].join(" ");

    console.log(logMessage);

    // Log errors and slow requests with more detail
    if (res.statusCode >= 400 || responseTime > 1000) {
      console.log("📊 Request details:", {
        ip: logEntry.ip,
        userAgent: logEntry.userAgent,
        ...(req.user && { user: req.user.email }),
        ...(req.body &&
          Object.keys(req.body).length > 0 && {
            bodyKeys: Object.keys(req.body),
          }),
      });
    }

    // Call original end function
    originalEnd.apply(this, args);
  };

  next();
};

function getStatusColor(status: number): string {
  if (status >= 500) return "\x1b[31m"; // Red
  if (status >= 400) return "\x1b[33m"; // Yellow
  if (status >= 300) return "\x1b[36m"; // Cyan
  if (status >= 200) return "\x1b[32m"; // Green
  return "\x1b[37m"; // White
}

function getMethodColor(method: string): string {
  switch (method) {
    case "GET":
      return "\x1b[32m"; // Green
    case "POST":
      return "\x1b[33m"; // Yellow
    case "PUT":
      return "\x1b[34m"; // Blue
    case "DELETE":
      return "\x1b[31m"; // Red
    case "PATCH":
      return "\x1b[35m"; // Magenta
    default:
      return "\x1b[37m"; // White
  }
}

// Security logger for auth events
export const securityLogger = {
  loginAttempt: (email: string, ip: string, success: boolean) => {
    const status = success ? "✅ SUCCESS" : "❌ FAILED";
    const color = success ? "\x1b[32m" : "\x1b[31m";
    console.log(`${color}🔐 LOGIN ${status}\x1b[0m ${email} from ${ip}`);
  },

  logout: (email: string, ip: string) => {
    console.log(`🔓 LOGOUT ${email} from ${ip}`);
  },

  tokenExpired: (email: string, ip: string) => {
    console.log(`⏰ TOKEN EXPIRED ${email} from ${ip}`);
  },

  unauthorized: (ip: string, endpoint: string) => {
    console.log(`\x1b[31m🚫 UNAUTHORIZED ACCESS\x1b[0m ${endpoint} from ${ip}`);
  },

  forbidden: (email: string, ip: string, endpoint: string) => {
    console.log(
      `\x1b[33m⚠️  FORBIDDEN\x1b[0m ${email} tried to access ${endpoint} from ${ip}`,
    );
  },
};
