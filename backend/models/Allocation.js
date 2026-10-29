"use strict";

const mongoose = require("mongoose");

const allocationSchema = new mongoose.Schema(
    {
        allocationCode: {
            type: String,
            trim: true,
            uppercase: true,
            default: ""
        },

        disaster: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Disaster",
            default: null
        },

        location: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Location",
            required: [true, "Target location is required."]
        },

        resource: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Resource",
            required: [true, "Resource is required."]
        },

        quantity: {
            type: Number,
            required: [true, "Allocation quantity is required."],
            min: [0.01, "Allocation quantity must be greater than zero."]
        },

        sourceHub: {
            type: String,
            trim: true,
            default: ""
        },

        sourceHubCode: {
            type: String,
            trim: true,
            uppercase: true,
            default: ""
        },

        priorityScore: {
            type: Number,
            min: 0,
            default: 0
        },

        routeDistanceKm: {
            type: Number,
            min: 0,
            default: 0
        },

        estimatedTravelMinutes: {
            type: Number,
            min: 0,
            default: 0
        },

        status: {
            type: String,
            enum: [
                "recommended",
                "pending",
                "approved",
                "dispatched",
                "delivered",
                "cancelled"
            ],
            default: "recommended",
            lowercase: true
        },

        allocatedAt: {
            type: Date,
            default: null
        },

        dispatchedAt: {
            type: Date,
            default: null
        },

        deliveredAt: {
            type: Date,
            default: null
        },

        notes: {
            type: String,
            trim: true,
            maxlength: 1500,
            default: ""
        },

        isSimulation: {
            type: Boolean,
            default: true
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

allocationSchema.index({ disaster: 1, status: 1 });
allocationSchema.index({ location: 1, status: 1 });
allocationSchema.index({ resource: 1, createdAt: -1 });

module.exports = mongoose.model("Allocation", allocationSchema);
