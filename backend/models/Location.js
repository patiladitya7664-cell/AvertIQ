"use strict";

const mongoose = require("mongoose");

const locationSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Location name is required."],
            trim: true,
            minlength: 2,
            maxlength: 150
        },

        locationCode: {
            type: String,
            trim: true,
            uppercase: true,
            maxlength: 50,
            default: ""
        },

        latitude: {
            type: Number,
            required: [true, "Latitude is required."],
            min: -90,
            max: 90
        },

        longitude: {
            type: Number,
            required: [true, "Longitude is required."],
            min: -180,
            max: 180
        },

        region: {
            type: String,
            trim: true,
            default: ""
        },

        population: {
            type: Number,
            min: 0,
            default: 0
        },

        vulnerablePopulation: {
            type: Number,
            min: 0,
            default: 0,
            validate: {
                validator: function (value) {
                    return value <= this.population;
                },
                message: "Vulnerable population cannot exceed total population."
            }
        },

        severity: {
            type: String,
            enum: ["low", "medium", "high", "critical"],
            default: "medium",
            lowercase: true
        },

        status: {
            type: String,
            enum: ["affected", "assessed", "assistance_required", "resolved"],
            default: "affected",
            lowercase: true
        },

        requiredResources: {
            food: { type: Number, min: 0, default: 0 },
            water: { type: Number, min: 0, default: 0 },
            medicalKits: { type: Number, min: 0, default: 0 },
            shelters: { type: Number, min: 0, default: 0 }
        },

        isAccessible: {
            type: Boolean,
            default: true
        },

        notes: {
            type: String,
            trim: true,
            maxlength: 2000,
            default: ""
        },

        disaster: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Disaster",
            default: null
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

locationSchema.index({ disaster: 1, severity: 1 });
locationSchema.index({ region: 1 });
locationSchema.index({ latitude: 1, longitude: 1 });

module.exports = mongoose.model("Location", locationSchema);
