"use strict";

const Resource = require("../models/Resource");

function getAvailableQuantity(resource) {
    return Math.max(
        0,
        Number(resource.quantity || 0) -
        Number(resource.reservedQuantity || 0)
    );
}

function getStockStatus(resource) {
    const available = getAvailableQuantity(resource);
    const minimum = Math.max(0, Number(resource.minimumStock || 0));

    if (available <= 0) {
        return "depleted";
    }

    if (available <= minimum) {
        return "low_stock";
    }

    return "available";
}

/**
 * GET /api/resources
 * Supports category, status, hubCode and search filters.
 */
async function getResources(req, res, next) {
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

        if (req.query.category) {
            filter.category = String(req.query.category).toLowerCase();
        }

        if (req.query.hubCode) {
            filter.hubCode = String(req.query.hubCode).toUpperCase();
        }

        if (req.query.status) {
            filter.status = String(req.query.status).toLowerCase();
        }

        if (req.query.search) {
            const search = String(req.query.search).trim();

            if (search) {
                filter.$or = [
                    { name: { $regex: search, $options: "i" } },
                    { resourceCode: { $regex: search, $options: "i" } },
                    { hubName: { $regex: search, $options: "i" } },
                    { hubCode: { $regex: search, $options: "i" } }
                ];
            }
        }

        const [resources, total] = await Promise.all([
            Resource.find(filter)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),

            Resource.countDocuments(filter)
        ]);

        const data = resources.map(resource => ({
            ...resource,
            availableQuantity: getAvailableQuantity(resource),
            calculatedStatus: getStockStatus(resource)
        }));

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
 * GET /api/resources/summary
 * Inventory totals grouped by category.
 */
async function getResourceSummary(req, res, next) {
    try {
        const resources = await Resource.find({}).lean();

        const summary = {
            totalResourceRecords: resources.length,
            totalQuantity: 0,
            totalReserved: 0,
            totalAvailable: 0,
            lowStockRecords: 0,
            depletedRecords: 0,
            categories: {}
        };

        for (const resource of resources) {
            const quantity = Math.max(0, Number(resource.quantity || 0));
            const reserved = Math.max(
                0,
                Number(resource.reservedQuantity || 0)
            );
            const available = getAvailableQuantity(resource);
            const category = resource.category || "other";
            const status = getStockStatus(resource);

            summary.totalQuantity += quantity;
            summary.totalReserved += Math.min(reserved, quantity);
            summary.totalAvailable += available;

            if (status === "low_stock") {
                summary.lowStockRecords++;
            }

            if (status === "depleted") {
                summary.depletedRecords++;
            }

            if (!summary.categories[category]) {
                summary.categories[category] = {
                    records: 0,
                    quantity: 0,
                    reserved: 0,
                    available: 0
                };
            }

            summary.categories[category].records++;
            summary.categories[category].quantity += quantity;
            summary.categories[category].reserved += Math.min(
                reserved,
                quantity
            );
            summary.categories[category].available += available;
        }

        return res.status(200).json({
            success: true,
            data: summary
        });
    } catch (error) {
        next(error);
    }
}

/**
 * GET /api/resources/:id
 */
async function getResourceById(req, res, next) {
    try {
        const resource = await Resource.findById(req.params.id).lean();

        if (!resource) {
            return res.status(404).json({
                success: false,
                message: "Resource not found."
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                ...resource,
                availableQuantity: getAvailableQuantity(resource),
                calculatedStatus: getStockStatus(resource)
            }
        });
    } catch (error) {
        next(error);
    }
}

/**
 * POST /api/resources
 */
async function createResource(req, res, next) {
    try {
        const {
            name,
            resourceCode,
            category,
            unit,
            quantity,
            reservedQuantity,
            minimumStock,
            hubName,
            hubCode,
            latitude,
            longitude,
            notes,
            metadata
        } = req.body || {};

        if (!name || !String(name).trim()) {
            return res.status(400).json({
                success: false,
                message: "Resource name is required."
            });
        }

        if (!category) {
            return res.status(400).json({
                success: false,
                message: "Resource category is required."
            });
        }

        const total = Number(quantity ?? 0);
        const reserved = Number(reservedQuantity ?? 0);

        if (
            !Number.isFinite(total) ||
            total < 0 ||
            !Number.isFinite(reserved) ||
            reserved < 0 ||
            reserved > total
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Quantity must be non-negative, and reserved quantity cannot exceed total quantity."
            });
        }

        const resource = await Resource.create({
            name,
            resourceCode,
            category,
            unit,
            quantity: total,
            reservedQuantity: reserved,
            minimumStock,
            hubName,
            hubCode,
            latitude,
            longitude,
            notes,
            metadata
        });

        return res.status(201).json({
            success: true,
            message: "Resource created successfully.",
            data: {
                ...resource.toObject(),
                availableQuantity: getAvailableQuantity(resource),
                calculatedStatus: getStockStatus(resource)
            }
        });
    } catch (error) {
        next(error);
    }
}

/**
 * PATCH /api/resources/:id
 */
async function updateResource(req, res, next) {
    try {
        const allowedFields = [
            "name",
            "resourceCode",
            "category",
            "unit",
            "quantity",
            "reservedQuantity",
            "minimumStock",
            "hubName",
            "hubCode",
            "latitude",
            "longitude",
            "notes",
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

        const existing = await Resource.findById(req.params.id);

        if (!existing) {
            return res.status(404).json({
                success: false,
                message: "Resource not found."
            });
        }

        const nextQuantity = Number(
            updates.quantity ?? existing.quantity
        );

        const nextReserved = Number(
            updates.reservedQuantity ?? existing.reservedQuantity
        );

        if (
            !Number.isFinite(nextQuantity) ||
            nextQuantity < 0 ||
            !Number.isFinite(nextReserved) ||
            nextReserved < 0 ||
            nextReserved > nextQuantity
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Quantity must be non-negative, and reserved quantity cannot exceed total quantity."
            });
        }

        Object.assign(existing, updates);

        await existing.save();

        return res.status(200).json({
            success: true,
            message: "Resource updated successfully.",
            data: {
                ...existing.toObject(),
                availableQuantity: getAvailableQuantity(existing),
                calculatedStatus: getStockStatus(existing)
            }
        });
    } catch (error) {
        next(error);
    }
}

/**
 * DELETE /api/resources/:id
 */
async function deleteResource(req, res, next) {
    try {
        const resource = await Resource.findById(req.params.id);

        if (!resource) {
            return res.status(404).json({
                success: false,
                message: "Resource not found."
            });
        }

        if (Number(resource.reservedQuantity || 0) > 0) {
            return res.status(409).json({
                success: false,
                message:
                    "This resource has reserved stock. Release the reservation before deleting it."
            });
        }

        await Resource.deleteOne({ _id: resource._id });

        return res.status(200).json({
            success: true,
            message: "Resource deleted successfully."
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    getResources,
    getResourceSummary,
    getResourceById,
    createResource,
    updateResource,
    deleteResource
};
