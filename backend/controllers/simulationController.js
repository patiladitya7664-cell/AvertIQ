"use strict";

const Location = require("../models/Location");
const Resource = require("../models/Resource");
const Disaster = require("../models/Disaster");

const {
    evaluateScenario,
    compareScenarios
} = require("../services/simulationService");

function validateArray(value, name) {
    if (!Array.isArray(value)) {
        const error = new Error(`${name} must be an array.`);
        error.statusCode = 400;
        throw error;
    }
}

/**
 * POST /api/simulations/run
 *
 * Runs a simulation using database locations/resources
 * and a road network supplied in the request body.
 */
async function runSimulation(req, res, next) {
    try {
        const {
            disasterId,
            roads = [],
            directed = false,
            speedKmPerHour = 30
        } = req.body || {};

        validateArray(roads, "roads");

        if (
            !Number.isFinite(Number(speedKmPerHour)) ||
            Number(speedKmPerHour) <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "speedKmPerHour must be a positive number."
            });
        }

        let disaster = null;

        if (disasterId) {
            disaster = await Disaster.findById(disasterId).lean();

            if (!disaster) {
                return res.status(404).json({
                    success: false,
                    message: "Disaster not found."
                });
            }
        }

        const locationFilter = disasterId
            ? { disaster: disasterId }
            : {};

        const [locations, resources] = await Promise.all([
            Location.find(locationFilter).lean(),
            Resource.find({}).lean()
        ]);

        const result = evaluateScenario(
            {
                locations,
                resources,
                roads
            },
            {
                directed: directed === true,
                speedKmPerHour: Number(speedKmPerHour)
            }
        );

        return res.status(200).json({
            success: true,
            message: "Simulation completed successfully.",
            disaster: disaster
                ? {
                    id: disaster._id,
                    name: disaster.name,
                    type: disaster.type,
                    severity: disaster.severity
                }
                : null,
            result
        });
    } catch (error) {
        next(error);
    }
}

/**
 * POST /api/simulations/compare
 *
 * Compares baseline and alternative simulated scenarios.
 *
 * Expected request body:
 * {
 *   "baseline": {
 *     "locations": [],
 *     "resources": [],
 *     "roads": []
 *   },
 *   "alternative": {
 *     "locations": [],
 *     "resources": [],
 *     "roads": []
 *   }
 * }
 */
async function compareSimulationScenarios(req, res, next) {
    try {
        const { baseline, alternative, options = {} } = req.body || {};

        if (
            !baseline ||
            typeof baseline !== "object" ||
            !alternative ||
            typeof alternative !== "object"
        ) {
            return res.status(400).json({
                success: false,
                message: "Baseline and alternative scenarios are required."
            });
        }

        for (const [name, scenario] of [
            ["baseline", baseline],
            ["alternative", alternative]
        ]) {
            validateArray(scenario.locations, `${name}.locations`);
            validateArray(scenario.resources, `${name}.resources`);
            validateArray(scenario.roads, `${name}.roads`);
        }

        const speedKmPerHour = Number(
            options.speedKmPerHour ?? 30
        );

        if (
            !Number.isFinite(speedKmPerHour) ||
            speedKmPerHour <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "speedKmPerHour must be a positive number."
            });
        }

        const result = compareScenarios(
            baseline,
            alternative,
            {
                directed: options.directed === true,
                speedKmPerHour
            }
        );

        return res.status(200).json({
            success: true,
            message: "Scenario comparison completed.",
            result
        });
    } catch (error) {
        next(error);
    }
}

/**
 * GET /api/simulations/health
 */
async function getSimulationHealth(req, res) {
    return res.status(200).json({
        success: true,
        service: "AVERTIQ Simulation Service",
        mode: "simulation",
        message:
            "Simulation service is available. Results depend on supplied scenario data."
    });
}

module.exports = {
    runSimulation,
    compareSimulationScenarios,
    getSimulationHealth
};
