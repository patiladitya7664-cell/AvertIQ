"use strict";

const mongoose = require("mongoose");

const resourceSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Resource name is required."],
            trim: true,
            maxlength: 120
        },

        resourceCode: {
            type: String,
            trim: true,
            uppercase: true,
            default: ""
        },

        category: {
            type: String,
            enum: [
                "food",
                "water",
                "medical",
                "shelter",
                "rescue_equipment",
                "transport",
                "other"
            ],
            required: true,
            lowercase: true
        },

        unit: {
            type: String,
            trim: true,
            default: "units",
            maxlength: 30
        },

        quantity: {
            type: Number,
            required: true,
            min: 0,
            default: 0
        },

        reservedQuantity: {
            type: Number,
            min: 0,
            default: 0,
            validate: {
                validator: function (value) {
                    return value <= this.quantity;
                },
                message: "Reserved quantity cannot exceed total quantity."
            }
        },

        minimumStock: {
            type: Number,
            min: 0,
            default: 0
        },

        hubName: {
            type: String,
            trim: true,
            default: ""
        },

        hubCode: {
            type: String,
            trim: true,
            uppercase: true,
            default: ""
        },

        latitude: {
            type: Number,
            min: -90,
            max: 90,
            default: null
        },

        longitude: {
            type: Number,
            min: -180,
            max: 180,
            default: null
        },

        status: {
            type: String,
            enum: ["available", "low_stock", "reserved", "depleted"],
            default: "available",
            lowercase: true
        },

        isSimulation: {
            type: Boolean,
            default: true
        },

        notes: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: ""
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

resourceSchema.virtual("availableQuantity").get(function () {
    return Math.max(0, this.quantity - this.reservedQuantity);
});

resourceSchema.index({ category: 1, status: 1 });
resourceSchema.index({ hubCode: 1 });
resourceSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Resource", resourceSchema);
