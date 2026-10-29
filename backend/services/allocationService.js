"use strict";

const {
    calculatePriority,
    getPriorityLevel,
    rankLocations
} = require("./priorityService");

const {
    findShortestPath
} = require("./routingService");

const RESOURCE_ALIASES = {
    food: ["food", "foods"],
    water: ["water"],
    medical: ["medical", "medicalkits", "medical_kits", "medicine"],
    shelter: ["shelter", "shelters"]
};

function toNumber(value, fallback = 0) {
    const number = Number(value);

    return Number.isFinite(number) ? number : fallback;
}

function normalizeKey(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[\s-]/g, "_");
}

function normalizeResourceCategory(value) {
    const key = normalizeKey(value);

    for (const [category, aliases] of Object.entries(RESOURCE_ALIASES)) {
        if (
            aliases.includes(key) ||
            aliases.includes(key.replace(/_/g, ""))
        ) {
            return category;
        }
    }

    return key;
}

function getLocationId(location) {
    return String(
        location.locationCode ||
        location.id ||
        location._id ||
        location.name ||
        ""
    );
}

function getHubId(resource) {
    return String(
        resource.hubCode ||
        resource.hubName ||
        resource.sourceHub ||
        ""
    );
}

function getDemand(location, category) {
    const required = location.requiredResources || {};
    const normalizedRequired = {};

    for (const [key, value] of Object.entries(required)) {
        normalizedRequired[normalizeResourceCategory(key)] =
            Math.max(0, toNumber(value));
    }

    return Math.max(0, toNumber(normalizedRequired[category]));
}

function getAvailableQuantity(resource) {
    const quantity = Math.max(0, toNumber(resource.quantity));
    const reserved = Math.max(0, toNumber(resource.reservedQuantity));

    return Math.max(0, quantity - reserved);
}

function getHubCoordinates(resources) {
    const hubs = new Map();

    for (const resource of resources) {
        const hubId = getHubId(resource);

        if (!hubId || hubs.has(hubId)) {
            continue;
        }

        if (
            !Number.isFinite(Number(resource.latitude)) ||
            !Number.isFinite(Number(resource.longitude))
        ) {
            continue;
        }

        hubs.set(hubId, {
            id: hubId,
            name: resource.hubName || hubId,
            latitude: Number(resource.latitude),
            longitude: Number(resource.longitude)
        });
    }

    return [...hubs.values()];
}

function getResourceStock(resources) {
    const stock = new Map();

    for (const resource of resources) {
        const category = normalizeResourceCategory(resource.category);
        const hubId = getHubId(resource);

        if (!hubId || !category) {
            continue;
        }

        const key = `${hubId}::${category}`;

        stock.set(
            key,
            (stock.get(key) || 0) + getAvailableQuantity(resource)
        );
    }

    return stock;
}

function findNearestHub({
    location,
    hubs,
    roads,
    options = {}
}) {
    const destination = getLocationId(location);

    const candidates = [];

    for (const hub of hubs) {
        const route = findShortestPath(
            roads,
            hub.id,
            destination,
            options
        );

        if (!route.found) {
            continue;
        }

        candidates.push({
            hub,
            distance: route.distance,
            path: route.path,
            roadIds: route.roadIds
        });
    }

    candidates.sort((a, b) => a.distance - b.distance);

    return candidates[0] || null;
}

/**
 * Generate allocation recommendations from supplied data.
 *
 * Inputs:
 * locations: affected locations
 * resources: resource inventory records
 * roads: simulated road network
 *
 * Options:
 * directed: whether roads are one-way
 * speedKmPerHour: estimated travel speed
 *
 * This function generates recommendations only.
 * It does not save records or modify the database.
 */
function generateAllocationRecommendations(
    {
        locations = [],
        resources = [],
        roads = []
    } = {},
    options = {}
) {
    if (!Array.isArray(locations)) {
        throw new TypeError("locations must be an array.");
    }

    if (!Array.isArray(resources)) {
        throw new TypeError("resources must be an array.");
    }

    if (!Array.isArray(roads)) {
        throw new TypeError("roads must be an array.");
    }

    const speed = Math.max(
        1,
        toNumber(options.speedKmPerHour, 30)
    );

    const rankedLocations = rankLocations(locations);
    const hubs = getHubCoordinates(resources);
    const stock = getResourceStock(resources);

    const recommendations = [];
    const shortages = [];
    const unreachableLocations = [];
    const remainingDemand = {};

    for (const location of rankedLocations) {
        const locationId = getLocationId(location);
        const priorityScore = calculatePriority(location);
        const priorityLevel = getPriorityLevel(priorityScore);

        const categories = new Set(
            Object.keys(location.requiredResources || {})
                .map(normalizeResourceCategory)
        );

        for (const category of categories) {
            const demand = getDemand(location, category);

            if (demand <= 0) {
                continue;
            }

            const demandKey = `${locationId}::${category}`;

            remainingDemand[demandKey] = demand;

            const availableHubs = hubs
                .filter(hub => {
                    const key = `${hub.id}::${category}`;
                    return (stock.get(key) || 0) > 0;
                })
                .map(hub => {
                    const route = findShortestPath(
                        roads,
                        hub.id,
                        locationId,
                        { directed: options.directed === true }
                    );

                    return {
                        hub,
                        route
                    };
                })
                .filter(item => item.route.found)
                .sort((a, b) =>
                    a.route.distance - b.route.distance
                );

            if (availableHubs.length === 0) {
                shortages.push({
                    locationId,
                    locationName: location.name || locationId,
                    resourceCategory: category,
                    requiredQuantity: demand,
                    allocatedQuantity: 0,
                    unmetQuantity: demand,
                    reason: hubs.length === 0
                        ? "No resource hub with coordinates is available."
                        : "No reachable hub has available stock."
                });

                if (!unreachableLocations.some(
                    item => item.locationId === locationId
                )) {
                    unreachableLocations.push({
                        locationId,
                        locationName: location.name || locationId,
                        reason: "No reachable hub has available resources."
                    });
                }

                continue;
            }

            const selected = availableHubs[0];
            const hubId = selected.hub.id;
            const stockKey = `${hubId}::${category}`;
            const available = stock.get(stockKey) || 0;
            const allocated = Math.min(demand, available);
            const unmet = Math.max(0, demand - allocated);

            stock.set(stockKey, available - allocated);

            recommendations.push({
                locationId,
                locationName: location.name || locationId,
                resourceCategory: category,
                priorityScore,
                priorityLevel,
                sourceHub: selected.hub.name,
                sourceHubCode: hubId,
                requiredQuantity: demand,
                allocatedQuantity: allocated,
                unmetQuantity: unmet,
                routeDistanceKm: selected.route.distance,
                estimatedTravelMinutes: Math.round(
                    (selected.route.distance / speed) * 60
                ),
                route: selected.route.path,
                roadIds: selected.route.roadIds,
                status: unmet > 0 ? "partial" : "recommended",
                isSimulation: true
            });

            if (unmet > 0) {
                shortages.push({
                    locationId,
                    locationName: location.name || locationId,
                    resourceCategory: category,
                    requiredQuantity: demand,
                    allocatedQuantity: allocated,
                    unmetQuantity: unmet,
                    reason: "Available inventory is insufficient."
                });
            }
        }
    }

    const totalDemand = recommendations.reduce(
        (sum, item) => sum + item.requiredQuantity,
        0
    ) + shortages.reduce(
        (sum, item) => {
            const wasRecommended = recommendations.some(
                recommendation =>
                    recommendation.locationId === item.locationId &&
                    recommendation.resourceCategory === item.resourceCategory
            );

            return sum + (wasRecommended ? 0 : item.requiredQuantity);
        },
        0
    );

    const totalAllocated = recommendations.reduce(
        (sum, item) => sum + item.allocatedQuantity,
        0
    );

    return {
        success: true,
        mode: "simulation",
        summary: {
            locationsEvaluated: rankedLocations.length,
            hubsAvailable: hubs.length,
            recommendationsGenerated: recommendations.length,
            totalDemand,
            totalAllocated,
            totalUnmetDemand: Math.max(0, totalDemand - totalAllocated),
            shortages: shortages.length,
            unreachableLocations: unreachableLocations.length
        },
        recommendations,
        shortages,
        unreachableLocations,
        remainingInventory: [...stock.entries()].map(
            ([key, quantity]) => {
                const [hubCode, resourceCategory] = key.split("::");

                return {
                    hubCode,
                    resourceCategory,
                    quantityRemaining: quantity
                };
            }
        )
    };
}

module.exports = {
    normalizeResourceCategory,
    getDemand,
    getAvailableQuantity,
    getHubCoordinates,
    findNearestHub,
    generateAllocationRecommendations
};
