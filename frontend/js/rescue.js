"use strict";

/* =========================================================
   AVERTIQ — RESCUE OPERATIONS
   File: frontend/js/rescue.js

   Demonstration data only.
   No real emergency dispatch or live tracking.
========================================================= */

document.addEventListener("DOMContentLoaded", initializeRescueOperations);

const RESCUE_SCENARIO_URL = "../assets/data/disaster-scenario.json";

let rescueScenario = null;
let rescueTeams = [];
let selectedTeamId = null;

/* =========================================================
   INITIALIZE
========================================================= */

async function initializeRescueOperations() {
    bindRescueEvents();
    await loadRescueScenario();
}

function bindRescueEvents() {
    const searchInput = document.getElementById("teamSearch");
    const statusFilter = document.getElementById("teamStatusFilter");
    const refreshButton = document.getElementById("refreshOperations");
    const refreshTeamButton = document.getElementById("refreshTeamData");
    const teamsTable = document.getElementById("rescueTeamsBody");

    if (searchInput) {
        searchInput.addEventListener("input", renderRescueTeams);
    }

    if (statusFilter) {
        statusFilter.addEventListener("change", renderRescueTeams);
    }

    if (refreshButton) {
        refreshButton.addEventListener("click", loadRescueScenario);
    }

    if (refreshTeamButton) {
        refreshTeamButton.addEventListener("click", loadRescueScenario);
    }

    if (teamsTable) {
        teamsTable.addEventListener("click", function (event) {
            const button = event.target.closest("[data-view-team]");

            if (!button) return;

            showTeamDetails(button.dataset.viewTeam);
        });
    }
}

/* =========================================================
   LOAD SCENARIO
========================================================= */

async function loadRescueScenario() {
    showRescueMessage("Loading simulated rescue operations...", "info");

    try {
        const response = await fetch(
            `${RESCUE_SCENARIO_URL}?t=${Date.now()}`
        );

        if (!response.ok) {
            throw new Error("Unable to load the scenario JSON.");
        }

        rescueScenario = await response.json();

        if (!Array.isArray(rescueScenario.hubs) ||
            !Array.isArray(rescueScenario.locations)) {
            throw new Error("Scenario is missing hubs or locations.");
        }

        rescueTeams = buildSimulatedTeams(rescueScenario);

        renderRescueKPIs();
        renderTeamReadiness();
        renderResponseOverview();
        renderRescueTeams();

        if (selectedTeamId) {
            const selectedTeam = rescueTeams.find(
                team => team.id === selectedTeamId
            );

            if (selectedTeam) {
                showTeamDetails(selectedTeamId);
            } else {
                renderEmptyTeamDetails();
            }
        } else {
            renderEmptyTeamDetails();
        }

        showRescueMessage(
            "Simulated rescue operations loaded successfully.",
            "success"
        );

    } catch (error) {
        console.error("AVERTIQ rescue operations error:", error);

        rescueTeams = [];

        renderRescueKPIs();
        renderTeamReadiness();
        renderResponseOverview();
        renderRescueTeams();
        renderEmptyTeamDetails();

        showRescueMessage(
            "Unable to load scenario data. Open this page using VS Code Live Server and check disaster-scenario.json.",
            "error"
        );
    }
}

/* =========================================================
   HELPERS
========================================================= */

function rescueEscapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, function (character) {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        };

        return entities[character];
    });
}

function rescueFormatNumber(value) {
    return Number(value || 0).toLocaleString("en-IN");
}

function rescueSetText(id, value) {
    const element = document.getElementById(id);

    if (element) {
        element.textContent = value;
    }
}

function rescueGetRoads() {
    return Array.isArray(rescueScenario?.roads)
        ? rescueScenario.roads
        : [];
}

function rescueIsRoadBlocked(road) {
    return road.blocked === true ||
        String(road.status || "").toLowerCase() === "blocked";
}

function rescueGetSeverityLabel(value) {
    const severity = Number(value);

    if (severity >= 5) return "Critical";
    if (severity >= 4) return "High";
    if (severity >= 3) return "Medium";

    return "Low";
}

function rescueGetSeverityClass(value) {
    return rescueGetSeverityLabel(value).toLowerCase();
}

/* =========================================================
   GENERATE SIMULATED TEAMS
========================================================= */

/*
   The current scenario contains hubs and locations, but may not
   contain a separate rescueTeams collection.

   Therefore this page generates clearly labelled demo teams
   from hub capacity/team counts. These are not real personnel.
*/

function buildSimulatedTeams(scenario) {
    const locations = scenario.locations || [];
    const hubs = scenario.hubs || [];

    const sortedLocations = [...locations].sort(function (a, b) {
        return calculateRescuePriority(b) - calculateRescuePriority(a);
    });

    const teams = [];

    hubs.forEach(function (hub, hubIndex) {
        const requestedCount = Number(
            hub.teams ??
            hub.teamCount ??
            hub.rescueTeams ??
            0
        );

        const teamCount = Math.max(
            0,
            Math.min(20, Math.floor(requestedCount))
        );

        for (let index = 0; index < teamCount; index++) {
            const teamNumber = teams.length + 1;

            const assignedLocation = sortedLocations.length
                ? sortedLocations[(teamNumber - 1) % sortedLocations.length]
                : null;

            /*
               Deterministic demo statuses make the dashboard
               repeatable after every refresh.
            */

            const statusPattern = ["active", "available", "completed"];
            const status = statusPattern[(teamNumber - 1) % statusPattern.length];

            const specialisations = [
                "Flood Rescue",
                "Medical Support",
                "Evacuation",
                "Relief Distribution",
                "Search & Rescue"
            ];

            teams.push({
                id: `TEAM-${String(teamNumber).padStart(3, "0")}`,
                name: `Rescue Team ${String(teamNumber).padStart(2, "0")}`,
                hubId: hub.id || `HUB-${hubIndex + 1}`,
                hubName: hub.name || hub.id || "Relief Hub",
                specialisation: specialisations[(teamNumber - 1) % specialisations.length],
                status,
                locationId: assignedLocation?.id || null,
                locationName: assignedLocation?.name || "Not assigned",
                severity: assignedLocation?.severity ?? 0,
                priorityScore: assignedLocation
                    ? calculateRescuePriority(assignedLocation)
                    : 0,
                distanceKm: null,
                demo: true
            });
        }
    });

    /*
       If hubs do not define a team count, create a small demo
       roster so the UI remains demonstrable. The team count is
       not intended to represent actual field resources.
    */

    if (teams.length === 0 && hubs.length > 0) {
        const demoCount = Math.min(4, hubs.length);

        for (let index = 0; index < demoCount; index++) {
            const hub = hubs[index];
            const location = sortedLocations[index] || null;

            teams.push({
                id: `TEAM-${String(index + 1).padStart(3, "0")}`,
                name: `Demo Rescue Team ${index + 1}`,
                hubId: hub.id || `HUB-${index + 1}`,
                hubName: hub.name || hub.id || "Relief Hub",
                specialisation: "General Emergency Response",
                status: ["available", "active", "completed", "available"][index],
                locationId: location?.id || null,
                locationName: location?.name || "Not assigned",
                severity: location?.severity ?? 0,
                priorityScore: location ? calculateRescuePriority(location) : 0,
                distanceKm: null,
                demo: true
            });
        }
    }

    return teams;
}

/* =========================================================
   ILLUSTRATIVE LOCATION PRIORITY
========================================================= */

function calculateRescuePriority(location) {
    const locations = rescueScenario?.locations || [];

    const maxAffected = Math.max(
        1,
        ...locations.map(item => Number(item.affectedPopulation || 0))
    );

    const maxVulnerable = Math.max(
        1,
        ...locations.map(item => Number(item.vulnerablePopulation || 0))
    );

    const severity = Math.min(
        100,
        Math.max(0, Number(location.severity || 0) / 5 * 100)
    );

    const urgency = Math.min(
        100,
        Math.max(0, Number(location.urgency || 0) / 5 * 100)
    );

    const affected = Math.min(
        100,
        Math.max(0, Number(location.affectedPopulation || 0) / maxAffected * 100)
    );

    const vulnerable = Math.min(
        100,
        Math.max(0, Number(location.vulnerablePopulation || 0) / maxVulnerable * 100)
    );

    const weights = rescueScenario?.simulationSettings?.priorityWeights || {};

    const wSeverity = Number(weights.severity ?? 0.35);
    const wUrgency = Number(weights.urgency ?? 0.25);
    const wAffected = Number(weights.affectedPopulation ?? 0.20);
    const wVulnerable = Number(weights.vulnerablePopulation ?? 0.20);

    const totalWeight = wSeverity + wUrgency + wAffected + wVulnerable;

    if (totalWeight <= 0) return 0;

    return Math.round((
        severity * wSeverity +
        urgency * wUrgency +
        affected * wAffected +
        vulnerable * wVulnerable
    ) / totalWeight * 10) / 10;
}

/* =========================================================
   KPI CARDS
========================================================= */

function renderRescueKPIs() {
    const total = rescueTeams.length;

    const available = rescueTeams.filter(
        team => team.status === "available"
    ).length;

    const active = rescueTeams.filter(
        team => team.status === "active"
    ).length;

    const completed = rescueTeams.filter(
        team => team.status === "completed"
    ).length;

    rescueSetText("totalTeams", total);
    rescueSetText("availableTeams", available);
    rescueSetText("activeOperations", active);
    rescueSetText("completedOperations", completed);
}

function renderTeamReadiness() {
    const total = rescueTeams.length;

    const available = rescueTeams.filter(
        team => team.status === "available"
    ).length;

    const active = rescueTeams.filter(
        team => team.status === "active"
    ).length;

    const completed = rescueTeams.filter(
        team => team.status === "completed"
    ).length;

    const percentage = total > 0
        ? Math.round(available / total * 100)
        : 0;

    const ring = document.getElementById("readinessRing");

    if (ring) {
        ring.style.setProperty("--readiness", `${percentage}%`);
        ring.setAttribute(
            "aria-label",
            `${percentage}% of simulated rescue teams are available`
        );
    }

    rescueSetText("readinessPercentage", `${percentage}%`);
    rescueSetText("availableLegend", `${available} teams`);
    rescueSetText("activeLegend", `${active} teams`);
    rescueSetText("completedLegend", `${completed} teams`);
}

function renderResponseOverview() {
    const locations = rescueScenario?.locations || [];

    const criticalLocations = locations.filter(
        location => Number(location.severity) >= 5
    ).length;

    const blockedRoads = rescueGetRoads().filter(
        rescueIsRoadBlocked
    ).length;

    rescueSetText("criticalResponseLocations", criticalLocations);
    rescueSetText("blockedResponseRoads", blockedRoads);
    rescueSetText("totalResponseLocations", locations.length);
}

/* =========================================================
   TEAM TABLE
========================================================= */

function renderRescueTeams() {
    const tableBody = document.getElementById("rescueTeamsBody");

    if (!tableBody) return;

    const searchTerm = (
        document.getElementById("teamSearch")?.value || ""
    ).trim().toLowerCase();

    const statusFilter =
        document.getElementById("teamStatusFilter")?.value || "all";

    const filteredTeams = rescueTeams.filter(function (team) {
        const searchableText = [
            team.id,
            team.name,
            team.hubName,
            team.hubId,
            team.specialisation,
            team.locationName
        ].join(" ").toLowerCase();

        const matchesSearch = searchableText.includes(searchTerm);

        const matchesStatus = statusFilter === "all" ||
            team.status === statusFilter;

        return matchesSearch && matchesStatus;
    });

    if (filteredTeams.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="table-empty">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    No teams match your search or status filter.
                </td>
            </tr>
        `;

        rescueSetText("teamResultCount", "0 teams");
        return;
    }

    tableBody.innerHTML = filteredTeams.map(function (team) {
        const initials = team.name
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map(word => word[0])
            .join("")
            .toUpperCase();

        const priorityClass = rescueGetSeverityClass(team.severity);

        return `
            <tr>
                <td>
                    <div class="team-name-cell">
                        <div class="team-avatar">
                            ${rescueEscapeHTML(initials)}
                        </div>

                        <div class="team-name-copy">
                            <strong>${rescueEscapeHTML(team.name)}</strong>
                            <small>
                                ${rescueEscapeHTML(team.id)} ·
                                ${rescueEscapeHTML(team.hubId)}
                            </small>
                        </div>
                    </div>
                </td>

                <td>
                    <span class="team-specialisation">
                        <i class="fa-solid fa-shield-heart"></i>
                        ${rescueEscapeHTML(team.specialisation)}
                    </span>
                </td>

                <td>${rescueEscapeHTML(team.locationName)}</td>

                <td>
                    <span class="priority-label ${priorityClass}">
                        <i class="fa-solid fa-flag"></i>
                        ${team.locationId
                            ? `${rescueGetSeverityLabel(team.severity)} · ${team.priorityScore.toFixed(1)}`
                            : "Not assigned"}
                    </span>
                </td>

                <td>
                    <span class="team-status-badge ${rescueEscapeHTML(team.status)}">
                        ${rescueEscapeHTML(capitalize(team.status))}
                    </span>
                </td>

                <td>
                    <button
                        class="view-team-button"
                        type="button"
                        data-view-team="${rescueEscapeHTML(team.id)}"
                        aria-label="View details for ${rescueEscapeHTML(team.name)}">

                        <i class="fa-solid fa-eye"></i>
                        View Details
                    </button>
                </td>
            </tr>
        `;
    }).join("");

    rescueSetText(
        "teamResultCount",
        `${filteredTeams.length} of ${rescueTeams.length} teams`
    );
}

/* =========================================================
   TEAM DETAILS
========================================================= */

function showTeamDetails(teamId) {
    const team = rescueTeams.find(item => item.id === teamId);

    if (!team) {
        renderEmptyTeamDetails();
        return;
    }

    selectedTeamId = teamId;

    const container = document.getElementById("operationDetails");

    if (!container) return;

    const location = (rescueScenario?.locations || []).find(
        item => item.id === team.locationId
    );

    const statusLabel = capitalize(team.status);

    container.innerHTML = `
        <article class="operation-detail-card">

            <div class="operation-detail-header">

                <div>
                    <h3>
                        <i class="fa-solid fa-shield-heart"></i>
                        ${rescueEscapeHTML(team.name)}
                    </h3>

                    <p>
                        ${rescueEscapeHTML(team.id)} ·
                        ${rescueEscapeHTML(team.specialisation)}
                    </p>
                </div>

                <span class="team-status-badge ${rescueEscapeHTML(team.status)}">
                    ${rescueEscapeHTML(statusLabel)}
                </span>

            </div>


            <div class="operation-detail-grid">

                <div class="operation-detail-item">
                    <span>Assigned Relief Hub</span>
                    <strong>${rescueEscapeHTML(team.hubName)}</strong>
                </div>

                <div class="operation-detail-item">
                    <span>Assigned Location</span>
                    <strong>${rescueEscapeHTML(team.locationName)}</strong>
                </div>

                <div class="operation-detail-item">
                    <span>Location Severity</span>
                    <strong>
                        ${team.locationId
                            ? rescueEscapeHTML(rescueGetSeverityLabel(team.severity))
                            : "Not assigned"}
                    </strong>
                </div>

                <div class="operation-detail-item">
                    <span>Priority Score</span>
                    <strong>
                        ${team.locationId
                            ? `${team.priorityScore.toFixed(1)} / 100`
                            : "Not available"}
                    </strong>
                </div>

                <div class="operation-detail-item">
                    <span>Affected Population</span>
                    <strong>
                        ${location
                            ? rescueFormatNumber(location.affectedPopulation)
                            : "Not available"}
                    </strong>
                </div>

                <div class="operation-detail-item">
                    <span>Vulnerable Population</span>
                    <strong>
                        ${location
                            ? rescueFormatNumber(location.vulnerablePopulation)
                            : "Not available"}
                    </strong>
                </div>

            </div>


            <div class="operation-route">
                <i class="fa-solid fa-route"></i>

                <strong>Route planning:</strong>

                ${team.locationId
                    ? `Route calculation can be performed for ${rescueEscapeHTML(team.locationName)} in the Simulation Lab.`
                    : "No location is assigned to this team."}
            </div>


            <div class="operation-note">
                <i class="fa-solid fa-circle-info"></i>

                <div>
                    <strong>Simulated assignment:</strong>
                    This team and its status are generated from the
                    demonstration scenario. This view does not represent
                    a real team, verified field activity or live GPS tracking.
                </div>
            </div>

        </article>
    `;

    /*
       Keep the selected team highlighted in the directory.
    */

    document.querySelectorAll("[data-view-team]").forEach(function (button) {
        const isSelected = button.dataset.viewTeam === teamId;

        button.setAttribute("aria-pressed", String(isSelected));
    });
}

function renderEmptyTeamDetails() {
    const container = document.getElementById("operationDetails");

    if (!container) return;

    container.innerHTML = `
        <div class="operation-empty-state">

            <div class="operation-empty-icon">
                <i class="fa-solid fa-binoculars"></i>
            </div>

            <h3>No team selected</h3>

            <p>
                Select View Details beside a simulated rescue team
                to inspect its hub, assignment and priority information.
            </p>

        </div>
    `;
}

function capitalize(value) {
    const text = String(value || "");

    return text.length
        ? text.charAt(0).toUpperCase() + text.slice(1)
        : "Unknown";
}

/* =========================================================
   STATUS MESSAGE
========================================================= */

function showRescueMessage(message, type = "info") {
    const element = document.getElementById("rescueMessage");

    if (!element) {
        console.log(`[AVERTIQ ${type.toUpperCase()}] ${message}`);
        return;
    }

    element.className = `rescue-message ${type}`;
    element.textContent = message;
}

/* =========================================================
   DEBUG ACCESS
========================================================= */

window.AvertIQRescue = {
    refresh: loadRescueScenario,

    getTeams: function () {
        return rescueTeams.map(team => ({ ...team }));
    },

    getSelectedTeam: function () {
        return rescueTeams.find(team => team.id === selectedTeamId) || null;
    }
};
