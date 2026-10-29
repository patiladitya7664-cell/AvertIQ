"use strict";

const express = require("express");
const router = express.Router();

const {
getLocations,
getLocationById,
createLocation,
updateLocation,
deleteLocation
} = require("../controllers/locationController");

// GET /api/locations
// Fetch all affected locations
router.get("/", getLocations);

// POST /api/locations
// Create a new location
router.post("/", createLocation);

// GET /api/locations/:id
// Fetch a single location
router.get("/:id", getLocationById);

// PATCH /api/locations/:id
// Update location information
router.patch("/:id", updateLocation);

// DELETE /api/locations/:id
// Delete a location
router.delete("/:id", deleteLocation);

module.exports = router;
