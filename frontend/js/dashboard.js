"use strict";

/* =========================================================
   AvertIQ — DASHBOARD CONTROLLER
   File: frontend/js/dashboard.js

   Features:
   1. Disaster scenario JSON loading
   2. Dashboard KPI cards
   3. Priority incidents
   4. Priority locations
   5. Resource availability chart
   6. Operations status
   7. Recommendations
   8. Recent activity
   9. Leaflet disaster map
   10. Road visualization and connectivity

   IMPORTANT:
   Scenario data is illustrative unless connected to
   verified live data sources.
========================================================= */

(function () {
    "use strict";

    /* =====================================================
       1. CONFIGURATION
    ===================================================== */

    const CONFIG = {
        SCENARIO_URL: "../assets/data/disaster-scenario.json",

        PRIORITY_SCORE: 60,

        MAP_CENTER: [21.1458, 79.0882],
        MAP_ZOOM: 11,

        REFRESH_INTERVAL: 5 * 60 * 1000,

        MAP_TILE_URL:
            "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",

        MAP_TILE_ATTRIBUTION:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    };

    const STATE = {
        scenario: null,
        map: null,
        markerLayer: null,
        roadLayer: null,
        resourceChart: null,
        loading: false,
        lastLoadedAt: null,
        refreshTimer: null
    };

    /* =====================================================
       2. DOM HELPERS
    ===================================================== */

    function getElement(id) {
        return document.getElementById(id);
    }

    function setText(id, value) {
        const element = getElement(id);

        if (element) {
            element.textContent = value ?? "—";
        }
    }

    function setVisible(element, visible) {
        if (element) {
            element.hidden = !visible;
        }
    }

    function escapeHTML(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function toNumber(value, fallback = 0) {
        const number = Number(value);

        return Number.isFinite(number) ? number : fallback;
    }

    function formatNumber(value) {
        return toNumber(value).toLocaleString("en-IN");
    }

    function formatDate(value) {
        if (!value) {
            return "Recently";
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return String(value);
        }

        return date.toLocaleString("en-IN", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function normalizeStatus(value) {
        return String(value ?? "")
            .trim()
            .toLowerCase()
            .replace(/[_-]+/g, " ");
    }

    function getStatusClass(status) {
        const normalized = normalizeStatus(status);

        if (
            normalized.includes("critical") ||
            normalized.includes("emergency") ||
            normalized.includes("severe")
        ) {
            return "critical";
        }

        if (
            normalized.includes("high") ||
            normalized.includes("warning")
        ) {
            return "high";
        }

        if (
            normalized.includes("resolved") ||
            normalized.includes("completed") ||
            normalized.includes("safe") ||
            normalized.includes("closed")
        ) {
            return "resolved";
        }

        if (
            normalized.includes("active") ||
            normalized.includes("ongoing") ||
            normalized.includes("moderate") ||
            normalized.includes("unserved")
        ) {
            return "active";
        }

        return "normal";
    }

    function showToast(message, type = "info") {
        if (
            window.AvertIQUtils &&
            typeof window.AvertIQUtils.showToast === "function"
        ) {
            window.AvertIQUtils.showToast(message, type);
            return;
        }

        console.info(`[AvertIQ ${type}] ${message}`);
    }

    /* =====================================================
       3. SCENARIO DATA HELPERS
    ===================================================== */

    function getLocations() {
        const locations = STATE.scenario?.locations;

        return Array.isArray(locations) ? locations : [];
    }

    function getHubs() {
        const hubs = STATE.scenario?.hubs;

        return Array.isArray(hubs) ? hubs : [];
    }

    function getRoads() {
        const roads = STATE.scenario?.roads;

        return Array.isArray(roads) ? roads : [];
    }

    /*
     * Supports:
     * { latitude: 21.14, longitude: 79.08 }
     * { lat: 21.14, lng: 79.08 }
     * { coordinates: [79.08, 21.14] }
     *
     * GeoJSON coordinate order is longitude, latitude.
     */

    function getCoordinates(item) {
        if (!item || typeof item !== "object") {
            return null;
        }

        let latitude = Number(
            item.latitude ?? item.lat
        );

        let longitude = Number(
            item.longitude ?? item.lng ?? item.lon
        );

        if (
            Number.isFinite(latitude) &&
            Number.isFinite(longitude) &&
            latitude >= -90 &&
            latitude <= 90 &&
            longitude >= -180 &&
            longitude <= 180
        ) {
            return [latitude, longitude];
        }

        if (
            Array.isArray(item.coordinates) &&
            item.coordinates.length >= 2
        ) {
            longitude = Number(item.coordinates[0]);
            latitude = Number(item.coordinates[1]);

            if (
                Number.isFinite(latitude) &&
                Number.isFinite(longitude) &&
                latitude >= -90 &&
                latitude <= 90 &&
                longitude >= -180 &&
                longitude <= 180
            ) {
                return [latitude, longitude];
            }
        }

        return null;
    }

    /* =====================================================
       4. PRIORITY SCORE
    ===================================================== */

    function getPriorityScore(location) {
        if (!location || typeof location !== "object") {
            return 0;
        }

        const explicitScore =
            location.priorityScore ??
            location.riskScore ??
            location.severityScore ??
            location.score;

        if (
            explicitScore !== undefined &&
            explicitScore !== null &&
            Number.isFinite(Number(explicitScore))
        ) {
            return Math.max(
                0,
                Math.min(100, Math.round(Number(explicitScore)))
            );
        }

        const locations = getLocations();

        const configuredWeights =
            STATE.scenario?.simulationSettings?.priorityWeights ?? {};

        const weights = {
            severity: toNumber(configuredWeights.severity, 0.35),
            urgency: toNumber(configuredWeights.urgency, 0.25),
            affectedPopulation: toNumber(
                configuredWeights.affectedPopulation,
                0.2
            ),
            vulnerablePopulation: toNumber(
                configuredWeights.vulnerablePopulation,
                0.2
            )
        };

        const maxAffected = Math.max(
            1,
            ...locations.map(item =>
                Math.max(0, toNumber(item.affectedPopulation))
            )
        );

        const maxVulnerable = Math.max(
            1,
            ...locations.map(item =>
                Math.max(0, toNumber(item.vulnerablePopulation))
            )
        );

        const severity =
            Math.max(0, Math.min(5, toNumber(location.severity))) / 5;

        const urgency =
            Math.max(0, Math.min(5, toNumber(location.urgency))) / 5;

        const affected =
            Math.max(0, toNumber(location.affectedPopulation)) /
            maxAffected;

        const vulnerable =
            Math.max(0, toNumber(location.vulnerablePopulation)) /
            maxVulnerable;

        const totalWeight = Object.values(weights).reduce(
            (sum, weight) => sum + Math.max(0, weight),
            0
        );

        if (totalWeight <= 0) {
            return 0;
        }

        const score =
            severity * Math.max(0, weights.severity) +
            urgency * Math.max(0, weights.urgency) +
            affected * Math.max(0, weights.affectedPopulation) +
            vulnerable * Math.max(0, weights.vulnerablePopulation);

        return Math.round((score / totalWeight) * 100);
    }

    function isClosedStatus(status) {
        const normalized = normalizeStatus(status);

        return (
            normalized.includes("resolved") ||
            normalized.includes("closed") ||
            normalized.includes("completed") ||
            normalized.includes("cancelled")
        );
    }

    function isPriorityLocation(location) {
        const status = normalizeStatus(location.status);

        return (
            getPriorityScore(location) >= CONFIG.PRIORITY_SCORE ||
            status.includes("critical") ||
            status.includes("emergency")
        );
    }

    /* =====================================================
       5. INCIDENTS
    ===================================================== */

    function getIncidents() {
        if (Array.isArray(STATE.scenario?.incidents)) {
            return STATE.scenario.incidents;
        }

        /*
         * If the scenario has no separate incidents array,
         * derive incidents from locations.
         *
         * "unserved" is included because those locations
         * still require emergency assistance.
         */

        return getLocations()
            .filter(location => {
                const status = normalizeStatus(location.status);

                return (
                    location.incident === true ||
                    location.hasIncident === true ||
                    status.includes("unserved") ||
                    status.includes("active") ||
                    status.includes("critical") ||
                    status.includes("emergency") ||
                    status.includes("ongoing") ||
                    status.includes("warning") ||
                    status.includes("flood")
                );
            })
            .map(location => ({
                ...location,

                incidentId:
                    location.incidentId ??
                    location.id,

                title:
                    location.incidentTitle ??
                    location.incidentType ??
                    location.type ??
                    location.name ??
                    "Reported incident",

                locationName:
                    location.locationName ??
                    location.name ??
                    "Unknown location",

                status:
                    location.status ??
                    "Active",

                priorityScore:
                    getPriorityScore(location)
            }));
    }

    /* =====================================================
       6. RESOURCE INVENTORY
    ===================================================== */

    function getResources(item) {
        if (!item || typeof item !== "object") {
            return {};
        }

        const resources =
            item.resources ??
            item.availableResources ??
            item.inventory ??
            {};

        if (Array.isArray(resources)) {
            const result = {};

            resources.forEach(resource => {
                if (!resource || typeof resource !== "object") {
                    return;
                }

                const name =
                    resource.type ??
                    resource.id ??
                    resource.name ??
                    resource.resourceType;

                if (!name) {
                    return;
                }

                result[String(name)] =
                    resource.available ??
                    resource.quantity ??
                    resource.count ??
                    resource.total ??
                    0;
            });

            return result;
        }

        if (typeof resources === "object") {
            return resources;
        }

        return {};
    }

    function getResourceValue(value) {
        if (value && typeof value === "object") {
            return toNumber(
                value.available ??
                value.quantity ??
                value.count ??
                value.total
            );
        }

        return toNumber(value);
    }

    function getResourceTotals() {
        const totals = {};

        getHubs().forEach(hub => {
            const resources = getResources(hub);

            Object.entries(resources).forEach(([name, value]) => {
                totals[name] =
                    (totals[name] || 0) +
                    Math.max(0, getResourceValue(value));
            });
        });

        return totals;
    }

    function getResourceDefinitions() {
        const definitions = STATE.scenario?.resourceTypes;

        if (!Array.isArray(definitions)) {
            return [];
        }

        return definitions.map(item => {
            if (typeof item === "string") {
                return {
                    id: item,
                    name: item
                };
            }

            return {
                id: String(
                    item.id ??
                    item.type ??
                    item.name ??
                    "resource"
                ),

                name:
                    item.name ??
                    item.label ??
                    item.displayName ??
                    item.type ??
                    item.id ??
                    "Resource"
            };
        });
    }

    function getMatchingResourceTotal(totals, resourceId) {
        const target = String(resourceId).toLowerCase();

        const matchingKey = Object.keys(totals).find(
            key => key.toLowerCase() === target
        );

        return matchingKey
            ? getResourceValue(totals[matchingKey])
            : 0;
    }

    /* =====================================================
       7. DASHBOARD KPI CARDS
    ===================================================== */

    function renderKPIs() {
        const incidents = getIncidents();
        const activeIncidents = incidents.filter(
            incident => !isClosedStatus(incident.status)
        );

        const priorityLocations = getLocations().filter(
            isPriorityLocation
        );

        const resourceTotals = getResourceTotals();

        const availableResources = Object.values(resourceTotals)
            .reduce(
                (sum, value) =>
                    sum + Math.max(0, getResourceValue(value)),
                0
            );

        setText("totalIncidents", formatNumber(incidents.length));

        setText(
            "activeIncidents",
            formatNumber(activeIncidents.length)
        );

        setText(
            "priorityLocations",
            formatNumber(priorityLocations.length)
        );

        setText(
            "availableResources",
            formatNumber(availableResources)
        );

        setText(
            "incidentNavCount",
            formatNumber(activeIncidents.length)
        );

        console.info("AvertIQ KPI data:", {
            totalIncidents: incidents.length,
            activeIncidents: activeIncidents.length,
            priorityLocations: priorityLocations.length,
            resourceInventoryUnits: availableResources
        });
    }

    /* =====================================================
       8. PRIORITY INCIDENTS
    ===================================================== */

    function renderIncidents() {
        const container = getElement("priorityIncidentList");
        const emptyState = getElement("incidentEmptyState");

        if (!container) {
            return;
        }

        const incidents = getIncidents()
            .filter(incident => !isClosedStatus(incident.status))
            .sort(
                (a, b) =>
                    getPriorityScore(b) - getPriorityScore(a)
            )
            .slice(0, 6);

        if (!incidents.length) {
            container.replaceChildren();
            setVisible(emptyState, true);
            return;
        }

        setVisible(emptyState, false);

        container.innerHTML = incidents.map(incident => {
            const title =
                incident.title ??
                incident.incidentType ??
                incident.type ??
                incident.name ??
                "Reported incident";

            const location =
                incident.locationName ??
                incident.location ??
                incident.name ??
                "Location not specified";

            const status = incident.status ?? "Active";
            const priority = getPriorityScore(incident);

            const category = getStatusClass(
                priority >= 80
                    ? "critical"
                    : priority >= 60
                        ? "high"
                        : status
            );

            const timestamp =
                incident.reportedAt ??
                incident.createdAt ??
                incident.timestamp ??
                incident.time;

            return `
                <article class="incident-item">
                    <div class="incident-icon ${category}">
                        <i class="fa-solid fa-triangle-exclamation"
                           aria-hidden="true"></i>
                    </div>

                    <div class="incident-content">
                        <h4 class="incident-title">
                            ${escapeHTML(title)}
                        </h4>

                        <p class="incident-location">
                            <i class="fa-solid fa-location-dot"
                               aria-hidden="true"></i>
                            ${escapeHTML(location)}
                        </p>

                        <div class="incident-meta">
                            <span class="status-badge ${category}">
                                ${escapeHTML(status)}
                            </span>

                            <span>
                                Priority: ${formatNumber(priority)}/100
                            </span>

                            <span>
                                ${escapeHTML(formatDate(timestamp))}
                            </span>
                        </div>
                    </div>
                </article>
            `;
        }).join("");
    }

    /* =====================================================
       9. PRIORITY LOCATIONS
    ===================================================== */

    function renderPriorityLocations() {
        const container = getElement("priorityLocationList");
        const emptyState = getElement("locationsEmptyState");

        if (!container) {
            return;
        }

        const locations = getLocations()
            .filter(isPriorityLocation)
            .sort(
                (a, b) =>
                    getPriorityScore(b) - getPriorityScore(a)
            )
            .slice(0, 6);

        if (!locations.length) {
            container.replaceChildren();
            setVisible(emptyState, true);
            return;
        }

        setVisible(emptyState, false);

        container.innerHTML = locations.map(location => {
            const name =
                location.name ??
                location.locationName ??
                location.id ??
                "Unknown location";

            const region =
                location.region ??
                location.district ??
                location.state ??
                location.address ??
                STATE.scenario?.region ??
                "Region not specified";

            const score = getPriorityScore(location);
            const status = location.status ?? "Priority";

            const category = getStatusClass(
                score >= 80
                    ? "critical"
                    : score >= 60
                        ? "high"
                        : status
            );

            return `
                <article class="priority-location-item">
                    <div class="priority-location-content">
                        <div class="priority-location-title-row">
                            <h4 class="priority-location-title">
                                ${escapeHTML(name)}
                            </h4>

                            <span class="status-badge ${category}">
                                ${escapeHTML(status)}
                            </span>
                        </div>

                        <p class="priority-location-meta">
                            <i class="fa-solid fa-location-dot"
                               aria-hidden="true"></i>
                            ${escapeHTML(region)}
                        </p>

                        <div class="priority-location-score">
                            <span>Priority score</span>
                            <strong>${formatNumber(score)}/100</strong>
                        </div>
                    </div>
                </article>
            `;
        }).join("");
    }

    /* =====================================================
       10. RESOURCE AVAILABILITY CHART
    ===================================================== */

    function renderResourceChart() {
        const canvas = getElement("resourceChart");
        const summary = getElement("resourceSummary");

        if (!canvas) {
            return;
        }

        if (typeof Chart === "undefined") {
            console.warn("Chart.js is unavailable.");

            if (summary) {
                summary.textContent =
                    "Resource chart could not be loaded.";
            }

            setOperationsStatus(
                "analyticsServiceStatus",
                "Unavailable"
            );

            return;
        }

        const totals = getResourceTotals();
        const definitions = getResourceDefinitions();

        let labels;
        let values;

        if (definitions.length) {
            labels = definitions.map(item => item.name);

            values = definitions.map(item =>
                getMatchingResourceTotal(totals, item.id)
            );
        } else {
            labels = Object.keys(totals);
            values = Object.values(totals).map(getResourceValue);
        }

        if (STATE.resourceChart) {
            STATE.resourceChart.destroy();
            STATE.resourceChart = null;
        }

        STATE.resourceChart = new Chart(canvas, {
            type: "bar",

            data: {
                labels,

                datasets: [{
                    label: "Available resources",
                    data: values,
                    borderWidth: 1,
                    borderRadius: 6,

                    backgroundColor: labels.map((_, index) => {
                        const palette = [
                            "#2e7d32",
                            "#43a047",
                            "#66bb6a",
                            "#81c784",
                            "#1565c0",
                            "#0288d1",
                            "#00897b",
                            "#7b1fa2"
                        ];

                        return palette[index % palette.length];
                    })
                }]
            },

            options: {
                responsive: true,
                maintainAspectRatio: false,

                plugins: {
                    legend: {
                        display: false
                    },

                    tooltip: {
                        callbacks: {
                            label(context) {
                                return (
                                    " Available: " +
                                    formatNumber(context.raw)
                                );
                            }
                        }
                    }
                },

                scales: {
                    y: {
                        beginAtZero: true,

                        ticks: {
                            precision: 0
                        }
                    },

                    x: {
                        grid: {
                            display: false
                        }
                    }
                }
            }
        });

        if (summary) {
            if (!labels.length) {
                summary.textContent =
                    "No resource inventory is available.";
            } else {
                const total = values.reduce(
                    (sum, value) => sum + toNumber(value),
                    0
                );

                summary.textContent =
                    `${formatNumber(total)} inventory units across ` +
                    `${getHubs().length} resource hubs.`;
            }
        }

        setOperationsStatus(
            "analyticsServiceStatus",
            "Operational"
        );
    }

    /* =====================================================
       11. OPERATIONS STATUS
    ===================================================== */

    function setOperationsStatus(id, status) {
        const element = getElement(id);

        if (!element) {
            return;
        }

        element.textContent = status;

        element.classList.remove(
            "operational",
            "warning",
            "offline",
            "status-online",
            "status-warning",
            "status-offline"
        );

        const normalized = normalizeStatus(status);

        if (
            normalized.includes("operational") ||
            normalized.includes("online") ||
            normalized.includes("connected")
        ) {
            element.classList.add("operational");
        } else if (
            normalized.includes("demo") ||
            normalized.includes("simulation") ||
            normalized.includes("ready")
        ) {
            element.classList.add("warning");
        } else if (
            normalized.includes("warning") ||
            normalized.includes("partial") ||
            normalized.includes("limited")
        ) {
            element.classList.add("warning");
        } else {
            element.classList.add("offline");
        }
    }

    function renderOperationsStatus() {
        setOperationsStatus(
            "dataServiceStatus",
            STATE.scenario ? "Demo data loaded" : "Unavailable"
        );

        setOperationsStatus(
            "locationServiceStatus",
            STATE.map ? "Map ready" : "Unavailable"
        );

        setOperationsStatus(
            "analyticsServiceStatus",
            typeof Chart !== "undefined"
                ? "Charts ready"
                : "Unavailable"
        );

        setOperationsStatus(
            "systemStatus",
            STATE.scenario ? "Simulation mode" : "Unavailable"
        );
    }

    /* =====================================================
       12. ROAD CONNECTIVITY
    ===================================================== */

    function resolveRoadPoint(point, knownPoints) {
        if (point && typeof point === "object") {
            const coordinates = getCoordinates(point);

            if (coordinates) {
                return coordinates;
            }

            point =
                point.id ??
                point.locationId ??
                point.hubId ??
                point.from ??
                point.to;
        }

        if (point === undefined || point === null) {
            return null;
        }

        const match = knownPoints.find(item =>
            String(item.id) === String(point)
        );

        return match ? getCoordinates(match) : null;
    }

    function isRoadBlocked(road) {
        return road.blocked === true || road.closed === true;
    }

    function getRoadEndpointIds(road) {
        const from =
            road.from ??
            road.source ??
            road.start ??
            road.origin ??
            road.fromLocation;

        const to =
            road.to ??
            road.target ??
            road.end ??
            road.destination ??
            road.toLocation;

        function getId(value) {
            if (value && typeof value === "object") {
                return (
                    value.id ??
                    value.locationId ??
                    value.hubId ??
                    null
                );
            }

            return value ?? null;
        }

        return {
            from: getId(from),
            to: getId(to)
        };
    }

    function getConnectivitySummary() {
        const adjacency = new Map();

        [...getLocations(), ...getHubs()].forEach(point => {
            if (point.id !== undefined && point.id !== null) {
                adjacency.set(String(point.id), []);
            }
        });

        getRoads().forEach(road => {
            if (isRoadBlocked(road)) {
                return;
            }

            const { from, to } = getRoadEndpointIds(road);

            if (from == null || to == null) {
                return;
            }

            const fromId = String(from);
            const toId = String(to);

            if (!adjacency.has(fromId)) {
                adjacency.set(fromId, []);
            }

            if (!adjacency.has(toId)) {
                adjacency.set(toId, []);
            }

            adjacency.get(fromId).push(toId);
            adjacency.get(toId).push(fromId);
        });

        const reachable = new Set();
        const queue = [];

        getHubs().forEach(hub => {
            if (hub.id == null) {
                return;
            }

            const id = String(hub.id);

            if (!reachable.has(id)) {
                reachable.add(id);
                queue.push(id);
            }
        });

        while (queue.length) {
            const current = queue.shift();

            (adjacency.get(current) || []).forEach(next => {
                if (!reachable.has(next)) {
                    reachable.add(next);
                    queue.push(next);
                }
            });
        }

        const locations = getLocations();

        const reachableLocations = locations.filter(location =>
            location.id != null &&
            reachable.has(String(location.id))
        );

        return {
            totalLocations: locations.length,
            reachableLocations: reachableLocations.length,
            unreachableLocations:
                locations.length - reachableLocations.length
        };
    }

    /* =====================================================
       13. RECOMMENDATIONS
    ===================================================== */

    function generateRecommendations() {
        const configured =
            STATE.scenario?.recommendations;

        if (Array.isArray(configured)) {
            return configured;
        }

        const recommendations = [];

        const priorityLocations = getLocations()
            .filter(isPriorityLocation);

        const activeIncidents = getIncidents()
            .filter(incident => !isClosedStatus(incident.status));

        const hubs = getHubs();
        const connectivity = getConnectivitySummary();

        if (priorityLocations.length) {
            recommendations.push({
                title: "Review priority locations",

                description:
                    `${priorityLocations.length} locations have ` +
                    "high priority scores. Verify their needs and " +
                    "review resource requirements.",

                icon: "fa-triangle-exclamation",
                type: "warning"
            });
        }

        if (activeIncidents.length) {
            recommendations.push({
                title: "Monitor unresolved incidents",

                description:
                    `${activeIncidents.length} incident records remain ` +
                    "unresolved. Confirm current conditions before " +
                    "planning any response.",

                icon: "fa-tower-broadcast",
                type: "warning"
            });
        }

        const blockedRoads = getRoads()
            .filter(isRoadBlocked);

        if (blockedRoads.length) {
            recommendations.push({
                title: "Review blocked road routes",

                description:
                    `${blockedRoads.length} roads are marked blocked. ` +
                    "Review alternative routes before assigning resources.",

                icon: "fa-road",
                type: "warning"
            });
        }

        if (connectivity.unreachableLocations > 0) {
            recommendations.push({
                title: "Check location connectivity",

                description:
                    `${connectivity.unreachableLocations} locations are ` +
                    "not reachable from the resource hubs through the " +
                    "currently defined open roads.",

                icon: "fa-route",
                type: "warning"
            });
        }

        if (!hubs.length) {
            recommendations.push({
                title: "Configure resource hubs",

                description:
                    "No resource hubs are defined. Add verified hub " +
                    "locations and inventory before planning dispatch.",

                icon: "fa-warehouse",
                type: "info"
            });
        }

        if (!recommendations.length) {
            recommendations.push({
                title: "Continue monitoring",

                description:
                    "Review the scenario regularly and keep incident, " +
                    "road and resource information updated.",

                icon: "fa-circle-check",
                type: "success"
            });
        }

        return recommendations;
    }

    function renderRecommendations() {
        const container = getElement("recommendationList");
        const emptyState = getElement("recommendationsEmptyState");

        if (!container) {
            return;
        }

        const recommendations = generateRecommendations();

        if (!recommendations.length) {
            container.replaceChildren();
            setVisible(emptyState, true);
            return;
        }

        setVisible(emptyState, false);

        container.innerHTML = recommendations
            .slice(0, 8)
            .map(recommendation => {
                const title =
                    typeof recommendation === "string"
                        ? recommendation
                        : (
                            recommendation.title ??
                            recommendation.name ??
                            "Recommendation"
                        );

                const description =
                    typeof recommendation === "string"
                        ? ""
                        : (
                            recommendation.description ??
                            recommendation.message ??
                            recommendation.details ??
                            ""
                        );

                const icon =
                    typeof recommendation === "object"
                        ? recommendation.icon ?? "fa-lightbulb"
                        : "fa-lightbulb";

                const type =
                    typeof recommendation === "object"
                        ? recommendation.type ?? "info"
                        : "info";

                return `
                    <article class="recommendation-item ${escapeHTML(type)}">
                        <div class="recommendation-icon">
                            <i class="fa-solid ${escapeHTML(icon)}"
                               aria-hidden="true"></i>
                        </div>

                        <div class="recommendation-content">
                            <h4>${escapeHTML(title)}</h4>
                            <p>${escapeHTML(description)}</p>
                        </div>
                    </article>
                `;
            })
            .join("");
    }

    /* =====================================================
       14. RECENT ACTIVITY
    ===================================================== */

    function renderRecentActivity() {
        const container = getElement("recentActivityList");

        if (!container) {
            return;
        }

        const activity =
            STATE.scenario?.activity ??
            STATE.scenario?.recentActivity ??
            STATE.scenario?.activities ??
            [];

        if (!Array.isArray(activity) || !activity.length) {
            container.innerHTML = `
                <div class="activity-empty-state">
                    <i class="fa-regular fa-clock"
                       aria-hidden="true"></i>

                    <p>
                        No recent activity is available in this scenario.
                    </p>
                </div>
            `;

            return;
        }

        container.innerHTML = activity
            .slice(0, 8)
            .map(item => {
                const title =
                    typeof item === "string"
                        ? item
                        : (
                            item.title ??
                            item.action ??
                            item.event ??
                            item.message ??
                            "Activity update"
                        );

                const description =
                    typeof item === "object"
                        ? item.description ?? item.details ?? ""
                        : "";

                const timestamp =
                    typeof item === "object"
                        ? (
                            item.timestamp ??
                            item.createdAt ??
                            item.time
                        )
                        : null;

                return `
                    <article class="activity-item">
                        <div class="activity-icon">
                            <i class="fa-solid fa-clock-rotate-left"
                               aria-hidden="true"></i>
                        </div>

                        <div class="activity-content">
                            <h4>${escapeHTML(title)}</h4>

                            ${
                                description
                                    ? `<p>${escapeHTML(description)}</p>`
                                    : ""
                            }

                            <span class="activity-time">
                                ${escapeHTML(formatDate(timestamp))}
                            </span>
                        </div>
                    </article>
                `;
            })
            .join("");
    }

    /* =====================================================
       15. MAP INITIALIZATION
    ===================================================== */

    function initializeMap() {
        const mapElement = getElement("dashboardMap");

        if (!mapElement) {
            console.warn("Map element #dashboardMap not found.");
            return false;
        }

        if (typeof L === "undefined") {
            console.error("Leaflet is unavailable.");

            setOperationsStatus(
                "locationServiceStatus",
                "Unavailable"
            );

            return false;
        }

        if (STATE.map) {
            return true;
        }

        try {
            const mapSettings = STATE.scenario?.map;
            const center = mapSettings?.center;

            const mapCenter =
                center &&
                Number.isFinite(Number(center.latitude)) &&
                Number.isFinite(Number(center.longitude))
                    ? [
                        Number(center.latitude),
                        Number(center.longitude)
                    ]
                    : CONFIG.MAP_CENTER;

            const mapZoom = toNumber(
                mapSettings?.zoom,
                CONFIG.MAP_ZOOM
            );

            STATE.map = L.map(mapElement, {
                zoomControl: true,
                scrollWheelZoom: true
            }).setView(mapCenter, mapZoom);

            L.tileLayer(CONFIG.MAP_TILE_URL, {
                attribution: CONFIG.MAP_TILE_ATTRIBUTION,
                maxZoom: 19
            }).addTo(STATE.map);

            STATE.markerLayer = L.layerGroup()
                .addTo(STATE.map);

            STATE.roadLayer = L.layerGroup()
                .addTo(STATE.map);

            window.dashboardMap = STATE.map;

            setOperationsStatus(
                "locationServiceStatus",
                "Operational"
            );

            setTimeout(() => {
                if (STATE.map) {
                    STATE.map.invalidateSize();
                }
            }, 200);

            return true;
        } catch (error) {
            console.error("Map initialization failed:", error);

            setOperationsStatus(
                "locationServiceStatus",
                "Unavailable"
            );

            return false;
        }
    }

    /* =====================================================
       16. MAP MARKERS
    ===================================================== */

    function getMarkerColor(item) {
        const score = getPriorityScore(item);
        const status = normalizeStatus(item.status);

        if (
            score >= 80 ||
            status.includes("critical") ||
            status.includes("emergency")
        ) {
            return "#dc2626";
        }

        if (
            score >= CONFIG.PRIORITY_SCORE ||
            status.includes("high") ||
            status.includes("warning")
        ) {
            return "#f59e0b";
        }

        if (
            status.includes("resolved") ||
            status.includes("safe")
        ) {
            return "#16a34a";
        }

        return "#2563eb";
    }

    function createMapMarker(item, kind) {
        const coordinates = getCoordinates(item);

        if (!coordinates || !STATE.markerLayer) {
            return null;
        }

        const name =
            item.name ??
            item.locationName ??
            item.title ??
            item.id ??
            kind;

        const status = item.status ?? "Not specified";

        const isHub = kind === "hub";

        const iconClass = isHub
            ? "fa-warehouse"
            : "fa-location-dot";

        const marker = L.circleMarker(coordinates, {
            radius: isHub ? 8 : 7,
            color: "#ffffff",
            weight: 2,
            fillColor: isHub
                ? "#0f766e"
                : getMarkerColor(item),
            fillOpacity: 0.95
        });

        const priority = getPriorityScore(item);

        const affected = toNumber(item.affectedPopulation);
        const vulnerable = toNumber(item.vulnerablePopulation);

        marker.bindPopup(`
            <div class="map-popup">
                <strong>
                    <i class="fa-solid ${iconClass}"
                       aria-hidden="true"></i>
                    ${escapeHTML(name)}
                </strong>

                <p>
                    Type:
                    ${isHub ? "Resource hub" : "Location"}
                </p>

                <p>
                    Status: ${escapeHTML(status)}
                </p>

                ${
                    !isHub
                        ? `
                            <p>Priority: ${formatNumber(priority)}/100</p>
                            <p>Severity: ${formatNumber(item.severity)}/5</p>
                            <p>Urgency: ${formatNumber(item.urgency)}/5</p>
                            <p>Affected population: ${formatNumber(affected)}</p>
                            <p>Vulnerable population: ${formatNumber(vulnerable)}</p>
                        `
                        : ""
                }
            </div>
        `);

        marker.addTo(STATE.markerLayer);

        return marker;
    }

    /* =====================================================
       17. ROAD RENDERING
    ===================================================== */

    function renderRoads() {
        if (!STATE.roadLayer || typeof L === "undefined") {
            return;
        }

        STATE.roadLayer.clearLayers();

        const knownPoints = [
            ...getLocations(),
            ...getHubs()
        ];

        getRoads().forEach(road => {
            const blocked = isRoadBlocked(road);

            const style = {
                color: blocked ? "#dc2626" : "#16a34a",
                weight: blocked ? 4 : 3,
                opacity: 0.85,
                dashArray: blocked ? "7 6" : null
            };

            /*
             * Direct coordinates:
             * [[longitude, latitude], ...]
             */

            if (
                Array.isArray(road.coordinates) &&
                road.coordinates.length >= 2
            ) {
                const points = road.coordinates
                    .map(coordinate => {
                        if (
                            Array.isArray(coordinate) &&
                            coordinate.length >= 2
                        ) {
                            const longitude = Number(coordinate[0]);
                            const latitude = Number(coordinate[1]);

                            if (
                                Number.isFinite(latitude) &&
                                Number.isFinite(longitude) &&
                                latitude >= -90 &&
                                latitude <= 90 &&
                                longitude >= -180 &&
                                longitude <= 180
                            ) {
                                return [latitude, longitude];
                            }

                            return null;
                        }

                        return getCoordinates(coordinate);
                    })
                    .filter(Boolean);

                if (points.length >= 2) {
                    L.polyline(points, style)
                        .bindPopup(
                            `${escapeHTML(road.name ?? road.id ?? "Road")} — ` +
                            `${blocked ? "Blocked" : "Open"}`
                        )
                        .addTo(STATE.roadLayer);
                }

                return;
            }

            const start =
                road.from ??
                road.source ??
                road.start ??
                road.origin ??
                road.fromLocation;

            const end =
                road.to ??
                road.target ??
                road.destination ??
                road.end ??
                road.toLocation;

            const startCoordinates = resolveRoadPoint(
                start,
                knownPoints
            );

            const endCoordinates = resolveRoadPoint(
                end,
                knownPoints
            );

            if (!startCoordinates || !endCoordinates) {
                console.warn(
                    "Road endpoints could not be resolved:",
                    road.id ?? road.name ?? road
                );

                return;
            }

            L.polyline(
                [startCoordinates, endCoordinates],
                style
            )
                .bindPopup(
                    `${escapeHTML(road.name ?? road.id ?? "Road")} — ` +
                    `${blocked ? "Blocked" : "Open"}`
                )
                .addTo(STATE.roadLayer);
        });
    }

    /* =====================================================
       18. MAP UPDATE
    ===================================================== */

    function renderMap() {
        if (!initializeMap()) {
            return;
        }

        STATE.markerLayer.clearLayers();

        const locations = getLocations();
        const hubs = getHubs();

        locations.forEach(location => {
            createMapMarker(location, "location");
        });

        hubs.forEach(hub => {
            createMapMarker(hub, "hub");
        });

        renderRoads();

        const allCoordinates = [
            ...locations,
            ...hubs
        ]
            .map(getCoordinates)
            .filter(Boolean);

        const mapSettings = STATE.scenario?.map;
        const center = mapSettings?.center;

        const defaultCenter =
            center &&
            Number.isFinite(Number(center.latitude)) &&
            Number.isFinite(Number(center.longitude))
                ? [
                    Number(center.latitude),
                    Number(center.longitude)
                ]
                : CONFIG.MAP_CENTER;

        const defaultZoom = toNumber(
            mapSettings?.zoom,
            CONFIG.MAP_ZOOM
        );

        if (allCoordinates.length > 1) {
            STATE.map.fitBounds(
                L.latLngBounds(allCoordinates),
                {
                    padding: [35, 35],
                    maxZoom: 11
                }
            );
        } else if (allCoordinates.length === 1) {
            STATE.map.setView(allCoordinates[0], 10);
        } else {
            STATE.map.setView(defaultCenter, defaultZoom);
        }

        window.dashboardMap = STATE.map;

        setOperationsStatus(
            "locationServiceStatus",
            "Operational"
        );

        setTimeout(() => {
            if (STATE.map) {
                STATE.map.invalidateSize();
            }
        }, 100);
    }

    /* =====================================================
       19. SCENARIO VALIDATION
    ===================================================== */

    function validateScenario(data) {
        if (
            !data ||
            typeof data !== "object" ||
            Array.isArray(data)
        ) {
            throw new Error(
                "Scenario file must contain a JSON object."
            );
        }

        ["locations", "hubs", "roads"].forEach(key => {
            if (!Array.isArray(data[key])) {
                throw new Error(
                    `Scenario field "${key}" must be an array.`
                );
            }
        });

        if (
            data.incidents !== undefined &&
            !Array.isArray(data.incidents)
        ) {
            throw new Error(
                'Scenario field "incidents" must be an array.'
            );
        }

        if (
            data.resourceTypes !== undefined &&
            !Array.isArray(data.resourceTypes)
        ) {
            throw new Error(
                'Scenario field "resourceTypes" must be an array.'
            );
        }

        return data;
    }

    /* =====================================================
       20. DASHBOARD ERROR HANDLING
    ===================================================== */

    function renderDashboardError(message) {
        const mapElement = getElement("dashboardMap");

        let errorBox = getElement("dashboardDataError");

        if (!errorBox && mapElement) {
            errorBox = document.createElement("div");

            errorBox.id = "dashboardDataError";

            errorBox.style.cssText = [
                "margin:12px",
                "padding:16px",
                "border-radius:10px",
                "background:#fef2f2",
                "color:#991b1b",
                "font-size:14px"
            ].join(";");

            mapElement.parentElement?.appendChild(errorBox);
        }

        if (errorBox) {
            errorBox.textContent = message;
        }

        setOperationsStatus(
            "dataServiceStatus",
            "Unavailable"
        );

        setOperationsStatus(
            "systemStatus",
            "Unavailable"
        );
    }

    function clearDashboardError() {
        const errorBox = getElement("dashboardDataError");

        if (errorBox) {
            errorBox.remove();
        }
    }

    /* =====================================================
       21. LOAD SCENARIO JSON
    ===================================================== */

    async function fetchScenario() {
        const response = await fetch(CONFIG.SCENARIO_URL, {
            method: "GET",

            headers: {
                Accept: "application/json"
            },

            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(
                `Unable to load scenario JSON. HTTP ${response.status}`
            );
        }

        const data = await response.json();

        return validateScenario(data);
    }

    /* =====================================================
       22. RENDER DASHBOARD
    ===================================================== */

    function renderDashboard() {
        renderKPIs();

        renderIncidents();

        renderPriorityLocations();

        renderResourceChart();

        renderRecommendations();

        renderRecentActivity();

        renderMap();

        renderOperationsStatus();

        STATE.lastLoadedAt = new Date();

        console.info(
            "AvertIQ dashboard rendered:",
            STATE.lastLoadedAt.toLocaleTimeString()
        );
    }

    /* =====================================================
       23. LOAD / REFRESH DASHBOARD
    ===================================================== */

    async function loadDashboard(options = {}) {
        if (STATE.loading) {
            return;
        }

        STATE.loading = true;

        try {
            const scenario = await fetchScenario();

            STATE.scenario = scenario;

            clearDashboardError();

            renderDashboard();

            if (options.showToast) {
                showToast(
                    "Dashboard data refreshed successfully.",
                    "success"
                );
            }
        } catch (error) {
            console.error(
                "AvertIQ dashboard loading error:",
                error
            );

            renderDashboardError(
                "Unable to load dashboard data. Verify that " +
                "frontend/assets/data/disaster-scenario.json exists " +
                "and the project is running through a local web server."
            );

            if (options.showToast) {
                showToast(
                    "Dashboard refresh failed. Check the scenario JSON and server.",
                    "error"
                );
            }
        } finally {
            STATE.loading = false;
        }
    }

    async function refreshDashboard() {
        return loadDashboard({
            showToast: true
        });
    }

    /* =====================================================
       24. AUTO REFRESH
    ===================================================== */

    function startAutoRefresh() {
        if (STATE.refreshTimer) {
            clearInterval(STATE.refreshTimer);
        }

        STATE.refreshTimer = setInterval(() => {
            if (!document.hidden) {
                loadDashboard();
            }
        }, CONFIG.REFRESH_INTERVAL);
    }

    /* =====================================================
       25. PUBLIC API
    ===================================================== */

    window.loadDashboard = loadDashboard;

    window.refreshDashboard = refreshDashboard;

    window.AvertIQDashboard = {
        load: loadDashboard,

        refresh: refreshDashboard,

        getScenario() {
            return STATE.scenario;
        },

        getLastLoadedAt() {
            return STATE.lastLoadedAt;
        },

        getMap() {
            return STATE.map;
        },

        getPriorityScore,

        getIncidents,

        getResourceTotals,

        getConnectivitySummary
    };

    /* =====================================================
       26. INITIALIZATION
    ===================================================== */

    function initializeDashboard() {
        console.info("Initializing AvertIQ dashboard...");

        initializeMap();

        loadDashboard();

        startAutoRefresh();
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            initializeDashboard,
            { once: true }
        );
    } else {
        initializeDashboard();
    }

})();
