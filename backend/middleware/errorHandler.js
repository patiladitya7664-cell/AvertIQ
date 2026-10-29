"use strict";

/**
 * AVERTIQ - Central Error Handler
 * File: backend/middleware/errorHandler.js
 */

// Handles requests sent to API routes that do not exist.
function notFoundHandler(req, res, next) {
    const error = new Error(
        `Route not found: ${req.method} ${req.originalUrl}`
    );

    error.statusCode = 404;

    next(error);
}

// Handles application and API errors in one place.
function errorHandler(error, req, res, next) {
    if (res.headersSent) {
        return next(error);
    }

    let statusCode = Number(error.statusCode || error.status || 500);

    if (!Number.isInteger(statusCode) || statusCode < 400 || statusCode > 599) {
        statusCode = 500;
    }

    let message = error.message || "An unexpected server error occurred.";

    // Invalid MongoDB document ID.
    if (error.name === "CastError") {
        statusCode = 400;
        message = "Invalid resource identifier.";
    }

    // MongoDB schema validation errors.
    if (error.name === "ValidationError") {
        statusCode = 400;
        message = "Submitted data failed validation.";

        if (process.env.NODE_ENV !== "production") {
            message = error.message;
        }
    }

    // Duplicate MongoDB field value.
    if (error.code === 11000) {
        statusCode = 409;
        message = "A record with this value already exists.";
    }

    // Malformed JSON request body.
    if (
        error instanceof SyntaxError &&
        error.status === 400 &&
        Object.prototype.hasOwnProperty.call(error, "body")
    ) {
        statusCode = 400;
        message = "Invalid JSON request body.";
    }

    // Never expose internal error details in production.
    if (statusCode >= 500 && process.env.NODE_ENV === "production") {
        message = "An internal server error occurred.";
    }

    const response = {
        success: false,
        message
    };

    if (process.env.NODE_ENV !== "production") {
        response.errorType = error.name || "Error";
    }

    return res.status(statusCode).json(response);
}

module.exports = {
    notFoundHandler,
    errorHandler
};
