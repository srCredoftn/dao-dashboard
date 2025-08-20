import { Request, Response, NextFunction } from "express";

interface ErrorResponse {
  error: string;
  status: number;
  timestamp: string;
  path: string;
  details?: any;
}

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  // Default error response
  let status = 500;
  let message = "Internal Server Error";
  let details: any = undefined;

  // Log the error for debugging
  console.error("🚨 Error occurred:", {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
  });

  // Handle different types of errors
  if (err.name === "ValidationError") {
    // Mongoose validation error
    status = 400;
    message = "Validation Error";
    details = Object.values(err.errors).map((e: any) => ({
      field: e.path,
      message: e.message,
    }));
  } else if (err.name === "MongoError" || err.name === "MongoServerError") {
    // MongoDB errors
    if (err.code === 11000) {
      // Duplicate key error
      status = 400;
      message = "Duplicate entry";
      const field = Object.keys(err.keyPattern)[0];
      details = { field, message: `${field} already exists` };
    } else {
      status = 500;
      message = "Database Error";
    }
  } else if (err.name === "CastError") {
    // Invalid ObjectId
    status = 400;
    message = "Invalid ID format";
  } else if (err.name === "JsonWebTokenError") {
    // JWT errors
    status = 401;
    message = "Invalid token";
  } else if (err.name === "TokenExpiredError") {
    status = 401;
    message = "Token expired";
  } else if (err.status || err.statusCode) {
    // Custom errors with status
    status = err.status || err.statusCode;
    message = err.message || message;
  } else if (err.message) {
    // Generic errors with message
    message = err.message;
  }

  // Don't expose sensitive information in production
  if (process.env.NODE_ENV === "production") {
    // In production, don't expose stack traces or internal details
    if (status === 500) {
      message = "Internal Server Error";
      details = undefined;
    }
  } else {
    // In development, include stack trace for debugging
    if (status === 500) {
      details = {
        stack: err.stack,
        originalError: err.message,
      };
    }
  }

  const errorResponse: ErrorResponse = {
    error: message,
    status,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    ...(details && { details }),
  };

  res.status(status).json(errorResponse);
};

// 404 handler (not found)
export const notFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const error = new Error(`Route not found: ${req.originalUrl}`);
  (error as any).status = 404;
  next(error);
};

// Async error wrapper
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
