"use strict";

const express = require("express");
const router = express.Router();

const {
getResources,
getResourceSummary,
getResourceById,
createResource,
updateResource,
deleteResource
} = require("../controllers/resourceController");

// GET /api/resources/summary
// Get inventory summary
// IMPORTANT: Keep this route before /:id
router.get("/summary", getResourceSummary);

// GET /api/resources
// Fetch all resources
router.get("/", getResources);

// POST /api/resources
// Add a new resource
router.post("/", createResource);

// GET /api/resources/:id
// Fetch a single resource
router.get("/:id", getResourceById);

// PATCH /api/resources/:id
// Update resource information
router.patch("/:id", updateResource);

// DELETE /api/resources/:id
// Delete a resource
router.delete("/:id", deleteResource);

module.exports = router;
