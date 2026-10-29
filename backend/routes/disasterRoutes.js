"use strict";

const express = require("express");
const router = express.Router();

const {
getDisasters,
getDisasterById,
createDisaster,
updateDisaster,
deleteDisaster
} = require("../controllers/disasterController");

// GET /api/disasters
// Fetch all disasters
router.get("/", getDisasters);

// POST /api/disasters
// Create a new disaster
router.post("/", createDisaster);

// GET /api/disasters/:id
// Fetch a single disaster
router.get("/:id", getDisasterById);

// PATCH /api/disasters/:id
// Update a disaster
router.patch("/:id", updateDisaster);

// DELETE /api/disasters/:id
// Delete a disaster
router.delete("/:id", deleteDisaster);

module.exports = router;
