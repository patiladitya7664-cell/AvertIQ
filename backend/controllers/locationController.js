"use strict";

const Location = require("../models/Location");
const Disaster = require("../models/Disaster");
const {
    calculatePriority,
    getPriorityLevel
} = require("../services/priorityService");

/**
 * GET /api/locations
 * Fetch locations with optional filters and pagination.
 */
async function getLocations(req, res, next) {
    try {
        const page = Math.max(
            1,
            Number.parseInt(req.query.page, 10) || 1
        );

        const limit = Math.min(
            100,
            Math.max(1, Number.parseInt(req.query.limit, 10) || 20)
        );

        const filter = {};

        if (req.query.disaster) {
            filter.disaster = req.query.disaster;
        }

        if (req.query.severity) {
            filter.severity = String(req.query.severity).toLowerCase();
        }

        if (req.query.status) {
            filter.status = String(req.query.status).toLowerCase();
        }

        if (req.query.region) {
            filter.region = {
                $regex: String(req.query.region).trim(),
                $options: "i"
            };
        }

        if (req.query.isAccessible === "true") {
            filter.isAccessible = true;
        } else if (req.query.isAccessible === "false") {
            filter.isAccessible = false;
        }

        const [locations, total] = await Promise.all([
            Location.find(filter)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),

            Location.countDocuments(filter)
        ]);

        const data = locations.map(location => {
            const priorityScore = calculatePriority(location);

            return {
                ...location,
                priorityScore,
                priorityLevel: getPriorityLevel(priorityScore)
            };
        });

        data.sort((a, b) => b.priorityScore - a.priorityScore);

        return res.status(200).json({
            success: true,
            data,
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
 * GET /api/locations/:id
 */
async function getLocationById(req, res, next) {
    try {
        const location = await Location.findById(req.params.id).lean();

        if (!location) {
            return res.status(404).json({
                success: false,
                message: "Location not found."
            });
        }

        const priorityScore = calculatePriority(location);

        return res.status(200).json({
            success: true,
            data: {
                ...location,
                priorityScore,
                priorityLevel: getPriorityLevel(priorityScore)
            }
        });
    } catch (error) {
        next(error);
    }
}

/**
 * POST /api/locations
 */
async function createLocation(req, res, next) {
    try {
        const {
            name,
            locationCode,
            latitude,
            longitude,
            region,
            population,
            vulnerablePopulation,
            severity,
            status,
            requiredResources,
            isAccessible,
            notes,
            disaster,
            metadata
        } = req.body || {};

        if (!name || !String(name).trim()) {
            return res.status(400).json({
                success: false,
                message: "Location name is required."
            });
        }

        if (
            latitude === undefined ||
            longitude === undefined ||
            !Number.isFinite(Number(latitude)) ||
            !Number.isFinite(Number(longitude)) ||
            Number(latitude) < -90 ||
            Number(latitude) > 90 ||
            Number(longitude) < -180 ||
            Number(longitude) > 180
        ) {
            return res.status(400).json({
                success: false,
                message: "Valid latitude and longitude are required."
            });
        }

        if (disaster) {
            const disasterExists = await Disaster.exists({
                _id: disaster
            });

            if (!disasterExists) {
                return res.status(400).json({
                    success: false,
                    message: "The specified disaster does not exist."
                });
            }
        }

        const location = await Location.create({
            name,
            locationCode,
            latitude: Number(latitude),
            longitude: Number(longitude),
            region,
            population,
            vulnerablePopulation,
            severity,
            status,
            requiredResources,
            isAccessible,
            notes,
            disaster: disaster || null,
            metadata
        });

        const result = location.toObject();
        const priorityScore = calculatePriority(result);

        return res.status(201).json({
            success: true,
            message: "Location created successfully.",
            data: {
                ...result,
                priorityScore,
                priorityLevel: getPriorityLevel(priorityScore)
            }
        });
    } catch (error) {
        next(error);
    }
}

/**
 * PATCH /api/locations/:id
 */
async function updateLocation(req, res, next) {
    try {
        const allowedFields = [
            "name",
            "locationCode",
            "latitude",
            "longitude",
            "region",
            "population",
            "vulnerablePopulation",
            "severity",
            "status",
            "requiredResources",
            "isAccessible",
            "notes",
            "disaster",
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

        if (updates.disaster) {
            const disasterExists = await Disaster.exists({
                _id: updates.disaster
            });

            if (!disasterExists) {
                return res.status(400).json({
                    success: false,
                    message: "The specified disaster does not exist."
                });
            }
        }

        if (updates.disaster === "") {
            updates.disaster = null;
        }

        const location = await Location.findByIdAndUpdate(
            req.params.id,
            { $set: updates },
            {
                new: true,
                runValidators: true
            }
        );

        if (!location) {
            return res.status(404).json({
                success: false,
                message: "Location not found."
            });
        }

        const result = location.toObject();
        const priorityScore = calculatePriority(result);

        return res.status(200).json({
            success: true,
            message: "Location updated successfully.",
            data: {
                ...result,
                priorityScore,
                priorityLevel: getPriorityLevel(priorityScore)
            }
        });
    } catch (error) {
        next(error);
    }
}

/**
 * DELETE /api/locations/:id
 */
async function deleteLocation(req, res, next) {
    try {
        const location = await Location.findById(req.params.id);

        if (!location) {
            return res.status(404).json({
                success: false,
                message: "Location not found."
            });
        }

        await Location.deleteOne({ _id: location._id });

        return res.status(200).json({
            success: true,
            message: "Location deleted successfully."
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    getLocations,
    getLocationById,
    createLocation,
    updateLocation,
    deleteLocation
};
