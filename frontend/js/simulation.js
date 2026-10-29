"use strict";

/* =========================================================
   AVERTIQ â€” SIMULATION LAB
   File: frontend/js/simulation.js

   Features:
   - Simulated disaster scenarios
   - Block / unblock roads
   - Adjust resource inventory
   - Dijkstra shortest-path routing
   - Reachability analysis
   - Resource shortage estimation
   - Simulation activity log

   NOTE:
   This is a simulated decision-support prototype.
   It does not provide real-world emergency predictions.
========================================================= */

(function () {
    const DATA_URL = "../assets/data/disaster-scenario.json";

    const RESOURCE_LABELS = {
        foodKits: "Food Kits",
        food: "Food Kits",
        waterLitres: "Water (Litres)",
        water: "Water (Litres)",
        medicalKits: "Medical Kits",
        medical: "Medical Kits",
        rescueBoats: "Rescue Boats",
        boats: "Rescue Boats",
        shelterUnits: "Shelter Units",
        shelter: "Shelter Units"
    };

    const RESOURCE_ALIASES = {
        foodKits: ["foodKits", "food", "foodKitsNeeded"],
        food: ["food", "foodKits", "foodKitsNeeded"],
        waterLitres: ["waterLitres", "water", "waterNeeded"],
        water: ["water", "waterLitres", "waterNeeded"],
        medicalKits: ["medicalKits", "medical", "medicalKitsNeeded"],
        medical: ["medical", "medicalKits", "medicalKitsNeeded"],
        rescueBoats: ["rescueBoats", "boats", "rescueBoat"],
        boats: ["boats", "rescueBoats", "rescueBoat"],
        shelterUnits: ["shelterUnits", "shelter", "shelterNeeded"],
        shelter: ["shelter", "shelterUnits", "shelterNeeded"]
    };

    const state = {
        baseline: null,
        scenario: null,
        simulationRuns: 0,
        activity: [],
        lastResults: null,
        loading: false
    };

    const $ = (id) => document.getElementById(id);

    /* =====================================================
       1. GENERAL HELPERS
    ===================================================== */

    function deepClone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, (character) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]);
    }

    function formatNumber(value) {
        return Number(value || 0).toLocaleString("en-IN", {
            maximumFractionDigits: 2
        });
    }

    function getLocations() {
        const locations = state.scenario?.locations;
        return Array.isArray(locations) ? locations : [];
    }

    function getHubs() {
        const hubs = state.scenario?.hubs;
        return Array.isArray(hubs) ? hubs : [];
    }

    function getRoads() {
        const roads = state.scenario?.roads;
        return Array.isArray(roads) ? roads : [];
    }

    function getId(item) {
        return String(
            item?.id ??
            item?._id ??
            item?.locationId ??
            item?.hubId ??
            item?.roadId ??
            ""
        );
    }

    function getRoadEndpoints(road) {
        const from =
            road?.from ??
            road?.source ??
            road?.start ??
            road?.fromId;

        const to =
            road?.to ??
            road?.target ??
            road?.end ??
            road?.toId;

        return {
            from: String(
                typeof from === "object" ? getId(from) : from ?? ""
            ),
            to: String(
                typeof to === "object" ? getId(to) : to ?? ""
            )
        };
    }

    function isRoadBlocked(road) {
        return road?.blocked === true ||
            String(road?.status || "").toLowerCase() === "blocked";
    }

    function getRoadDistance(road) {
        const distance = Number(
            road?.distanceKm ??
            road?.distance ??
            road?.lengthKm ??
            road?.length ??
            1
        );

        return Number.isFinite(distance) && distance > 0
            ? distance
            : 1;
    }

    function getSeverity(location) {
        const raw = location?.severity;
        const number = Number(raw);

        if (Number.isFinite(number) && String(raw).trim() !== "") {
            return Math.max(1, Math.min(5, number));
        }

        const label = String(raw || "").toLowerCase();

        if (label.includes("critical")) return 5;
        if (label.includes("high")) return 4;
        if (label.includes("medium")) return 3;
        if (label.includes("low")) return 2;

        return 3;
    }

    function getUrgency(location) {
        const raw = location?.urgency;
        const number = Number(raw);

        if (Number.isFinite(number) && String(raw).trim() !== "") {
            return Math.max(1, Math.min(5, number));
        }

        const label = String(raw || "").toLowerCase();

        if (label.includes("critical")) return 5;
        if (label.includes("high")) return 4;
        if (label.includes("medium")) return 3;
        if (label.includes("low")) return 2;

        return 3;
    }

    function getPopulation(location) {
        return Math.max(
            0,
            Number(
                location?.affectedPopulation ??
                location?.affected ??
                location?.population ??
                0
            ) || 0
        );
    }

    function getVulnerablePopulation(location) {
        return Math.max(
            0,
            Number(
                location?.vulnerablePopulation ??
                location?.vulnerable ??
                0
            ) || 0
        );
    }

    function getRequirements(location) {
        return location?.requiredResources ||
            location?.resourceRequirements ||
            location?.resourcesNeeded ||
            location?.requirements ||
            {};
    }

    function getInventory(hub) {
        return hub?.inventory ||
            hub?.resources ||
            hub?.availableResources ||
            {};
    }

    function getCapacity(hub) {
        const capacity = Number(
            hub?.capacity ??
            hub?.maxCapacity ??
            Infinity
        );

        return Number.isFinite(capacity)
            ? Math.max(0, capacity)
            : Infinity;
    }

    function getTeamCount(hub) {
        return Math.max(
            0,
            Number(
                hub?.teams ??
                hub?.teamCount ??
                hub?.rescueTeams ??
                0
            ) || 0
        );
    }

    function setText(id, value) {
        const element = $(id);

        if (element) {
            element.textContent = String(value);
        }
    }

    function showMessage(message, type = "info") {
        const element = $("simulationMessage");

        if (!element) return;

        element.textContent = message;
        element.className = `simulation-message ${type}`;
        element.setAttribute("role", type === "error" ? "alert" : "status");
    }

    function showInlineStatus(id, message, type = "") {
        const element = $(id);

        if (!element) return;

        element.textContent = message;
        element.className = `simulation-inline-status ${type}`.trim();
    }

    function clearResults() {
        state.lastResults = null;

        const placeholder = $("simulationResultsPlaceholder");
        const results = $("simulationResults");

        if (placeholder) placeholder.hidden = false;
        if (results) results.hidden = true;

        renderInventoryTable();
    }

    /* =====================================================
       2. RESOURCE HELPERS
    ===================================================== */

    function getResourceKeys() {
        const keys = new Set();

        getHubs().forEach((hub) => {
            Object.keys(getInventory(hub)).forEach((key) => {
                keys.add(key);
            });
        });

        getLocations().forEach((location) => {
            Object.keys(getRequirements(location)).forEach((key) => {
                keys.add(key);
            });
        });

        return [...keys];
    }

    function getResourceLabel(key) {
        return RESOURCE_LABELS[key] || key
            .replace(/([A-Z])/g, " $1")
            .replace(/^./, (letter) => letter.toUpperCase())
            .trim();
    }

    function getMatchingKey(object, resourceKey) {
        const aliases = RESOURCE_ALIASES[resourceKey] || [resourceKey];

        return aliases.find((key) =>
            Object.prototype.hasOwnProperty.call(object, key)
        ) || resourceKey;
    }

    function getResourceAmount(object, resourceKey) {
        const key = getMatchingKey(object, resourceKey);
        const amount = Number(object?.[key] || 0);

        return Number.isFinite(amount) ? Math.max(0, amount) : 0;
    }

    function setResourceAmount(hub, resourceKey, amount) {
        let inventory = getInventory(hub);

        if (!inventory || typeof inventory !== "object") {
            inventory = {};
            hub.inventory = inventory;
        }

        const key = getMatchingKey(inventory, resourceKey);
        inventory[key] = Math.max(0, Number(amount) || 0);
    }

    function getTotalInventory() {
        return getResourceKeys().reduce((total, key) => {
            return total + getHubs().reduce((hubTotal, hub) => {
                return hubTotal + getResourceAmount(
                    getInventory(hub),
                    key
                );
            }, 0);
        }, 0);
    }

    function getResourceTotals() {
        const totals = {};

        getResourceKeys().forEach((key) => {
            totals[key] = getHubs().reduce((sum, hub) => {
                return sum + getResourceAmount(
                    getInventory(hub),
                    key
                );
            }, 0);
        });

        return totals;
    }

    function getDemandTotals() {
        const totals = {};

        getResourceKeys().forEach((key) => {
            totals[key] = getLocations().reduce((sum, location) => {
                return sum + getResourceAmount(
                    getRequirements(location),
                    key
                );
            }, 0);
        });

        return totals;
    }

    /* =====================================================
       3. ACTIVITY LOG
    ===================================================== */

    function addActivity(title, description, type = "info") {
        state.activity.unshift({
            title,
            description,
            type,
            time: new Date()
        });

        state.activity = state.activity.slice(0, 30);
        renderActivityLog();
    }

    function renderActivityLog() {
        const container = $("simulationActivityLog");

        if (!container) return;

        if (state.activity.length === 0) {
            container.innerHTML = `
                <div class="simulation-log-empty">
                    <i class="fa-solid fa-clock-rotate-left"
                       aria-hidden="true"></i>
                    <span>
                        No simulation activity yet.
                        Your actions will appear here.
                    </span>
                </div>
            `;
            return;
        }

        const iconMap = {
            info: "fa-circle-info",
            warning: "fa-triangle-exclamation",
            danger: "fa-road-barrier",
            success: "fa-circle-check"
        };

        container.innerHTML = state.activity.map((entry) => {
            const icon = iconMap[entry.type] || iconMap.info;

            return `
                <article class="simulation-log-entry">
                    <div class="simulation-log-icon ${escapeHTML(entry.type)}">
                        <i class="fa-solid ${icon}"
                           aria-hidden="true"></i>
                    </div>

                    <div class="simulation-log-content">
                        <strong>${escapeHTML(entry.title)}</strong>
                        <p>${escapeHTML(entry.description)}</p>
                    </div>

                    <time class="simulation-log-time">
                        ${escapeHTML(entry.time.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit"
                        }))}
                    </time>
                </article>
            `;
        }).join("");
    }

    /* =====================================================
       4. SCENARIO INFORMATION
    ===================================================== */

    function renderScenarioInformation() {
        const scenario = state.scenario;
        if (!scenario) return;

        const settings = scenario.simulationSettings || {};

        setText(
            "simulationScenarioName",
            scenario.scenarioName ||
            scenario.name ||
            "Simulated Disaster Scenario"
        );

        setText(
            "simulationScenarioRegion",
            scenario.region ||
            scenario.district ||
            scenario.location ||
            "Demo Region"
        );

        setText("simulationLocationCount", getLocations().length);

        setText(
            "simulationBlockedRoadCount",
            getRoads().filter(isRoadBlocked).length
        );

        setText("simulationHubCount", getHubs().length);
        setText("simulationRunCount", state.simulationRuns);
        setText("simulationRoadCountLabel", getRoads().length);

        const preset = $("scenarioPreset");

        if (preset && !preset.dataset.initialized) {
            preset.value = "baseline";
            preset.dataset.initialized = "true";
        }

        if (settings) {
            const weights = settings.priorityWeights;

            if (weights) {
                // Weights are scenario metadata, not validated
                // emergency-response thresholds.
                console.info(
                    "AVERTIQ illustrative priority weights:",
                    weights
                );
            }
        }
    }

    /* =====================================================
       5. SELECT INPUTS
    ===================================================== */

    function populateSelect(select, items, getValue, getLabel, firstOption) {
        if (!select) return;

        const previousValue = select.value;

        select.innerHTML = "";

        if (firstOption) {
            const option = document.createElement("option");
            option.value = "";
            option.textContent = firstOption;
            select.appendChild(option);
        }

        items.forEach((item) => {
            const option = document.createElement("option");
            option.value = String(getValue(item));
            option.textContent = String(getLabel(item));
            select.appendChild(option);
        });

        if (items.some((item) => String(getValue(item)) === previousValue)) {
            select.value = previousValue;
        }
    }

    function populateControls() {
        populateSelect(
            $("simulationRoadSelect"),
            getRoads(),
            getId,
            (road) => {
                const endpoints = getRoadEndpoints(road);

                return `${getId(road)} â€” ${endpoints.from} â†” ${endpoints.to}`;
            },
            "Select a road"
        );

        populateSelect(
            $("simulationHubSelect"),
            getHubs(),
            getId,
            (hub) => `${getId(hub)} â€” ${hub.name || "Relief Hub"}`,
            "Select a hub"
        );

        const resourceSelect = $("simulationResourceSelect");

        populateSelect(
            resourceSelect,
            getResourceKeys(),
            (key) => key,
            getResourceLabel,
            "Select a resource"
        );

        updateRoadControls();
        updateResourceControls();
    }

    function updateRoadControls() {
        const roadId = $("simulationRoadSelect")?.value;
        const road = getRoads().find((item) => getId(item) === roadId);
        const blocked = road ? isRoadBlocked(road) : false;

        const blockButton = $("blockRoadButton");
        const unblockButton = $("unblockRoadButton");

        if (blockButton) blockButton.disabled = !road || blocked;
        if (unblockButton) unblockButton.disabled = !road || !blocked;

        if (!road) {
            showInlineStatus(
                "simulationRoadStatus",
                "Select a road to inspect its status."
            );
            return;
        }

        showInlineStatus(
            "simulationRoadStatus",
            `${getId(road)} is currently ${blocked ? "blocked" : "open"}.`,
            blocked ? "warning" : "success"
        );
    }

    function updateResourceControls() {
        const hubId = $("simulationHubSelect")?.value;
        const resourceKey = $("simulationResourceSelect")?.value;

        const hub = getHubs().find((item) => getId(item) === hubId);

        const button = $("applyResourceAdjustment");
        const amountInput = $("simulationResourceAmount");

        if (button) button.disabled = !hub || !resourceKey;
        if (amountInput) amountInput.disabled = !hub || !resourceKey;

        if (!hub || !resourceKey) {
            showInlineStatus(
                "simulationResourceStatus",
                "Choose a hub and resource to view inventory."
            );
            return;
        }

        const inventory = getInventory(hub);
        const current = getResourceAmount(inventory, resourceKey);

        showInlineStatus(
            "simulationResourceStatus",
            `Current ${getResourceLabel(resourceKey)} inventory: ${formatNumber(current)}.`,
            "success"
        );
    }

    /* =====================================================
       6. ROAD STATUS TABLE
    ===================================================== */

    function renderRoadTable() {
        const tbody = $("simulationRoadTableBody");
        if (!tbody) return;

        const roads = getRoads();

        if (!roads.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="simulation-table-empty">
                        No roads are available in this scenario.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = roads.map((road) => {
            const endpoints = getRoadEndpoints(road);
            const blocked = isRoadBlocked(road);

            return `
                <tr>
                    <td>${escapeHTML(getId(road))}</td>
                    <td>
                        ${escapeHTML(endpoints.from)}
                        <span aria-hidden="true"> â†” </span>
                        ${escapeHTML(endpoints.to)}
                    </td>
                    <td>${formatNumber(getRoadDistance(road))} km*</td>
                    <td>
                        <span class="simulation-road-badge ${blocked ? "blocked" : "open"}">
                            ${blocked ? "Blocked" : "Open"}
                        </span>
                    </td>
                </tr>
            `;
        }).join("");
    }

    /* =====================================================
       7. INVENTORY TABLE
    ===================================================== */

    function renderInventoryTable() {
        const tbody = $("simulationInventoryTableBody");
        if (!tbody) return;

        const hubs = getHubs();
        const keys = getResourceKeys();

        if (!hubs.length || !keys.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="simulation-table-empty">
                        No hub inventory data available.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = hubs.map((hub) => {
            const inventory = getInventory(hub);

            const rows = keys.map((key) => {
                return `
                    <tr>
                        <td>${escapeHTML(getId(hub))}</td>
                        <td>${escapeHTML(getResourceLabel(key))}</td>
                        <td>${formatNumber(
                            getResourceAmount(inventory, key)
                        )}</td>
                        <td>${Number.isFinite(getCapacity(hub))
                            ? formatNumber(getCapacity(hub))
                            : "Not specified"}</td>
                    </tr>
                `;
            }).join("");

            return rows;
        }).join("");
    }

    /* =====================================================
       8. ROAD ACTIONS
    ===================================================== */

    function setRoadBlocked(blocked) {
        const roadId = $("simulationRoadSelect")?.value;

        const road = getRoads().find((item) => getId(item) === roadId);

        if (!road) {
            showInlineStatus(
                "simulationRoadStatus",
                "Please select a valid road first.",
                "error"
            );
            return;
        }

        const wasBlocked = isRoadBlocked(road);

        if (wasBlocked === blocked) {
            updateRoadControls();
            return;
        }

        road.blocked = blocked;
        road.status = blocked ? "blocked" : "open";

        renderRoadTable();
        renderScenarioInformation();
        clearResults();
        updateRoadControls();

        const endpoints = getRoadEndpoints(road);
        const action = blocked ? "blocked" : "reopened";

        showMessage(
            `Road ${getId(road)} has been ${action}. Run the simulation to recalculate reachability.`,
            blocked ? "warning" : "success"
        );

        addActivity(
            blocked ? "Road blocked" : "Road reopened",
            `${getId(road)} (${endpoints.from} to ${endpoints.to}) was ${action}.`,
            blocked ? "danger" : "success"
        );
    }

    /* =====================================================
       9. RESOURCE ADJUSTMENT
    ===================================================== */

    function adjustResource() {
        const hubId = $("simulationHubSelect")?.value;
        const resourceKey = $("simulationResourceSelect")?.value;
        const amount = Number($("simulationResourceAmount")?.value);

        const hub = getHubs().find((item) => getId(item) === hubId);

        if (!hub || !resourceKey) {
            showInlineStatus(
                "simulationResourceStatus",
                "Select both a hub and a resource.",
                "error"
            );
            return;
        }

        if (!Number.isFinite(amount) || amount === 0) {
            showInlineStatus(
                "simulationResourceStatus",
                "Enter a non-zero adjustment amount.",
                "error"
            );
            return;
        }

        if (!Number.isInteger(amount)) {
            showInlineStatus(
                "simulationResourceStatus",
                "Enter a whole number for this resource.",
                "error"
            );
            return;
        }

        const inventory = getInventory(hub);
        const current = getResourceAmount(inventory, resourceKey);
        const updated = current + amount;

        if (updated < 0) {
            showInlineStatus(
                "simulationResourceStatus",
                `Adjustment rejected. Current stock is ${formatNumber(current)}.`,
                "error"
            );
            return;
        }

        const capacity = getCapacity(hub);

        if (Number.isFinite(capacity) && amount > 0 && updated > capacity) {
            showInlineStatus(
                "simulationResourceStatus",
                `Adjustment rejected: resulting stock (${formatNumber(updated)}) exceeds the hub's stated capacity (${formatNumber(capacity)}).`,
                "error"
            );
            return;
        }

        setResourceAmount(hub, resourceKey, updated);

        renderInventoryTable();
        clearResults();
        updateResourceControls();

        const action = amount > 0 ? "increased" : "decreased";

        showMessage(
            `${getResourceLabel(resourceKey)} at ${hub.name || getId(hub)} ${action} by ${formatNumber(Math.abs(amount))}.`,
            "success"
        );

        addActivity(
            "Resource inventory adjusted",
            `${getResourceLabel(resourceKey)} at ${hub.name || getId(hub)} changed from ${formatNumber(current)} to ${formatNumber(updated)}.`,
            amount < 0 ? "warning" : "success"
        );

        const amountInput = $("simulationResourceAmount");

        if (amountInput) amountInput.value = "";
    }

    /* =====================================================
       10. DIJKSTRA SHORTEST PATH
    ===================================================== */

    function buildGraph() {
        const graph = new Map();

        function ensureNode(id) {
            if (!graph.has(id)) {
                graph.set(id, []);
            }
        }

        getHubs().concat(getLocations()).forEach((node) => {
            ensureNode(getId(node));
        });

        getRoads().forEach((road) => {
            if (isRoadBlocked(road)) return;

            const endpoints = getRoadEndpoints(road);

            if (!endpoints.from || !endpoints.to) return;

            ensureNode(endpoints.from);
            ensureNode(endpoints.to);

            const distance = getRoadDistance(road);

            graph.get(endpoints.from).push({
                node: endpoints.to,
                distance
            });

            graph.get(endpoints.to).push({
                node: endpoints.from,
                distance
            });
        });

        return graph;
    }

    function dijkstra(graph, start) {
        const distances = new Map();
        const previous = new Map();
        const unvisited = new Set(graph.keys());

        graph.forEach((_, node) => {
            distances.set(node, Infinity);
        });

        if (!graph.has(start)) {
            return { distances, previous };
        }

        distances.set(start, 0);

        while (unvisited.size > 0) {
            let current = null;
            let smallestDistance = Infinity;

            unvisited.forEach((node) => {
                const distance = distances.get(node);

                if (distance < smallestDistance) {
                    smallestDistance = distance;
                    current = node;
                }
            });

            if (current === null || smallestDistance === Infinity) {
                break;
            }

            unvisited.delete(current);

            const neighbours = graph.get(current) || [];

            neighbours.forEach((edge) => {
                if (!unvisited.has(edge.node)) return;

                const newDistance = smallestDistance + edge.distance;

                if (newDistance < distances.get(edge.node)) {
                    distances.set(edge.node, newDistance);
                    previous.set(edge.node, current);
                }
            });
        }

        return { distances, previous };
    }

    function calculateRoutes() {
        const graph = buildGraph();
        const routesByLocation = new Map();

        getLocations().forEach((location) => {
            routesByLocation.set(getId(location), {
                locationId: getId(location),
                reachable: false,
                hubId: null,
                distance: Infinity,
                path: []
            });
        });

        getHubs().forEach((hub) => {
            const hubId = getId(hub);
            const { distances, previous } = dijkstra(graph, hubId);

            getLocations().forEach((location) => {
                const locationId = getId(location);
                const distance = distances.get(locationId);

                if (!Number.isFinite(distance)) return;

                const existing = routesByLocation.get(locationId);

                if (distance < existing.distance) {
                    const path = [];
                    let cursor = locationId;
                    const visited = new Set();

                    while (cursor && !visited.has(cursor)) {
                        visited.add(cursor);
                        path.unshift(cursor);

                        if (cursor === hubId) break;

                        cursor = previous.get(cursor);
                    }

                    if (path[0] !== hubId) return;

                    routesByLocation.set(locationId, {
                        locationId,
                        reachable: true,
                        hubId,
                        distance,
                        path
                    });
                }
            });
        });

        return routesByLocation;
    }

    /* =====================================================
       11. PRIORITY SCORING
    ===================================================== */

    function calculatePriority(location) {
        const settings = state.scenario?.simulationSettings || {};
        const configured = settings.priorityWeights || {};

        const severityWeight = Number(configured.severity ?? 0.35);
        const urgencyWeight = Number(configured.urgency ?? 0.25);
        const populationWeight = Number(configured.affectedPopulation ?? 0.20);
        const vulnerableWeight = Number(configured.vulnerablePopulation ?? 0.20);

        const locations = getLocations();

        const maxPopulation = Math.max(
            1,
            ...locations.map(getPopulation)
        );

        const maxVulnerable = Math.max(
            1,
            ...locations.map(getVulnerablePopulation)
        );

        const severityScore = (getSeverity(location) / 5) * 100;
        const urgencyScore = (getUrgency(location) / 5) * 100;
        const populationScore = (getPopulation(location) / maxPopulation) * 100;
        const vulnerableScore = (
            getVulnerablePopulation(location) / maxVulnerable
        ) * 100;

        const weightTotal =
            severityWeight +
            urgencyWeight +
            populationWeight +
            vulnerableWeight;

        if (weightTotal <= 0) return 0;

        return (
            severityScore * severityWeight +
            urgencyScore * urgencyWeight +
            populationScore * populationWeight +
            vulnerableScore * vulnerableWeight
        ) / weightTotal;
    }

    /* =====================================================
       12. RUN SIMULATION
    ===================================================== */

    function runSimulation() {
        if (!state.scenario || state.loading) return;

        const button = $("runSimulation");

        if (button) {
            button.disabled = true;
            button.innerHTML = `
                <i class="fa-solid fa-spinner fa-spin"
                   aria-hidden="true"></i>
                Running Simulation...
            `;
        }

        showMessage(
            "Recalculating routes and inspecting simulated resource demand...",
            "info"
        );

        // Keep the UI responsive for this demonstration.
        window.setTimeout(() => {
            try {
                const routes = calculateRoutes();
                const locations = getLocations();
                const hubs = getHubs();

                const reachableLocations = [];
                const unreachableLocations = [];

                locations.forEach((location) => {
                    const route = routes.get(getId(location));

                    if (route?.reachable) {
                        reachableLocations.push({
                            location,
                            route,
                            priority: calculatePriority(location)
                        });
                    } else {
                        unreachableLocations.push({
                            location,
                            priority: calculatePriority(location)
                        });
                    }
                });

                reachableLocations.sort((a, b) => {
                    return b.priority - a.priority;
                });

                unreachableLocations.sort((a, b) => {
                    return b.priority - a.priority;
                });

                const inventoryTotals = getResourceTotals();
                const demandTotals = getDemandTotals();

                const shortages = [];

                Object.keys(demandTotals).forEach((key) => {
                    const available = inventoryTotals[key] || 0;
                    const required = demandTotals[key] || 0;
                    const shortage = Math.max(0, required - available);

                    if (shortage > 0) {
                        shortages.push({
                            key,
                            label: getResourceLabel(key),
                            available,
                            required,
                            shortage
                        });
                    }
                });

                const totalDemand = Object.values(demandTotals)
                    .reduce((sum, amount) => sum + amount, 0);

                const totalInventory = Object.values(inventoryTotals)
                    .reduce((sum, amount) => sum + amount, 0);

                const totalBlockedRoads = getRoads()
                    .filter(isRoadBlocked).length;

                let allocationResults = null;

                try {
                    if (
                        window.AvertIQAllocation &&
                        typeof window.AvertIQAllocation.calculateForScenario === "function"
                    ) {
                        allocationResults =
                            window.AvertIQAllocation.calculateForScenario(state.scenario);
                    } else {
                        console.warn("Allocation engine is unavailable on this page.");
                    }
                } catch (allocationError) {
                    console.error("Allocation calculation failed:", allocationError);
                }

                const results = {
                    routes,
                    reachableLocations,
                    unreachableLocations,
                    inventoryTotals,
                    demandTotals,
                    shortages,
                    totalDemand,
                    totalInventory,
                    totalBlockedRoads,
                    allocationResults,
                    teamCount: hubs.reduce((sum, hub) => {
                        return sum + getTeamCount(hub);
                    }, 0)
                };

                state.lastResults = results;
                state.simulationRuns += 1;

                renderResults(results);
                renderScenarioInformation();
                renderRoadTable();

                addActivity(
                    "Simulation completed",
                    `${reachableLocations.length} of ${locations.length} locations are reachable through the currently open roads. ${shortages.length} resource categories show a stock shortfall against aggregate demand.`,
                    unreachableLocations.length > 0 || shortages.length > 0
                        ? "warning"
                        : "success"
                );

                showMessage(
                    `Simulation #${state.simulationRuns} completed. Results are based on the current simulated scenario.`,
                    "success"
                );
            } catch (error) {
                console.error("AVERTIQ simulation error:", error);

                showMessage(
                    "The simulation could not be completed. Check the scenario data and browser console.",
                    "error"
                );
            } finally {
                if (button) {
                    button.disabled = false;
                    button.innerHTML = `
                        <i class="fa-solid fa-play"
                           aria-hidden="true"></i>
                        Run Simulation
                    `;
                }
            }
        }, 80);
    }

    /* =====================================================
       13. RESULTS RENDERING
    ===================================================== */

    function renderAllocationResultsInSimulation(results) {
    const body = document.getElementById("simulationAllocationBody");
    if (!body) return;

    const rows = Array.isArray(results.allocationResults)
        ? results.allocationResults
        : [];

    const fmt = value =>
        Number(value || 0).toLocaleString("en-IN");

    const esc = value =>
        String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]);

    const unmetTotal = item =>
        Object.values(item.unmet || {}).reduce(
            (sum, value) => sum + Math.max(0, Number(value) || 0),
            0
        );

    const setCount = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = fmt(value);
    };

    setCount("allocationLocationCount", rows.length);
    setCount(
        "allocationInaccessibleCount",
        rows.filter(item => item.inaccessible).length
    );
    setCount(
        "allocationShortageCount",
        rows.filter(item => unmetTotal(item) > 0).length
    );

    if (!rows.length) {
        body.innerHTML =
            '<tr><td colspan="8">No allocation results available. Check the allocation engine.</td></tr>';
        return;
    }

    body.innerHTML = rows.map(item => {
        const allocated = Object.entries(item.allocations || {})
            .filter(([, amount]) => Number(amount) > 0)
            .map(([name, amount]) => `${esc(name)}: ${fmt(amount)}`)
            .join("<br>") || "None";

        const unmet = Object.entries(item.unmet || {})
            .filter(([, amount]) => Number(amount) > 0)
            .map(([name, amount]) => `${esc(name)}: ${fmt(amount)}`)
            .join("<br>") || "None";

        const status = item.inaccessible
            ? '<span class="allocation-status status-danger">Inaccessible</span>'
            : unmetTotal(item) > 0
                ? '<span class="allocation-status status-warning">Shortage</span>'
                : '<span class="allocation-status status-success">Allocated</span>';

        return `
            <tr>
                <td><strong>${esc(item.locationName || item.locationId || "Unknown")}</strong></td>
                <td>${fmt(item.priorityScore)}</td>
                <td>${fmt(item.affectedPopulation)}</td>
                <td>${fmt(item.coveredPopulation)}</td>
                <td>${fmt(item.remainingPopulation)}</td>
                <td>${allocated}</td>
                <td>${unmet}</td>
                <td>${status}</td>
            </tr>`;
    }).join("");
}
function renderResults(results) {
        const placeholder = $("simulationResultsPlaceholder");
        const container = $("simulationResults");

        if (placeholder) placeholder.hidden = true;
        if (container) container.hidden = false;

        setText(
            "resultReachableLocations",
            results.reachableLocations.length
        );

        setText(
            "resultUnreachableLocations",
            results.unreachableLocations.length
        );

        setText(
            "resultAvailableResources",
            formatNumber(results.totalInventory)
        );

        setText(
            "resultResourceShortages",
            results.shortages.length
        );

        renderFindings(results);
        renderAccessibilityTable(results);
    renderAllocationResultsInSimulation(results);
        renderInventoryTable();
    }

    function renderFindings(results) {
        const container = $("simulationResultFindings");
        if (!container) return;

        const items = [];

        items.push(
            `${results.reachableLocations.length} of ${getLocations().length} affected locations are reachable from at least one hub through open roads.`
        );

        if (results.unreachableLocations.length > 0) {
            const names = results.unreachableLocations
                .slice(0, 4)
                .map((item) => item.location.name || getId(item.location))
                .join(", ");

            items.push(
                `Unreachable locations: ${names}${results.unreachableLocations.length > 4 ? ", and others" : ""}. Consider reviewing road access or available hub connections.`
            );
        } else {
            items.push(
                "Every affected location has a route from at least one hub in the current road network."
            );
        }

        if (results.shortages.length > 0) {
            const shortageSummary = results.shortages
                .slice(0, 4)
                .map((item) => `${item.label}: ${formatNumber(item.shortage)} short`)
                .join("; ");

            items.push(
                `Aggregate stock is below aggregate listed demand for ${results.shortages.length} resource categories: ${shortageSummary}.`
            );
        } else {
            items.push(
                "Aggregate inventory meets or exceeds the listed demand for every resource category in this scenario."
            );
        }

        if (results.totalBlockedRoads > 0) {
            items.push(
                `${results.totalBlockedRoads} road(s) are blocked. Reopening a road may improve connectivity; run the simulation again to compare.`
            );
        }

        if (results.reachableLocations.length > 0) {
            const highest = results.reachableLocations[0];

            items.push(
                `Highest illustrative priority among reachable locations: ${highest.location.name || getId(highest.location)} (score ${highest.priority.toFixed(1)}/100). This score is a demo ranking, not a validated emergency threshold.`
            );
        }

        container.innerHTML = `
            <ul>
                ${items.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}
            </ul>
        `;
    }

    function renderAccessibilityTable(results) {
        const tbody = $("simulationAccessibilityBody");
        if (!tbody) return;

        const entries = [
            ...results.reachableLocations.map((item) => ({
                ...item,
                reachable: true
            })),
            ...results.unreachableLocations.map((item) => ({
                ...item,
                reachable: false,
                route: null
            }))
        ].sort((a, b) => b.priority - a.priority);

        if (!entries.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="simulation-table-empty">
                        No affected locations found.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = entries.map((item) => {
            const location = item.location;
            const route = item.route;

            return `
                <tr>
                    <td>${escapeHTML(location.name || getId(location))}</td>
                    <td>${item.priority.toFixed(1)}</td>
                    <td>
                        <span class="simulation-route-badge ${item.reachable ? "reachable" : "unreachable"}">
                            ${item.reachable ? "Reachable" : "Unreachable"}
                        </span>
                    </td>
                    <td>${escapeHTML(route?.hubId || "â€”")}</td>
                    <td>${Number.isFinite(route?.distance)
                        ? `${formatNumber(route.distance)} km*`
                        : "â€”"}</td>
                </tr>
            `;
        }).join("");
    }

    /* =====================================================
       14. RESET WORKSPACE
    ===================================================== */

    function resetWorkspace() {
        if (!state.baseline) return;

        state.scenario = deepClone(state.baseline);
        state.simulationRuns = 0;
        state.activity = [];
        state.lastResults = null;

        const preset = $("scenarioPreset");

        if (preset) {
            preset.value = "baseline";
        }

        const amountInput = $("simulationResourceAmount");

        if (amountInput) {
            amountInput.value = "";
        }

        renderScenarioInformation();
        populateControls();
        renderRoadTable();
        renderInventoryTable();
        renderActivityLog();
        clearResults();

        showMessage(
            "Simulation workspace reset to the original baseline scenario. Previous changes were discarded.",
            "success"
        );

        addActivity(
            "Workspace reset",
            "Road statuses and resource inventories were restored from the original scenario file.",
            "info"
        );
    }

    /* =====================================================
       15. SCENARIO PRESETS
    ===================================================== */

    function applyScenarioPreset() {
        if (!state.baseline) return;

        const preset = $("scenarioPreset")?.value || "baseline";

        state.scenario = deepClone(state.baseline);

        if (preset === "heavyFlood") {
            state.scenario.roads.forEach((road) => {
                const endpoints = getRoadEndpoints(road);
                const roadId = getId(road);

                if (
                    roadId === "ROAD-003" ||
                    roadId === "ROAD-006" ||
                    roadId === "ROAD-015" ||
                    (
                        endpoints.from.includes("LOC-") &&
                        endpoints.to.includes("LOC-") &&
                        !isRoadBlocked(road)
                    )
                ) {
                    road.blocked = true;
                    road.status = "blocked";
                }
            });

            state.scenario.locations.forEach((location) => {
                location.affectedPopulation = Math.round(
                    getPopulation(location) * 1.25
                );

                location.vulnerablePopulation = Math.round(
                    getVulnerablePopulation(location) * 1.15
                );
            });
        } else if (preset === "resourceShortage") {
            state.scenario.hubs.forEach((hub) => {
                const inventory = getInventory(hub);

                Object.keys(inventory).forEach((key) => {
                    inventory[key] = Math.floor(
                        Math.max(0, Number(inventory[key]) || 0) * 0.4
                    );
                });
            });
        }

        state.activity = [];
        state.lastResults = null;

        renderScenarioInformation();
        populateControls();
        renderRoadTable();
        renderInventoryTable();
        renderActivityLog();
        clearResults();

        const descriptions = {
            baseline: "Original baseline scenario loaded.",
            heavyFlood: "Illustrative heavy-flood scenario loaded with additional road closures and increased affected-population estimates.",
            resourceShortage: "Illustrative resource-shortage scenario loaded with hub inventory reduced to 40% of baseline."
        };

        showMessage(
            `${descriptions[preset] || descriptions.baseline} Run the simulation to calculate the results.`,
            "success"
        );

        addActivity(
            "Scenario preset loaded",
            descriptions[preset] || descriptions.baseline,
            preset === "baseline" ? "info" : "warning"
        );
    }

    /* =====================================================
       16. INITIALIZE
    ===================================================== */

    async function initializeSimulation() {
        if (state.loading) return;

        state.loading = true;

        showMessage(
            "Loading simulated disaster scenario...",
            "info"
        );

        try {
            const response = await fetch(DATA_URL, {
                cache: "no-store"
            });

            if (!response.ok) {
                throw new Error(
                    `Scenario request failed with status ${response.status}`
                );
            }

            const data = await response.json();

            if (
                !Array.isArray(data.locations) ||
                !Array.isArray(data.hubs) ||
                !Array.isArray(data.roads)
            ) {
                throw new Error(
                    "Scenario JSON must contain locations, hubs and roads arrays."
                );
            }

            state.baseline = deepClone(data);
            state.scenario = deepClone(data);

            renderScenarioInformation();
            populateControls();
            renderRoadTable();
            renderInventoryTable();
            renderActivityLog();
            clearResults();

            showMessage(
                "Scenario loaded successfully. Changes remain in this browser session and can be discarded with Reset.",
                "success"
            );

            addActivity(
                "Scenario loaded",
                `${getLocations().length} affected locations, ${getHubs().length} hubs and ${getRoads().length} roads loaded from the simulated scenario file.`,
                "success"
            );
        } catch (error) {
            console.error("AVERTIQ scenario loading error:", error);

            showMessage(
                "Could not load the scenario JSON. Confirm that the file exists at frontend/assets/data/disaster-scenario.json and open the frontend using a local web server.",
                "error"
            );
        } finally {
            state.loading = false;
        }
    }

    /* =====================================================
       17. EVENT LISTENERS
    ===================================================== */

    function bindEvents() {
        $("simulationRoadSelect")?.addEventListener(
            "change",
            updateRoadControls
        );

        $("simulationHubSelect")?.addEventListener(
            "change",
            updateResourceControls
        );

        $("simulationResourceSelect")?.addEventListener(
            "change",
            updateResourceControls
        );

        $("blockRoadButton")?.addEventListener("click", () => {
            setRoadBlocked(true);
        });

        $("unblockRoadButton")?.addEventListener("click", () => {
            setRoadBlocked(false);
        });

        $("applyResourceAdjustment")?.addEventListener(
            "click",
            adjustResource
        );

        $("runSimulation")?.addEventListener(
            "click",
            runSimulation
        );

        $("resetSimulationWorkspace")?.addEventListener(
            "click",
            resetWorkspace
        );

        $("resetSimulation")?.addEventListener(
            "click",
            resetWorkspace
        );

        $("scenarioPreset")?.addEventListener(
            "change",
            applyScenarioPreset
        );
    }

    document.addEventListener("DOMContentLoaded", () => {
        bindEvents();
        initializeSimulation();
    });
})();


