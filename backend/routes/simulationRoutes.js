"use strict";

const express = require("express");
const router = express.Router();

const {
runSimulation,
compareSimulationScenarios,
getSimulationHealth
} = require("../controllers/simulationController");

// GET /api/simulations/health
// Check simulation service status
router.get("/health", getSimulationHealth);

// POST /api/simulations/run
// Run a disaster impact simulation
router.post("/run", runSimulation);

// POST /api/simulations/compare
// Compare baseline and alternative scenarios
router.post("/compare", compareSimulationScenarios);

module.exports = router;
