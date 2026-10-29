"use strict";

const {
    calculatePriority,
    getPriorityLevel,
    rankLocations
} = require("./priorityService");

const {
    findShortestPath
} = require("./routingService");

function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
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
        ""
    );
}

function normalizeCategory(value) {
    const key = String(value || "")
        .toLowerCase()
        .replace(/[\s_-]/g, "");

    const aliases = {
        foods: "food",
        food: "food",
        water: "water",
        medical: "medical",
        medicalkits: "medical",
        medicine: "medical",
        shelter: "shelter",
        shelters: "shelter"
    };

    return aliases[key] || key;
}

function getDemand(location) {
    const demand = new Map();

    for (const [key, value] of Object.entries(
        location.requiredResources || {}
    )) {
        const category = normalizeCategory(key);
        demand.set(
            category,
            (demand.get(category) || 0) +
                Math.max(0, toNumber(value))
        );
    }

    return demand;
}

function getInventory(resources) {
    const inventory = new Map();

    for (const resource of resources) {
        const hubId = getHubId(resource);
        const category = normalizeCategory(resource.category);

        if (!hubId || !category) {
            continue;
        }

        const quantity = Math.max(
            0,
            toNumber(resource.quantity) -
                Math.max(0, toNumber(resource.reservedQuantity))
        );

        const key = `${hubId}::${category}`;

        inventory.set(
            key,
            (inventory.get(key) || 0) + quantity
        );
    }

    return inventory;
}

function getHubs(resources) {
    const hubs = new Map();

    for (const resource of resources) {
        const id = getHubId(resource);

        if (!id || hubs.has(id)) {
            continue;
        }

        const latitude = Number(resource.latitude);
        const longitude = Number(resource.longitude);

        if (
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude)
        ) {
            continue;
        }

        hubs.set(id, {
            id,
            name: resource.hubName || id,
            latitude,
            longitude
        });
    }

    return [...hubs.values()];
}

function evaluateScenario({
    locations = [],
    resources = [],
    roads = []
} = {}, options = {}) {
    if (!Array.isArray(locations)) {
        throw new TypeError("locations must be an array.");
    }

    if (!Array.isArray(resources)) {
        throw new TypeError("resources must be an array.");
    }

    if (!Array.isArray(roads)) {
        throw new TypeError("roads must be an array.");
    }

    const rankedLocations = rankLocations(locations);
    const hubs = getHubs(resources);
    const inventory = getInventory(resources);
    const speedKmPerHour = Math.max(
        1,
        toNumber(options.speedKmPerHour, 30)
    );

    const locationResults = [];
    const unreachable = [];
    const shortages = [];

    let totalDemand = 0;
    let totalAllocated = 0;
    let reachableCount = 0;

    for (const location of rankedLocations) {
        const locationId = getLocationId(location);
        const priorityScore = calculatePriority(location);
        const priorityLevel = getPriorityLevel(priorityScore);
        const demands = getDemand(location);

        const routes = location.isAccessible === false
            ? []
            : hubs.map(hub => ({
                hub,
                route: findShortestPath(
                    roads,
                    hub.id,
                    locationId,
                    { directed: options.directed === true }
                )
            }))
                .filter(item => item.route.found)
                .sort((a, b) => a.route.distance - b.route.distance);

        const bestRoute = routes[0] || null;

        if (bestRoute) {
            reachableCount++;
        } else if (demands.size > 0) {
            unreachable.push({
                locationId,
                locationName: location.name || locationId,
                reason: location.isAccessible === false
                    ? "Location is marked inaccessible."
                    : "No route from a configured resource hub."
            });
        }

        const resourceResults = [];
        let locationDemand = 0;
        let locationAllocated = 0;

        for (const [category, demand] of demands.entries()) {
            if (demand <= 0) {
                continue;
            }

            locationDemand += demand;
            totalDemand += demand;

            let allocated = 0;
            let sourceHub = null;
            let distance = null;

            // For this simulation, resources are allocated from
            // the nearest reachable hub with stock.
            for (const candidate of routes) {
                const key = `${candidate.hub.id}::${category}`;
                const available = inventory.get(key) || 0;

                if (available <= 0) {
                    continue;
                }

                allocated = Math.min(demand, available);
                inventory.set(key, available - allocated);

                sourceHub = candidate.hub.name;
                distance = candidate.route.distance;

                break;
            }

            const unmet = Math.max(0, demand - allocated);

            locationAllocated += allocated;
            totalAllocated += allocated;

            resourceResults.push({
                category,
                required: demand,
                allocated,
                unmet
            });

            if (unmet > 0) {
                shortages.push({
                    locationId,
                    locationName: location.name || locationId,
                    category,
                    required: demand,
                    allocated,
                    unmet
                });
            }

            // Store selected hub and distance for this resource.
            resourceResults[resourceResults.length - 1].sourceHub =
                sourceHub;
            resourceResults[resourceResults.length - 1].distanceKm =
                distance;
            resourceResults[resourceResults.length - 1].estimatedTravelMinutes =
                distance === null
                    ? null
                    : Math.round((distance / speedKmPerHour) * 60);
        }

        locationResults.push({
            locationId,
            locationName: location.name || locationId,
            severity: location.severity || "medium",
            priorityScore,
            priorityLevel,
            population: Math.max(0, toNumber(location.population)),
            reachable: Boolean(bestRoute),
            nearestHub: bestRoute ? bestRoute.hub.name : null,
            shortestDistanceKm: bestRoute
                ? bestRoute.route.distance
                : null,
            requiredResources: resourceResults,
            totalDemand: locationDemand,
            totalAllocated: locationAllocated,
            unmetDemand: Math.max(
                0,
                locationDemand - locationAllocated
            )
        });
    }

    const remainingInventory = [...inventory.entries()].map(
        ([key, quantity]) => {
            const [hubCode, category] = key.split("::");

            return {
                hubCode,
                category,
                quantity
            };
        }
    );

    return {
        success: true,
        mode: "simulation",
        generatedAt: new Date().toISOString(),
        summary: {
            locationsEvaluated: rankedLocations.length,
            hubsAvailable: hubs.length,
            reachableLocations: reachableCount,
            unreachableLocations: unreachable.length,
            totalDemand,
            totalAllocated,
            totalUnmetDemand: Math.max(
                0,
                totalDemand - totalAllocated
            ),
            fulfillmentPercentage: totalDemand > 0
                ? Math.round((totalAllocated / totalDemand) * 100)
                : 100,
            shortages: shortages.length
        },
        locations: locationResults,
        unreachable,
        shortages,
        remainingInventory
    };
}

function compareScenarios(baseline, alternative, options = {}) {
    const baselineResult = evaluateScenario(baseline, options);
    const alternativeResult = evaluateScenario(alternative, options);

    const baselineSummary = baselineResult.summary;
    const alternativeSummary = alternativeResult.summary;

    return {
        success: true,
        mode: "simulation-comparison",
        baseline: baselineSummary,
        alternative: alternativeSummary,
        changes: {
            reachableLocations:
                alternativeSummary.reachableLocations -
                baselineSummary.reachableLocations,

            totalAllocated:
                alternativeSummary.totalAllocated -
                baselineSummary.totalAllocated,

            totalUnmetDemand:
                alternativeSummary.totalUnmetDemand -
                baselineSummary.totalUnmetDemand,

            fulfillmentPercentage:
                alternativeSummary.fulfillmentPercentage -
                baselineSummary.fulfillmentPercentage
        },
        baselineResult,
        alternativeResult
    };
}

module.exports = {
    evaluateScenario,
    compareScenarios
};
