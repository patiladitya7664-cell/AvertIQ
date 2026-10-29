"use strict";

const mongoose = require("mongoose");

const rescueTeamSchema = new mongoose.Schema(
    {
        teamName: {
            type: String,
            required: [true, "Rescue team name is required."],
            trim: true,
            maxlength: 120
        },

        teamCode: {
            type: String,
            required: [true, "Rescue team code is required."],
            trim: true,
            uppercase: true,
            maxlength: 50
        },

        teamType: {
            type: String,
            enum: [
                "medical",
                "search_and_rescue",
                "fire_and_rescue",
                "evacuation",
                "logistics",
                "general"
            ],
            default: "general",
            lowercase: true
        },

        membersCount: {
            type: Number,
            min: 1,
            default: 1
        },

        status: {
            type: String,
            enum: [
                "available",
                "assigned",
                "active",
                "returning",
                "completed",
                "unavailable"
            ],
            default: "available",
            lowercase: true
        },

        latitude: {
            type: Number,
            required: true,
            min: -90,
            max: 90
        },

        longitude: {
            type: Number,
            required: true,
            min: -180,
            max: 180
        },

        assignedLocation: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Location",
            default: null
        },

        assignedDisaster: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Disaster",
            default: null
        },

        assignedAt: {
            type: Date,
            default: null
        },

        contactNumber: {
            type: String,
            trim: true,
            default: ""
        },

        equipment: {
            type: [String],
            default: []
        },

        isSimulation: {
            type: Boolean,
            default: true
        },

        notes: {
            type: String,
            trim: true,
            maxlength: 1500,
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

rescueTeamSchema.index({ teamCode: 1 }, { unique: true });
rescueTeamSchema.index({ status: 1 });
rescueTeamSchema.index({ assignedDisaster: 1, status: 1 });

module.exports = mongoose.model("RescueTeam", rescueTeamSchema);
