"use strict";

const mongoose = require("mongoose");

/**
 * Connect AVERTIQ backend to MongoDB.
 *
 * Environment variable:
 * MONGODB_URI=mongodb://127.0.0.1:27017/avertiq
 */
async function connectDatabase() {
    const mongoUri = process.env.MONGODB_URI;

    if (!mongoUri) {
        throw new Error(
            "MONGODB_URI is missing. Configure it in the backend .env file."
        );
    }

    try {
        await mongoose.connect(mongoUri, {
            serverSelectionTimeoutMS: 10000
        });

        console.log("✅ MongoDB connected successfully.");
        console.log(`📦 Database: ${mongoose.connection.name}`);

        return mongoose.connection;
    } catch (error) {
        console.error("❌ MongoDB connection failed:", error.message);
        throw error;
    }
}

/**
 * Close MongoDB connection gracefully.
 */
async function disconnectDatabase() {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
        console.log("MongoDB connection closed.");
    }
}

module.exports = {
    connectDatabase,
    disconnectDatabase
};
