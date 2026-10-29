"use strict";

/* =========================================================
   AVERTIQ — ANALYTICS ENGINE
   File: frontend/js/analytics.js

   Data source:
   ../assets/data/disaster-scenario.json

   Note:
   This dashboard uses simulated data for demonstration.
========================================================= */

(function () {
    const SCENARIO_URL = "../assets/data/disaster-scenario.json";

    const elements = {
        message: document.getElementById("analyticsMessage"),

        affectedPopulation: document.getElementById(
            "analyticsAffectedPopulation"
        ),

        vulnerablePopulation: document.getElementById(
            "analyticsVulnerablePopulation"
        ),

        criticalLocations: document.getElementById(
            "analyticsCriticalLocations"
        ),

        blockedRoads: document.getElementById(
            "analyticsBlockedRoads"
        ),

        severityChart: document.getElementById("severityChart"),
        populationChart: document.getElementById("populationChart"),
        resourceChart: document.getElementById("resourceDemandChart"),
        hubChart: document.getElementById("hubInventoryChart"),

        insights: document.getElementById("analyticsInsights"),
        locationBody: document.getElementById("analyticsLocationBody"),

        refreshButton: document.getElementById("refreshAnalytics"),
        refreshDataButton: document.getElementById("refreshAnalyticsData")
    };

    let scenarioData = null;
    let charts = {};
    let refreshInProgress = false;


    /* =====================================================
       1. GENERAL HELPERS
    ===================================================== */

    function formatNumber(value) {
        const number = Number(value);

        if (!Number.isFinite(number)) {
            return "0";
        }

        return new Intl.NumberFormat("en-IN", {
            maximumFractionDigits: 1
        }).format(number);
    }


    function safeNumber(value, fallback = 0) {
        const number = Number(value);

        return Number.isFinite(number) ? number : fallback;
    }


    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, function (character) {
            const entities = {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;"
            };

            return entities[character];
        });
    }


    function getArray(value) {
        return Array.isArray(value) ? value : [];
    }


    function showMessage(message, type = "info") {
        if (!elements.message) {
            return;
        }

        elements.message.className = "analytics-message " + type;
        elements.message.textContent = message;
    }


    function setLoadingState(isLoading) {
        [
            elements.refreshButton,
            elements.refreshDataButton
        ].forEach(function (button) {
            if (button) {
                button.disabled = isLoading;
                button.style.opacity = isLoading ? "0.65" : "1";
                button.style.cursor = isLoading ? "wait" : "pointer";
            }
        });
    }


    function normalizeSeverity(value) {
        const numeric = Number(value);

        if (
            value !== null &&
            value !== undefined &&
            String(value).trim() !== "" &&
            Number.isFinite(numeric)
        ) {
            if (numeric >= 5) return "Critical";
            if (numeric >= 4) return "High";
            if (numeric >= 3) return "Medium";

            return "Low";
        }

        const text = String(value || "").trim().toLowerCase();

        if (text === "critical") return "Critical";
        if (text === "high") return "High";
        if (text === "medium") return "Medium";
        if (text === "low") return "Low";

        return "Medium";
    }


    function getSeverityValue(location) {
        return safeNumber(
            location.severity ??
            location.severityLevel ??
            location.riskLevel,
            3
        );
    }


    function getUrgencyValue(location) {
        return safeNumber(
            location.urgency ??
            location.urgencyLevel,
            3
        );
    }


    function getAffectedPopulation(location) {
        return Math.max(
            0,
            safeNumber(
                location.affectedPopulation ??
                location.affected ??
                location.population,
                0
            )
        );
    }


    function getVulnerablePopulation(location) {
        return Math.max(
            0,
            safeNumber(
                location.vulnerablePopulation ??
                location.vulnerablePeople ??
                location.vulnerable,
                0
            )
        );
    }


    function getLocationName(location, index) {
        return (
            location.name ||
            location.locationName ||
            location.id ||
            "Location " + (index + 1)
        );
    }


    /* =====================================================
       2. SCENARIO DATA ACCESS
    ===================================================== */

    function getLocations() {
        if (!scenarioData) {
            return [];
        }

        return getArray(
            scenarioData.locations ||
            scenarioData.affectedLocations ||
            scenarioData.disasterLocations
        );
    }


    function getHubs() {
        if (!scenarioData) {
            return [];
        }

        return getArray(
            scenarioData.hubs ||
            scenarioData.reliefHubs ||
            scenarioData.warehouses
        );
    }


    function getRoads() {
        if (!scenarioData) {
            return [];
        }

        return getArray(
            scenarioData.roads ||
            scenarioData.roadNetwork
        );
    }


    function getResourceRequirements(location) {
        return (
            location.requiredResources ||
            location.resourceRequirements ||
            location.resourcesNeeded ||
            {}
        );
    }


    function getHubInventory(hub) {
        return (
            hub.inventory ||
            hub.resources ||
            hub.availableResources ||
            {}
        );
    }


    function getResourceEntries(resourceObject) {
        if (
            !resourceObject ||
            typeof resourceObject !== "object" ||
            Array.isArray(resourceObject)
        ) {
            return [];
        }

        return Object.entries(resourceObject)
            .map(function (entry) {
                let value = entry[1];

                if (
                    value &&
                    typeof value === "object" &&
                    !Array.isArray(value)
                ) {
                    value = value.quantity ?? value.amount ?? value.stock ?? 0;
                }

                return [
                    entry[0],
                    Math.max(0, safeNumber(value, 0))
                ];
            });
    }


    function getResourceLabels(resourceKey) {
        const labels = {
            foodKits: "Food Kits",
            food: "Food Kits",
            food_kits: "Food Kits",

            waterLitres: "Water (L)",
            water: "Water (L)",
            water_litres: "Water (L)",

            medicalKits: "Medical Kits",
            medical: "Medical Kits",
            medical_kits: "Medical Kits",

            rescueBoats: "Rescue Boats",
            rescue: "Rescue Boats",
            rescue_boats: "Rescue Boats",

            shelterUnits: "Shelter Units",
            shelter: "Shelter Units",
            shelter_units: "Shelter Units"
        };

        return labels[resourceKey] || resourceKey
            .replace(/([a-z])([A-Z])/g, "$1 $2")
            .replace(/[_-]/g, " ")
            .replace(/\b\w/g, function (letter) {
                return letter.toUpperCase();
            });
    }


    /* =====================================================
       3. PRIORITY SCORING
    ===================================================== */

    function getPriorityWeights() {
        const settings = scenarioData?.simulationSettings || {};
        const weights = settings.priorityWeights || {};

        return {
            severity: safeNumber(weights.severity, 0.35),
            urgency: safeNumber(weights.urgency, 0.25),
            affectedPopulation: safeNumber(
                weights.affectedPopulation,
                0.20
            ),
            vulnerablePopulation: safeNumber(
                weights.vulnerablePopulation,
                0.20
            )
        };
    }


    function calculatePriorityScore(location) {
        const locations = getLocations();
        const weights = getPriorityWeights();

        const severity = Math.max(
            1,
            Math.min(5, getSeverityValue(location))
        );

        const urgency = Math.max(
            1,
            Math.min(5, getUrgencyValue(location))
        );

        const affectedValues = locations.map(getAffectedPopulation);
        const vulnerableValues = locations.map(getVulnerablePopulation);

        const maxAffected = Math.max(1, ...affectedValues);
        const maxVulnerable = Math.max(1, ...vulnerableValues);

        const normalizedSeverity = (severity / 5) * 100;
        const normalizedUrgency = (urgency / 5) * 100;

        const normalizedAffected =
            (getAffectedPopulation(location) / maxAffected) * 100;

        const normalizedVulnerable =
            (getVulnerablePopulation(location) / maxVulnerable) * 100;

        const weightTotal =
            weights.severity +
            weights.urgency +
            weights.affectedPopulation +
            weights.vulnerablePopulation;

        if (weightTotal <= 0) {
            return 0;
        }

        const weightedScore =
            normalizedSeverity * weights.severity +
            normalizedUrgency * weights.urgency +
            normalizedAffected * weights.affectedPopulation +
            normalizedVulnerable * weights.vulnerablePopulation;

        return Math.round((weightedScore / weightTotal) * 10) / 10;
    }


    /* =====================================================
       4. KPI CALCULATIONS
    ===================================================== */

    function renderKPIs() {
        const locations = getLocations();
        const roads = getRoads();

        const totalAffected = locations.reduce(function (total, location) {
            return total + getAffectedPopulation(location);
        }, 0);

        const totalVulnerable = locations.reduce(function (total, location) {
            return total + getVulnerablePopulation(location);
        }, 0);

        const criticalCount = locations.filter(function (location) {
            return getSeverityValue(location) >= 5;
        }).length;

        const blockedCount = roads.filter(function (road) {
            return (
                road.blocked === true ||
                String(road.status || "").toLowerCase() === "blocked"
            );
        }).length;

        if (elements.affectedPopulation) {
            elements.affectedPopulation.textContent =
                formatNumber(totalAffected);
        }

        if (elements.vulnerablePopulation) {
            elements.vulnerablePopulation.textContent =
                formatNumber(totalVulnerable);
        }

        if (elements.criticalLocations) {
            elements.criticalLocations.textContent =
                formatNumber(criticalCount);
        }

        if (elements.blockedRoads) {
            elements.blockedRoads.textContent =
                formatNumber(blockedCount);
        }
    }


    /* =====================================================
       5. CHART MANAGEMENT
    ===================================================== */

    function destroyChart(chartName) {
        if (charts[chartName]) {
            charts[chartName].destroy();
            delete charts[chartName];
        }
    }


    function createChart(canvas, chartName, config) {
        if (!canvas) {
            return;
        }

        if (typeof window.Chart === "undefined") {
            showMessage(
                "Chart.js could not load. Check your internet connection and refresh.",
                "error"
            );

            return;
        }

        destroyChart(chartName);

        charts[chartName] = new Chart(canvas, config);
    }


    function getCommonChartOptions() {
        return {
            responsive: true,
            maintainAspectRatio: false,

            interaction: {
                intersect: false,
                mode: "index"
            },

            plugins: {
                legend: {
                    position: "bottom",

                    labels: {
                        usePointStyle: true,
                        pointStyle: "circle",
                        boxWidth: 8,
                        boxHeight: 8,
                        padding: 18,
                        color: "#718096",
                        font: {
                            family: "Inter",
                            size: 10,
                            weight: "500"
                        }
                    }
                },

                tooltip: {
                    backgroundColor: "#17263d",
                    titleFont: {
                        family: "Inter",
                        weight: "700"
                    },

                    bodyFont: {
                        family: "Inter",
                        size: 11
                    },

                    padding: 12,
                    cornerRadius: 8
                }
            },

            scales: {
                x: {
                    grid: {
                        display: false
                    },

                    ticks: {
                        color: "#7d899b",
                        font: {
                            family: "Inter",
                            size: 10
                        }
                    },

                    border: {
                        display: false
                    }
                },

                y: {
                    beginAtZero: true,

                    grid: {
                        color: "#edf1f6",
                        drawBorder: false
                    },

                    ticks: {
                        color: "#7d899b",
                        precision: 0,
                        font: {
                            family: "Inter",
                            size: 10
                        }
                    },

                    border: {
                        display: false
                    }
                }
            }
        };
    }


    /* =====================================================
       6. SEVERITY DISTRIBUTION CHART
    ===================================================== */

    function renderSeverityChart() {
        const locations = getLocations();

        const categories = [
            "Critical",
            "High",
            "Medium",
            "Low"
        ];

        const counts = categories.map(function (category) {
            return locations.filter(function (location) {
                return normalizeSeverity(
                    getSeverityValue(location)
                ) === category;
            }).length;
        });

        createChart(elements.severityChart, "severity", {
            type: "doughnut",

            data: {
                labels: categories,

                datasets: [{
                    data: counts,

                    backgroundColor: [
                        "#e5484d",
                        "#f59e0b",
                        "#facc15",
                        "#22a06b"
                    ],

                    borderColor: "#ffffff",
                    borderWidth: 4,
                    hoverOffset: 7
                }]
            },

            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: "66%",

                plugins: {
                    legend: {
                        position: "bottom",

                        labels: {
                            usePointStyle: true,
                            pointStyle: "circle",
                            padding: 18,
                            color: "#718096",
                            font: {
                                family: "Inter",
                                size: 10
                            }
                        }
                    },

                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                return (
                                    " " +
                                    context.label +
                                    ": " +
                                    formatNumber(context.raw) +
                                    " locations"
                                );
                            }
                        }
                    }
                }
            }
        });
    }


    /* =====================================================
       7. POPULATION CHART
    ===================================================== */

    function renderPopulationChart() {
        const locations = getLocations();

        const sortedLocations = [...locations]
            .sort(function (a, b) {
                return getAffectedPopulation(b) -
                    getAffectedPopulation(a);
            })
            .slice(0, 10);

        const options = getCommonChartOptions();

        options.scales.x.ticks.maxRotation = 35;
        options.scales.x.ticks.minRotation = 0;

        options.plugins.tooltip.callbacks = {
            label: function (context) {
                return (
                    " " +
                    context.dataset.label +
                    ": " +
                    formatNumber(context.raw)
                );
            }
        };

        createChart(elements.populationChart, "population", {
            type: "bar",

            data: {
                labels: sortedLocations.map(function (location, index) {
                    return getLocationName(location, index);
                }),

                datasets: [
                    {
                        label: "Affected Population",

                        data: sortedLocations.map(
                            getAffectedPopulation
                        ),

                        backgroundColor: "#3984e8",
                        borderRadius: 5,
                        maxBarThickness: 24
                    },

                    {
                        label: "Vulnerable Population",

                        data: sortedLocations.map(
                            getVulnerablePopulation
                        ),

                        backgroundColor: "#e87979",
                        borderRadius: 5,
                        maxBarThickness: 24
                    }
                ]
            },

            options: options
        });
    }


    /* =====================================================
       8. RESOURCE DEMAND CHART
    ===================================================== */

    function renderResourceDemandChart() {
        const locations = getLocations();
        const hubs = getHubs();

        const demandTotals = {};
        const stockTotals = {};

        locations.forEach(function (location) {
            const requirements = getResourceEntries(
                getResourceRequirements(location)
            );

            requirements.forEach(function (entry) {
                const key = entry[0];

                demandTotals[key] =
                    (demandTotals[key] || 0) + entry[1];
            });
        });

        hubs.forEach(function (hub) {
            const inventory = getResourceEntries(
                getHubInventory(hub)
            );

            inventory.forEach(function (entry) {
                const key = entry[0];

                stockTotals[key] =
                    (stockTotals[key] || 0) + entry[1];
            });
        });

        const resourceKeys = Array.from(
            new Set([
                ...Object.keys(demandTotals),
                ...Object.keys(stockTotals)
            ])
        );

        const options = getCommonChartOptions();

        options.scales.x.ticks.maxRotation = 25;

        options.plugins.tooltip.callbacks = {
            label: function (context) {
                return (
                    " " +
                    context.dataset.label +
                    ": " +
                    formatNumber(context.raw)
                );
            }
        };

        createChart(elements.resourceChart, "resources", {
            type: "bar",

            data: {
                labels: resourceKeys.map(getResourceLabels),

                datasets: [
                    {
                        label: "Available Stock",

                        data: resourceKeys.map(function (key) {
                            return stockTotals[key] || 0;
                        }),

                        backgroundColor: "#16a675",
                        borderRadius: 5,
                        maxBarThickness: 35
                    },

                    {
                        label: "Required Demand",

                        data: resourceKeys.map(function (key) {
                            return demandTotals[key] || 0;
                        }),

                        backgroundColor: "#f0a43c",
                        borderRadius: 5,
                        maxBarThickness: 35
                    }
                ]
            },

            options: options
        });
    }


    /* =====================================================
       9. HUB INVENTORY CHART
    ===================================================== */

    function renderHubInventoryChart() {
        const hubs = getHubs();

        const resourceKeys = Array.from(
            new Set(
                hubs.flatMap(function (hub) {
                    return getResourceEntries(
                        getHubInventory(hub)
                    ).map(function (entry) {
                        return entry[0];
                    });
                })
            )
        );

        const options = getCommonChartOptions();

        options.plugins.tooltip.callbacks = {
            label: function (context) {
                return (
                    " " +
                    context.dataset.label +
                    ": " +
                    formatNumber(context.raw)
                );
            }
        };

        createChart(elements.hubChart, "hubs", {
            type: "bar",

            data: {
                labels: hubs.map(function (hub, index) {
                    return (
                        hub.name ||
                        hub.hubName ||
                        hub.id ||
                        "Hub " + (index + 1)
                    );
                }),

                datasets: resourceKeys.map(function (resourceKey, index) {
                    const colorPalette = [
                        "#3984e8",
                        "#16a675",
                        "#f0a43c",
                        "#8b6edb",
                        "#e87979",
                        "#21a6b7"
                    ];

                    return {
                        label: getResourceLabels(resourceKey),

                        data: hubs.map(function (hub) {
                            const inventory = getHubInventory(hub);
                            const entries = getResourceEntries(inventory);

                            const found = entries.find(function (entry) {
                                return entry[0] === resourceKey;
                            });

                            return found ? found[1] : 0;
                        }),

                        backgroundColor:
                            colorPalette[index % colorPalette.length],

                        borderRadius: 4,
                        maxBarThickness: 28
                    };
                })
            },

            options: options
        });
    }


    /* =====================================================
       10. SCENARIO INSIGHTS
    ===================================================== */

    function createInsightCard(type, icon, title, description) {
        return `
            <article class="analytics-insight-card ${type}">
                <div class="analytics-insight-icon">
                    <i class="${icon}" aria-hidden="true"></i>
                </div>

                <div class="analytics-insight-content">
                    <h3>${escapeHTML(title)}</h3>
                    <p>${escapeHTML(description)}</p>
                </div>
            </article>
        `;
    }


    function renderInsights() {
        if (!elements.insights) {
            return;
        }

        const locations = getLocations();
        const hubs = getHubs();
        const roads = getRoads();

        if (locations.length === 0) {
            elements.insights.innerHTML = `
                <div class="analytics-insight-empty">
                    No location data is available for analysis.
                </div>
            `;

            return;
        }

        const totalAffected = locations.reduce(function (total, location) {
            return total + getAffectedPopulation(location);
        }, 0);

        const totalVulnerable = locations.reduce(function (total, location) {
            return total + getVulnerablePopulation(location);
        }, 0);

        const criticalLocations = locations.filter(function (location) {
            return getSeverityValue(location) >= 5;
        });

        const blockedRoads = roads.filter(function (road) {
            return (
                road.blocked === true ||
                String(road.status || "").toLowerCase() === "blocked"
            );
        });

        const highestPriority = [...locations].sort(function (a, b) {
            return calculatePriorityScore(b) -
                calculatePriorityScore(a);
        })[0];

        const highestName = getLocationName(
            highestPriority,
            locations.indexOf(highestPriority)
        );

        const vulnerableShare = totalAffected > 0
            ? (totalVulnerable / totalAffected) * 100
            : 0;

        const criticalAffected = criticalLocations.reduce(
            function (total, location) {
                return total + getAffectedPopulation(location);
            },
            0
        );

        const insights = [];

        insights.push(
            createInsightCard(
                criticalLocations.length > 0 ? "danger" : "success",
                criticalLocations.length > 0
                    ? "fa-solid fa-triangle-exclamation"
                    : "fa-solid fa-circle-check",

                "Critical Locations",

                criticalLocations.length > 0
                    ? criticalLocations.length +
                        " location(s) have severity level 5, affecting " +
                        formatNumber(criticalAffected) +
                        " people combined."
                    : "No locations have severity level 5 in the current scenario."
            )
        );

        insights.push(
            createInsightCard(
                vulnerableShare >= 30 ? "warning" : "",
                "fa-solid fa-people-group",

                "Vulnerable Population",

                formatNumber(totalVulnerable) +
                    " people are marked as vulnerable. They represent approximately " +
                    vulnerableShare.toFixed(1) +
                    "% of the affected population."
            )
        );

        insights.push(
            createInsightCard(
                blockedRoads.length > 0 ? "warning" : "success",
                "fa-solid fa-road-barrier",

                "Road Accessibility",

                blockedRoads.length > 0
                    ? blockedRoads.length +
                        " road(s) are marked blocked. Check alternative routes before assigning rescue resources."
                    : "No roads are currently marked blocked in the scenario."
            )
        );

        insights.push(
            createInsightCard(
                "danger",
                "fa-solid fa-bullseye",

                "Highest Calculated Priority",

                highestName +
                    " currently has the highest score under the illustrative priority formula: " +
                    calculatePriorityScore(highestPriority).toFixed(1) +
                    " out of 100."
            )
        );

        insights.push(
            createInsightCard(
                hubs.length === 0 ? "warning" : "success",
                "fa-solid fa-warehouse",

                "Relief Infrastructure",

                hubs.length > 0
                    ? hubs.length +
                        " relief hub(s) are included in the loaded scenario. Compare their inventory with location-level demand."
                    : "No relief hubs are available. Add hub data to assess simulated resource availability."
            )
        );

        insights.push(
            createInsightCard(
                "info",
                "fa-solid fa-chart-line",

                "Population Impact",

                formatNumber(totalAffected) +
                    " people are included across " +
                    locations.length +
                    " affected location(s). These values are simulated, not verified field estimates."
            )
        );

        elements.insights.innerHTML = insights.join("");
    }


    /* =====================================================
       11. LOCATION IMPACT TABLE
    ===================================================== */

    function renderLocationTable() {
        if (!elements.locationBody) {
            return;
        }

        const locations = getLocations();

        if (locations.length === 0) {
            elements.locationBody.innerHTML = `
                <tr>
                    <td colspan="6" class="analytics-table-empty">
                        No locations found in the current scenario.
                    </td>
                </tr>
            `;

            return;
        }

        const sortedLocations = [...locations].sort(function (a, b) {
            return calculatePriorityScore(b) -
                calculatePriorityScore(a);
        });

        elements.locationBody.innerHTML = sortedLocations
            .map(function (location) {
                const severityValue = getSeverityValue(location);
                const severity = normalizeSeverity(severityValue);

                const severityClass = severity.toLowerCase();

                const locationName = getLocationName(
                    location,
                    locations.indexOf(location)
                );

                const priority = calculatePriorityScore(location);

                return `
                    <tr>
                        <td>${escapeHTML(locationName)}</td>

                        <td>
                            <span class="analytics-severity-badge ${severityClass}">
                                ${escapeHTML(severity)}
                            </span>
                        </td>

                        <td>${formatNumber(getUrgencyValue(location))}/5</td>

                        <td>${formatNumber(getAffectedPopulation(location))}</td>

                        <td>${formatNumber(getVulnerablePopulation(location))}</td>

                        <td>
                            <span class="analytics-priority-score">
                                ${priority.toFixed(1)}
                            </span>
                        </td>
                    </tr>
                `;
            })
            .join("");
    }


    /* =====================================================
       12. REFRESH AND INITIALIZATION
    ===================================================== */

    async function loadAnalytics() {
        if (refreshInProgress) {
            return;
        }

        refreshInProgress = true;
        setLoadingState(true);

        showMessage("Loading scenario data and calculating analytics...", "info");

        try {
            const response = await fetch(SCENARIO_URL, {
                cache: "no-store"
            });

            if (!response.ok) {
                throw new Error(
                    "Scenario file could not be loaded (HTTP " +
                    response.status +
                    ")."
                );
            }

            const data = await response.json();

            if (!data || typeof data !== "object") {
                throw new Error("The scenario file contains invalid data.");
            }

            scenarioData = data;

            const locations = getLocations();
            const hubs = getHubs();

            if (locations.length === 0) {
                throw new Error(
                    "No affected locations were found in the scenario JSON."
                );
            }

            renderKPIs();

            renderSeverityChart();
            renderPopulationChart();
            renderResourceDemandChart();
            renderHubInventoryChart();

            renderInsights();
            renderLocationTable();

            showMessage(
                "Analytics updated successfully using " +
                    locations.length +
                    " simulated locations and " +
                    hubs.length +
                    " relief hubs.",
                "success"
            );

        } catch (error) {
            console.error("AVERTIQ analytics error:", error);

            showMessage(
                error.message ||
                    "Unable to load analytics. Please try again.",
                "error"
            );

            if (elements.insights) {
                elements.insights.innerHTML = `
                    <div class="analytics-insight-empty">
                        Analytics could not be calculated. Check the scenario JSON
                        file and reload the page.
                    </div>
                `;
            }

            if (elements.locationBody) {
                elements.locationBody.innerHTML = `
                    <tr>
                        <td colspan="6" class="analytics-table-error">
                            Unable to load location analysis.
                        </td>
                    </tr>
                `;
            }

        } finally {
            refreshInProgress = false;
            setLoadingState(false);
        }
    }


    /* =====================================================
       13. EVENT LISTENERS
    ===================================================== */

    if (elements.refreshButton) {
        elements.refreshButton.addEventListener("click", loadAnalytics);
    }

    if (elements.refreshDataButton) {
        elements.refreshDataButton.addEventListener("click", loadAnalytics);
    }


    /* =====================================================
       14. START
    ===================================================== */

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", loadAnalytics);
    } else {
        loadAnalytics();
    }

})();
