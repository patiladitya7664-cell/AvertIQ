"use strict";

const mongoose = require("mongoose");

const disasterSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Disaster name is required."],
            trim: true,
            minlength: 2,
            maxlength: 120
        },

        type: {
            type: String,
            enum: [
                "flood",
                "earthquake",
                "cyclone",
                "wildfire",
                "landslide",
                "drought",
                "other"
            ],
            default: "other",
            required: true,
            lowercase: true,
            trim: true
        },

        region: {
            type: String,
            required: [true, "Disaster region is required."],
            trim: true,
            maxlength: 150
        },

        description: {
            type: String,
            trim: true,
            maxlength: 2000,
            default: ""
        },

        severity: {
            type: String,
            enum: ["low", "medium", "high", "critical"],
            default: "medium",
            lowercase: true,
            required: true
        },

        status: {
            type: String,
            enum: ["planned", "active", "contained", "closed"],
            default: "active",
            lowercase: true,
            required: true
        },

        isSimulation: {
            type: Boolean,
            default: true
        },

        startTime: {
            type: Date,
            default: Date.now
        },

        endTime: {
            type: Date,
            default: null,
            validate: {
                validator: function (value) {
                    if (!value || !this.startTime) {
                        return true;
                    }

                    return value >= this.startTime;
                },
                message: "End time cannot be earlier than start time."
            }
        },

        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: () => ({})
        }
    },
    {
        timestamps: true,
        versionKey: false
    }
);

// Improve filtering and sorting performance.
disasterSchema.index({ status: 1, severity: 1 });
disasterSchema.index({ region: 1 });
disasterSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Disaster", disasterSchema);
