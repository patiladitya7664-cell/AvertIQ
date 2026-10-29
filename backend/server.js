"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const { connectDatabase } = require("./config/database");

const {
    notFoundHandler,
    errorHandler
} = require("./middleware/errorHandler");

const disasterRoutes = require("./routes/disasterRoutes");
const locationRoutes = require("./routes/locationRoutes");
const resourceRoutes = require("./routes/resourceRoutes");
const allocationRoutes = require("./routes/allocationRoutes");
const simulationRoutes = require("./routes/simulationRoutes");

/* =====================================================
   APPLICATION CONFIGURATION
===================================================== */

const app = express();

const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.HOST || "127.0.0.1";
const APP_NAME = process.env.APP_NAME || "AVERTIQ";
const APP_MODE = process.env.APP_MODE || "SIMULATION";

if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
}

/* =====================================================
   CORS CONFIGURATION
===================================================== */

const allowedOrigins = (
    process.env.CORS_ORIGINS ||
    process.env.CLIENT_URL ||
    "http://127.0.0.1:5500,http://localhost:5500"
)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

app.use(
    cors({
        origin(origin, callback) {
            // Permit requests without an Origin header, such as
            // local command-line health checks.
            if (!origin || allowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            const error = new Error(
                "CORS blocked this request. Frontend origin is not allowed."
            );

            error.statusCode = 403;

            return callback(error);
        },

        methods: [
            "GET",
            "POST",
            "PATCH",
            "PUT",
            "DELETE",
            "OPTIONS"
        ],

        allowedHeaders: [
            "Content-Type",
            "Authorization"
        ],

        credentials: true
    })
);

/* =====================================================
   MIDDLEWARE
===================================================== */

app.use(express.json({ limit: "1mb" }));

app.use(
    express.urlencoded({
        extended: true,
        limit: "1mb"
    })
);

/* =====================================================
   ROOT ENDPOINT
===================================================== */

app.get("/", (req, res) => {
    res.status(200).json({
        success: true,
        application: APP_NAME,
        message: "AVERTIQ backend is running.",
        mode: APP_MODE,
        environment: process.env.NODE_ENV || "development"
    });
});

/* =====================================================
   HEALTH CHECK
===================================================== */

app.get("/api/health", (req, res) => {
    const databaseConnected =
        mongoose.connection.readyState === 1;

    res.status(databaseConnected ? 200 : 503).json({
        success: databaseConnected,
        application: APP_NAME,
        mode: APP_MODE,
        server: "running",
        database: databaseConnected
            ? "connected"
            : "disconnected",
        timestamp: new Date().toISOString()
    });
});

/* =====================================================
   API ROUTES
===================================================== */

app.use("/api/disasters", disasterRoutes);

app.use("/api/locations", locationRoutes);

app.use("/api/resources", resourceRoutes);

app.use("/api/allocations", allocationRoutes);

app.use("/api/simulations", simulationRoutes);

/* =====================================================
   ERROR HANDLERS
   Keep these at the end.
===================================================== */

app.use(notFoundHandler);

app.use(errorHandler);

/* =====================================================
   START SERVER
===================================================== */

async function startServer() {
    try {
        // Connect to MongoDB before accepting requests.
        await connectDatabase();

        const server = app.listen(PORT, HOST, () => {
            console.log("");
            console.log("======================================");
            console.log("       AVERTIQ BACKEND STARTED");
            console.log("======================================");
            console.log(`Application: ${APP_NAME}`);
            console.log(`Port: ${PORT}`);
            console.log(`Host: ${HOST}`);
            console.log(`Mode: ${APP_MODE}`);
            console.log(
                `Health: http://localhost:${PORT}/api/health`
            );
            console.log(
                `Disasters: http://localhost:${PORT}/api/disasters`
            );
            console.log(
                `Locations: http://localhost:${PORT}/api/locations`
            );
            console.log(
                `Resources: http://localhost:${PORT}/api/resources`
            );
            console.log(
                `Allocations: http://localhost:${PORT}/api/allocations`
            );
            console.log(
                `Simulations: http://localhost:${PORT}/api/simulations/health`
            );
            console.log("======================================");
            console.log("");
        });

        let shuttingDown = false;

        async function shutdown(signal) {
            if (shuttingDown) {
                return;
            }

            shuttingDown = true;

            console.log(
                `\n${signal} received. Shutting down AVERTIQ...`
            );

            const timeout = setTimeout(() => {
                console.error("Shutdown timed out.");
                process.exit(1);
            }, 10000);

            timeout.unref();

            server.close(async () => {
                try {
                    await mongoose.disconnect();

                    console.log("MongoDB disconnected.");
                    clearTimeout(timeout);

                    process.exit(0);
                } catch (error) {
                    console.error(
                        "Shutdown error:",
                        error.message
                    );

                    clearTimeout(timeout);
                    process.exit(1);
                }
            });
        }

        process.once("SIGINT", () => {
            shutdown("SIGINT");
        });

        process.once("SIGTERM", () => {
            shutdown("SIGTERM");
        });

        return server;
    } catch (error) {
        console.error(
            "\nFailed to start AVERTIQ backend."
        );

        console.error(error.stack || error.message);

        process.exitCode = 1;

        return null;
    }
}

/* =====================================================
   APPLICATION ENTRY POINT
===================================================== */

if (require.main === module) {
    startServer();
}

module.exports = app;
