"use strict";

/**
 * AVERTIQ - Location Priority Service
 *
 * Decision-support scoring for the disaster simulation prototype.
 * This is a rule-based score, not a trained AI prediction.
 */

const SEVERITY_WEIGHTS = {
    low: 10,
    medium: 30,
    high: 60,
    critical: 85
};

function toNonNegativeNumber(value, fallback = 0) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return fallback;
    }

    return Math.max(0, number);
}

function normalizeSeverity(severity) {
    const normalized = String(severity || "medium")
        .trim()
        .toLowerCase();

    return Object.prototype.hasOwnProperty.call(
        SEVERITY_WEIGHTS,
        normalized
    )
        ? normalized
        : "medium";
}

/**
 * Calculates a priority score between 0 and 100.
 *
 * Supported fields:
 * - severity
 * - population
 * - vulnerablePopulation
 * - isAccessible
 * - requiredResources
 */
function calculatePriority(location = {}) {
    const severity = normalizeSeverity(location.severity);

    const population = toNonNegativeNumber(location.population);
    const vulnerablePopulation = Math.min(
        population,
        toNonNegativeNumber(location.vulnerablePopulation)
    );

    const severityScore = SEVERITY_WEIGHTS[severity];

    // Population contribution: capped at 10 points.
    const populationScore = Math.min(
        10,
        (population / 10000) * 10
    );

    // Vulnerability contribution: capped at 5 points.
    const vulnerabilityScore = population > 0
        ? Math.min(
            5,
            (vulnerablePopulation / population) * 5
        )
        : 0;

    // Resource shortage contributes up to 5 points.
    const requiredResources = location.requiredResources || {};

    const totalDemand = Object.values(requiredResources)
        .reduce((total, value) => {
            return total + toNonNegativeNumber(value);
        }, 0);

    const resourceNeedScore = totalDemand > 0 ? 5 : 0;

    // Inaccessible locations receive additional attention.
    const accessibilityScore = location.isAccessible === false
        ? 10
        : 0;

    const score = Math.round(
        severityScore +
        populationScore +
        vulnerabilityScore +
        resourceNeedScore +
        accessibilityScore
    );

    return Math.min(100, Math.max(0, score));
}

/**
 * Converts a numeric priority score into a label.
 */
function getPriorityLevel(score) {
    const value = toNonNegativeNumber(score);

    if (value >= 75) return "critical";
    if (value >= 50) return "high";
    if (value >= 25) return "medium";

    return "low";
}

/**
 * Calculates the score and label for one location.
 */
function evaluateLocation(location = {}) {
    const score = calculatePriority(location);

    return {
        score,
        level: getPriorityLevel(score)
    };
}

/**
 * Returns locations ordered from highest to lowest priority.
 * Original location objects are not modified.
 */
function rankLocations(locations = []) {
    if (!Array.isArray(locations)) {
        throw new TypeError("locations must be an array.");
    }

    return locations
        .map((location, index) => {
            const priority = evaluateLocation(location);

            return {
                ...location,
                priorityScore: priority.score,
                priorityLevel: priority.level,
                _originalIndex: index
            };
        })
        .sort((a, b) => {
            return (
                b.priorityScore - a.priorityScore ||
                a._originalIndex - b._originalIndex
            );
        })
        .map(({ _originalIndex, ...location }) => location);
}

module.exports = {
    SEVERITY_WEIGHTS,
    calculatePriority,
    getPriorityLevel,
    evaluateLocation,
    rankLocations
};
