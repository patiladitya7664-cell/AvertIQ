"use strict";

const Allocation = require("../models/Allocation");
const Location = require("../models/Location");
const Resource = require("../models/Resource");
const Disaster = require("../models/Disaster");

const {
    generateAllocationRecommendations
} = require("../services/allocationService");

/**
 * GET /api/allocations
 * Fetch allocation records with optional filters.
 */
async function getAllocations(req, res, next) {
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

        if (req.query.status) {
            filter.status = String(req.query.status).toLowerCase();
        }

        if (req.query.disaster) {
            filter.disaster = req.query.disaster;
        }

        if (req.query.location) {
            filter.location = req.query.location;
        }

        if (req.query.resource) {
            filter.resource = req.query.resource;
        }

        const [allocations, total] = await Promise.all([
            Allocation.find(filter)
                .populate("location", "name locationCode severity")
                .populate("resource", "name category unit hubName hubCode")
                .populate("disaster", "name type region")
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),

            Allocation.countDocuments(filter)
        ]);

        return res.status(200).json({
            success: true,
            data: allocations,
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
 * POST /api/allocations/recommend
 * Generate recommendations using current database records.
 *
 * This endpoint does not save recommendations automatically.
 */
async function recommendAllocations(req, res, next) {
    try {
        const { disasterId } = req.body || {};

        const disasterFilter = disasterId
            ? { disaster: disasterId }
            : {};

        const [locations, resources] = await Promise.all([
            Location.find(disasterFilter).lean(),
            Resource.find({}).lean()
        ]);

        const locationIds = new Set(
            locations.map(location => String(location._id))
        );

        const roads = Array.isArray(req.body?.roads)
            ? req.body.roads
            : [];

        /*
         * Resource records must have hub coordinates and roads must
         * connect hub codes/names to location codes/IDs/names.
         * The API accepts the simulated road graph in the request.
         */
        const result = generateAllocationRecommendations(
            {
                locations,
                resources,
                roads
            },
            {
                directed: req.body?.directed === true,
                speedKmPerHour: req.body?.speedKmPerHour || 30
            }
        );

        return res.status(200).json({
            ...result,
            message: "Allocation recommendations generated.",
            locationsEvaluated: locationIds.size
        });
    } catch (error) {
        next(error);
    }
}

/**
 * POST /api/allocations
 * Create an allocation record.
 *
 * This records the allocation but does not atomically reserve
 * stock. A transactional inventory workflow is needed for that.
 */
async function createAllocation(req, res, next) {
    try {
        const {
            location,
            resource,
            quantity,
            disaster,
            sourceHub,
            sourceHubCode,
            priorityScore,
            routeDistanceKm,
            estimatedTravelMinutes,
            status,
            notes,
            isSimulation
        } = req.body || {};

        if (!location || !resource) {
            return res.status(400).json({
                success: false,
                message: "Location and resource are required."
            });
        }

        const requestedQuantity = Number(quantity);

        if (
            !Number.isFinite(requestedQuantity) ||
            requestedQuantity <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Quantity must be a positive number."
            });
        }

        const [locationRecord, resourceRecord] = await Promise.all([
            Location.findById(location),
            Resource.findById(resource)
        ]);

        if (!locationRecord) {
            return res.status(404).json({
                success: false,
                message: "Target location not found."
            });
        }

        if (!resourceRecord) {
            return res.status(404).json({
                success: false,
                message: "Resource record not found."
            });
        }

        if (disaster) {
            const disasterExists = await Disaster.exists({
                _id: disaster
            });

            if (!disasterExists) {
                return res.status(400).json({
                    success: false,
                    message: "Specified disaster not found."
                });
            }
        }

        const availableQuantity = Math.max(
            0,
            Number(resourceRecord.quantity || 0) -
            Number(resourceRecord.reservedQuantity || 0)
        );

        if (requestedQuantity > availableQuantity) {
            return res.status(409).json({
                success: false,
                message: "Requested quantity exceeds available stock.",
                availableQuantity
            });
        }

        const allocation = await Allocation.create({
            location: locationRecord._id,
            resource: resourceRecord._id,
            quantity: requestedQuantity,
            disaster: disaster || locationRecord.disaster || null,
            sourceHub: sourceHub || resourceRecord.hubName || "",
            sourceHubCode: sourceHubCode || resourceRecord.hubCode || "",
            priorityScore: priorityScore ?? 0,
            routeDistanceKm: routeDistanceKm ?? 0,
            estimatedTravelMinutes: estimatedTravelMinutes ?? 0,
            status: status || "recommended",
            notes: notes || "",
            isSimulation: isSimulation !== false
        });

        return res.status(201).json({
            success: true,
            message: "Allocation record created successfully.",
            data: allocation
        });
    } catch (error) {
        next(error);
    }
}

/**
 * PATCH /api/allocations/:id/status
 * Update an allocation status.
 */
async function updateAllocationStatus(req, res, next) {
    try {
        const allowedStatuses = [
            "recommended",
            "pending",
            "approved",
            "dispatched",
            "delivered",
            "cancelled"
        ];

        const status = String(req.body?.status || "").toLowerCase();

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid allocation status."
            });
        }

        const allocation = await Allocation.findById(req.params.id);

        if (!allocation) {
            return res.status(404).json({
                success: false,
                message: "Allocation not found."
            });
        }

        allocation.status = status;

        if (status === "approved" && !allocation.allocatedAt) {
            allocation.allocatedAt = new Date();
        }

        if (status === "dispatched" && !allocation.dispatchedAt) {
            allocation.dispatchedAt = new Date();
        }

        if (status === "delivered" && !allocation.deliveredAt) {
            allocation.deliveredAt = new Date();
        }

        await allocation.save();

        return res.status(200).json({
            success: true,
            message: "Allocation status updated.",
            data: allocation
        });
    } catch (error) {
        next(error);
    }
}

/**
 * GET /api/allocations/:id
 */
async function getAllocationById(req, res, next) {
    try {
        const allocation = await Allocation.findById(req.params.id)
            .populate("location", "name locationCode severity")
            .populate("resource", "name category unit hubName hubCode")
            .populate("disaster", "name type region")
            .lean();

        if (!allocation) {
            return res.status(404).json({
                success: false,
                message: "Allocation not found."
            });
        }

        return res.status(200).json({
            success: true,
            data: allocation
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    getAllocations,
    getAllocationById,
    recommendAllocations,
    createAllocation,
    updateAllocationStatus
};
