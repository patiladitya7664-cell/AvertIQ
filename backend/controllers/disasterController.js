"use strict";

const Disaster = require("../models/Disaster");
const Location = require("../models/Location");

/**
 * GET /api/disasters
 * Fetch disasters with optional filters and pagination.
 */
async function getDisasters(req, res, next) {
    try {
        const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
        const limit = Math.min(
            100,
            Math.max(1, Number.parseInt(req.query.limit, 10) || 20)
        );

        const filter = {};

        if (req.query.status) {
            filter.status = String(req.query.status).toLowerCase();
        }

        if (req.query.severity) {
            filter.severity = String(req.query.severity).toLowerCase();
        }

        if (req.query.type) {
            filter.type = String(req.query.type).toLowerCase();
        }

        if (req.query.region) {
            filter.region = {
                $regex: String(req.query.region).trim(),
                $options: "i"
            };
        }

        const [disasters, total] = await Promise.all([
            Disaster.find(filter)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),

            Disaster.countDocuments(filter)
        ]);

        return res.status(200).json({
            success: true,
            data: disasters,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        next(error);
    }
}

/**
 * GET /api/disasters/:id
 */
async function getDisasterById(req, res, next) {
    try {
        const disaster = await Disaster.findById(req.params.id).lean();

        if (!disaster) {
            return res.status(404).json({
                success: false,
                message: "Disaster not found."
            });
        }

        return res.status(200).json({
            success: true,
            data: disaster
        });
    } catch (error) {
        next(error);
    }
}

/**
 * POST /api/disasters
 * Creates a disaster record.
 */
async function createDisaster(req, res, next) {
    try {
        const {
            name,
            type,
            region,
            description,
            severity,
            status,
            isSimulation,
            startTime,
            endTime,
            metadata
        } = req.body || {};

        if (!name || !String(name).trim()) {
            return res.status(400).json({
                success: false,
                message: "Disaster name is required."
            });
        }

        if (!region || !String(region).trim()) {
            return res.status(400).json({
                success: false,
                message: "Disaster region is required."
            });
        }

        const disaster = await Disaster.create({
            name,
            type,
            region,
            description,
            severity,
            status,
            isSimulation: isSimulation !== false,
            startTime,
            endTime,
            metadata
        });

        return res.status(201).json({
            success: true,
            message: "Disaster created successfully.",
            data: disaster
        });
    } catch (error) {
        next(error);
    }
}

/**
 * PATCH /api/disasters/:id
 * Updates a disaster record.
 */
async function updateDisaster(req, res, next) {
    try {
        const allowedFields = [
            "name",
            "type",
            "region",
            "description",
            "severity",
            "status",
            "startTime",
            "endTime",
            "metadata"
        ];

        const updates = {};

        for (const field of allowedFields) {
            if (
                Object.prototype.hasOwnProperty.call(
                    req.body || {},
                    field
                )
            ) {
                updates[field] = req.body[field];
            }
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                message: "Provide at least one valid field to update."
            });
        }

        const disaster = await Disaster.findByIdAndUpdate(
            req.params.id,
            { $set: updates },
            {
                new: true,
                runValidators: true
            }
        );

        if (!disaster) {
            return res.status(404).json({
                success: false,
                message: "Disaster not found."
            });
        }

        return res.status(200).json({
            success: true,
            message: "Disaster updated successfully.",
            data: disaster
        });
    } catch (error) {
        next(error);
    }
}

/**
 * DELETE /api/disasters/:id
 * Refuses deletion while locations reference the disaster.
 */
async function deleteDisaster(req, res, next) {
    try {
        const disaster = await Disaster.findById(req.params.id);

        if (!disaster) {
            return res.status(404).json({
                success: false,
                message: "Disaster not found."
            });
        }

        const linkedLocations = await Location.countDocuments({
            disaster: disaster._id
        });

        if (linkedLocations > 0) {
            return res.status(409).json({
                success: false,
                message:
                    "This disaster has linked locations. Remove or reassign those locations first."
            });
        }

        await Disaster.deleteOne({ _id: disaster._id });

        return res.status(200).json({
            success: true,
            message: "Disaster deleted successfully."
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    getDisasters,
    getDisasterById,
    createDisaster,
    updateDisaster,
    deleteDisaster
};
