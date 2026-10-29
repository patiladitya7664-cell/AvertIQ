"use strict";

const express = require("express");
const router = express.Router();

const {
getAllocations,
getAllocationById,
recommendAllocations,
createAllocation,
updateAllocationStatus
} = require("../controllers/allocationController");

// GET /api/allocations
// Fetch all allocations
router.get("/", getAllocations);

// POST /api/allocations/recommend
// Generate resource allocation recommendations
router.post("/recommend", recommendAllocations);

// POST /api/allocations
// Create a resource allocation
router.post("/", createAllocation);

// PATCH /api/allocations/:id/status
// Update allocation status
router.patch("/:id/status", updateAllocationStatus);

// GET /api/allocations/:id
// Fetch a single allocation
router.get("/:id", getAllocationById);

module.exports = router;
