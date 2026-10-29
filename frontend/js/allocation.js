"use strict";

/* =========================================================
   AVERTIQ — MULTI-HUB RESOURCE ALLOCATION ENGINE
   File: frontend/js/allocation.js

   Demo simulation only.
   Does not dispatch real emergency resources.

   Features:
   - Priority-based allocation
   - Multi-hub population coverage
   - Dijkstra shortest-path routing
   - Blocked-road avoidance
   - Per-hub resource inventory tracking
   - Unmet-demand reporting
========================================================= */

document.addEventListener("DOMContentLoaded", initializeAllocationPage);

const SCENARIO_URL = "../assets/data/disaster-scenario.json";

let scenarioData = null;
let allocationChart = null;
let allocationHasRun = false;

const RESOURCE_LABELS = {
  food: "Food Kits",
  water: "Water (L)",
  medical: "Medical Kits",
  rescue: "Rescue Boats",
  shelter: "Shelter Units",
};

const RESOURCE_ICONS = {
  food: "fa-box",
  water: "fa-droplet",
  medical: "fa-kit-medical",
  rescue: "fa-ship",
  shelter: "fa-house",
};
/* =========================================================
   INITIALIZATION
========================================================= */

async function initializeAllocationPage() {
  if (!document.getElementById("calculateAllocation")) return;
  try {
    showAllocationMessage("Loading simulated disaster scenario...", "info");

    const response = await fetch(SCENARIO_URL);

    if (!response.ok) {
      throw new Error("Scenario file could not be loaded.");
    }

    scenarioData = await response.json();

    validateScenario();

    renderAllocationKPIs();
    renderHubInventory();
    renderLocationPriorities();
    renderResourceComparisonChart();

    const calculateButton = document.getElementById("calculateAllocation");

    if (calculateButton) {
      calculateButton.addEventListener("click", calculateAllocation);
    }

    showAllocationMessage(
      "Scenario loaded. Select Calculate Allocation to run the simulation.",
      "success",
    );
  } catch (error) {
    console.error("AVERTIQ allocation initialization error:", error);

    showAllocationMessage(
      "Unable to load the scenario. Check disaster-scenario.json and Live Server.",
      "error",
    );
  }
}

/* =========================================================
   VALIDATION
========================================================= */

function validateScenario() {
  if (!scenarioData || !Array.isArray(scenarioData.locations)) {
    throw new Error("Scenario must contain a locations array.");
  }

  if (!Array.isArray(scenarioData.hubs) || scenarioData.hubs.length === 0) {
    throw new Error("At least one relief hub is required.");
  }

  if (!Array.isArray(scenarioData.roads)) {
    throw new Error("Scenario must contain a roads array.");
  }

  const ids = new Set();

  [...scenarioData.hubs, ...scenarioData.locations].forEach(function (node) {
    if (!node.id || ids.has(node.id)) {
      throw new Error("Every hub and location must have a unique ID.");
    }

    ids.add(node.id);
  });

  scenarioData.locations.forEach(function (location) {
    if (!location.requiredResources) {
      throw new Error(`Location ${location.id} is missing requiredResources.`);
    }
  });
}

/* =========================================================
   SAFE HTML AND DATA HELPERS
========================================================= */

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, function (character) {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };

    return entities[character];
  });
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 1,
  });
}

function getLocations() {
  return scenarioData.locations;
}

function getHubs() {
  return scenarioData.hubs;
}

function getRoads() {
  return scenarioData.roads || [];
}

function getHubInventory(hub) {
  return hub.inventory || hub.resources || {};
}

function getLocationName(location) {
  return location.name || location.id || "Unknown location";
}

function getResourceKeys() {
  const keys = new Set();

  getHubs().forEach(function (hub) {
    Object.keys(getHubInventory(hub)).forEach(function (key) {
      keys.add(key);
    });
  });

  getLocations().forEach(function (location) {
    Object.keys(location.requiredResources || {}).forEach(function (key) {
      keys.add(key);
    });
  });

  return Array.from(keys);
}

function getSeverityLabel(value) {
  const severity = Number(value);

  if (severity >= 5) return "Critical";
  if (severity >= 4) return "High";
  if (severity >= 3) return "Medium";

  return "Low";
}

function getSeverityClass(value) {
  return getSeverityLabel(value).toLowerCase();
}

function getNonNegativeNumber(value) {
  const number = Number(value);

  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

/* =========================================================
   PRIORITY SCORING
========================================================= */

/*
   Illustrative demo formula:
   Severity              35%
   Urgency               25%
   Affected population   20%
   Vulnerable population 20%

   This is not a validated real-world emergency model.
*/

function getPriorityScore(location) {
  const locations = getLocations();

  const maxAffected = Math.max(
    1,
    ...locations.map((item) => getNonNegativeNumber(item.affectedPopulation)),
  );

  const maxVulnerable = Math.max(
    1,
    ...locations.map((item) => getNonNegativeNumber(item.vulnerablePopulation)),
  );

  const severity = Math.min(
    100,
    (getNonNegativeNumber(location.severity) / 5) * 100,
  );

  const urgency = Math.min(
    100,
    (getNonNegativeNumber(location.urgency) / 5) * 100,
  );

  const affected = Math.min(
    100,
    (getNonNegativeNumber(location.affectedPopulation) / maxAffected) * 100,
  );

  const vulnerable = Math.min(
    100,
    (getNonNegativeNumber(location.vulnerablePopulation) / maxVulnerable) * 100,
  );

  const weights = scenarioData.simulationSettings?.priorityWeights || {};

  const severityWeight = getNonNegativeNumber(weights.severity ?? 0.35);
  const urgencyWeight = getNonNegativeNumber(weights.urgency ?? 0.25);
  const affectedWeight = getNonNegativeNumber(
    weights.affectedPopulation ?? 0.2,
  );
  const vulnerableWeight = getNonNegativeNumber(
    weights.vulnerablePopulation ?? 0.2,
  );

  const totalWeight =
    severityWeight + urgencyWeight + affectedWeight + vulnerableWeight;

  if (totalWeight <= 0) return 0;

  const score =
    (severity * severityWeight +
      urgency * urgencyWeight +
      affected * affectedWeight +
      vulnerable * vulnerableWeight) /
    totalWeight;

  return Math.round(score * 10) / 10;
}

function getSortedLocations() {
  return [...getLocations()].sort(function (a, b) {
    return (
      getPriorityScore(b) - getPriorityScore(a) ||
      getNonNegativeNumber(b.affectedPopulation) -
        getNonNegativeNumber(a.affectedPopulation)
    );
  });
}

/* =========================================================
   KPI CARDS
========================================================= */

function setText(id, value) {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = value;
  }
}

function renderAllocationKPIs(unservedCount = null) {
  setText("resourceCategoryCount", getResourceKeys().length);
  setText("hubCount", getHubs().length);
  setText("affectedLocationCount", getLocations().length);

  setText(
    "unservedLocationCount",
    unservedCount === null ? getLocations().length : unservedCount,
  );
}

/* =========================================================
   HUB INVENTORY TABLE
========================================================= */

function renderHubInventory() {
  const tableBody = document.getElementById("hubInventoryBody");

  if (!tableBody) return;

  const resourceKeys = getResourceKeys();

  const table = tableBody.closest("table");
  const tableHead = table?.querySelector("thead");

  if (tableHead) {
    tableHead.innerHTML = `
      <tr>
        <th>Relief Hub</th>
        <th>Capacity</th>
        ${resourceKeys
          .map((key) => `<th>${escapeHTML(RESOURCE_LABELS[key] || key)}</th>`)
          .join("")}
      </tr>
    `;
  }

  if (resourceKeys.length === 0) {
    tableBody.innerHTML = `
      <tr><td colspan="6">No resource inventory found.</td></tr>
    `;
    return;
  }

  tableBody.innerHTML = getHubs()
    .map(function (hub) {
      const inventory = getHubInventory(hub);

      return `
        <tr>
          <td>
            <strong>${escapeHTML(hub.name || hub.id)}</strong>
            <small>${escapeHTML(hub.id)}</small>
          </td>
          <td>${formatNumber(hub.capacity)}</td>
          ${resourceKeys
            .map((key) => `<td>${formatNumber(inventory[key] || 0)}</td>`)
            .join("")}
        </tr>
      `;
    })
    .join("");
}

/* =========================================================
   LOCATION PRIORITY TABLE
========================================================= */

function renderLocationPriorities(results = null) {
  const tableBody = document.getElementById("locationPriorityBody");

  if (!tableBody) return;

  const resultByLocation = new Map();

  (results || []).forEach(function (result) {
    resultByLocation.set(result.locationId, result);
  });

  tableBody.innerHTML = getSortedLocations()
    .map(function (location, index) {
      const result = resultByLocation.get(location.id);

      let statusLabel = "Pending";
      let statusClass = "pending";

      if (result) {
        const fullyCovered =
          !result.inaccessible &&
          result.coveredPopulation >= result.affectedPopulation &&
          result.unmetResourceCount === 0;

        if (result.inaccessible) {
          statusLabel = "No Route";
          statusClass = "unserved";
        } else if (fullyCovered) {
          statusLabel = "Fully Allocated";
          statusClass = "allocated";
        } else if (
          result.coveredPopulation > 0 ||
          result.allocatedResourceCount > 0
        ) {
          statusLabel = "Partial";
          statusClass = "partial";
        } else {
          statusLabel = "Unserved";
          statusClass = "unserved";
        }
      }

      return `
        <tr>
          <td>${index + 1}</td>
          <td>
            <strong>${escapeHTML(getLocationName(location))}</strong>
            <small>${escapeHTML(location.id)}</small>
          </td>
          <td>
            <span class="severity-badge ${getSeverityClass(location.severity)}">
              ${escapeHTML(getSeverityLabel(location.severity))}
            </span>
          </td>
          <td>${formatNumber(location.affectedPopulation)}</td>
          <td>
            <strong>${getPriorityScore(location).toFixed(1)}</strong>
            <small>/ 100</small>
          </td>
          <td>
            <span class="status-badge ${statusClass}">
              ${statusLabel}
            </span>
          </td>
        </tr>
      `;
    })
    .join("");
}

/* =========================================================
   RESOURCE COMPARISON CHART
========================================================= */

function renderResourceComparisonChart() {
  const canvas = document.getElementById("allocationChart");

  if (!canvas || typeof Chart === "undefined") return;

  const resourceKeys = getResourceKeys();

  const availableData = resourceKeys.map(function (key) {
    return getHubs().reduce(function (total, hub) {
      return total + getNonNegativeNumber(getHubInventory(hub)[key]);
    }, 0);
  });

  const demandData = resourceKeys.map(function (key) {
    return getLocations().reduce(function (total, location) {
      return total + getNonNegativeNumber(location.requiredResources?.[key]);
    }, 0);
  });

  if (allocationChart) {
    allocationChart.destroy();
  }

  allocationChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: resourceKeys.map((key) => RESOURCE_LABELS[key] || key),
      datasets: [
        {
          label: "Available Inventory",
          data: availableData,
          backgroundColor: "#0891b2",
          borderRadius: 6,
        },
        {
          label: "Total Demand",
          data: demandData,
          backgroundColor: "#f59e0b",
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: (context) =>
              `${context.dataset.label}: ${formatNumber(context.raw)}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          beginAtZero: true,
          ticks: { precision: 0 },
        },
      },
    },
  });
}

/* =========================================================
   ROAD NETWORK AND DIJKSTRA ROUTING
========================================================= */

function getNodeId(value) {
  if (value && typeof value === "object") {
    return value.id || value.locationId || value.hubId || "";
  }

  return String(value || "");
}

function getRoadEndpoints(road) {
  return {
    from: getNodeId(road.from || road.source || road.fromId),
    to: getNodeId(road.to || road.target || road.toId),
  };
}

function isRoadBlocked(road) {
  return (
    road.blocked === true ||
    String(road.status || "").toLowerCase() === "blocked"
  );
}

function getRoadDistance(road) {
  const distance = Number(
    road.distanceKm ?? road.distance ?? road.lengthKm ?? 1,
  );

  return Number.isFinite(distance) && distance >= 0 ? distance : 1;
}

function buildRoadGraph() {
  const graph = new Map();

  function addNode(id) {
    if (id && !graph.has(id)) {
      graph.set(id, []);
    }
  }

  getHubs().forEach((hub) => addNode(hub.id));
  getLocations().forEach((location) => addNode(location.id));

  getRoads().forEach(function (road) {
    const endpoints = getRoadEndpoints(road);

    if (!endpoints.from || !endpoints.to) return;

    addNode(endpoints.from);
    addNode(endpoints.to);

    if (isRoadBlocked(road)) return;

    const distance = getRoadDistance(road);

    graph.get(endpoints.from).push({
      node: endpoints.to,
      distance,
    });

    graph.get(endpoints.to).push({
      node: endpoints.from,
      distance,
    });
  });

  return graph;
}

function findShortestPath(graph, startId, targetId) {
  if (!graph.has(startId) || !graph.has(targetId)) {
    return null;
  }

  const distances = new Map();
  const previous = new Map();
  const unvisited = new Set(graph.keys());

  graph.forEach(function (_, nodeId) {
    distances.set(nodeId, Infinity);
  });

  distances.set(startId, 0);

  while (unvisited.size > 0) {
    let currentNode = null;
    let shortestDistance = Infinity;

    unvisited.forEach(function (nodeId) {
      const distance = distances.get(nodeId);

      if (distance < shortestDistance) {
        shortestDistance = distance;
        currentNode = nodeId;
      }
    });

    if (currentNode === null || shortestDistance === Infinity) {
      break;
    }

    if (currentNode === targetId) {
      break;
    }

    unvisited.delete(currentNode);

    (graph.get(currentNode) || []).forEach(function (edge) {
      if (!unvisited.has(edge.node)) return;

      const alternative = shortestDistance + edge.distance;

      if (alternative < distances.get(edge.node)) {
        distances.set(edge.node, alternative);
        previous.set(edge.node, currentNode);
      }
    });
  }

  const distance = distances.get(targetId);

  if (!Number.isFinite(distance)) return null;

  const path = [];
  let current = targetId;

  while (current) {
    path.unshift(current);

    if (current === startId) break;

    current = previous.get(current);
  }

  if (path[0] !== startId) return null;

  return { distance, path };
}

/*
  Returns every reachable hub, ordered by shortest distance.
  Capacity is checked separately during allocation.
*/

function findReachableHubs(location, graph, hubCapacities) {
  return getHubs()
    .map(function (hub) {
      const route = findShortestPath(graph, hub.id, location.id);

      if (!route) return null;

      return {
        hub,
        distance: route.distance,
        path: route.path,
        remainingCapacity: getNonNegativeNumber(hubCapacities.get(hub.id)),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distance - b.distance);
}

/* =========================================================
   ALLOCATION RESULTS
========================================================= */

/* =========================================================
   ALLOCATION ENGINE — MULTI-HUB RESOURCE ALLOCATION
   Demo simulation only. Not for real emergency dispatch.

   - Priority-based, round-robin population coverage
   - Resource inventory can be pooled across reachable hubs
   - Resource demands are allocated independently
   - Hub capacity is tracked separately
   - Blocked roads are excluded from routing
   - Original scenario JSON is never modified
========================================================= */

function calculateAllocation(options = {}) {
  const originalScenarioData = scenarioData;
  const externalScenario = options && options.scenario;
  const shouldRender = !(options && options.render === false);
  if (externalScenario) scenarioData = externalScenario;
  if (!scenarioData) {
    if (shouldRender)
      showAllocationMessage("Scenario data is not loaded yet.", "error");
    return null;
  }

  const button = shouldRender
    ? document.getElementById("calculateAllocation")
    : null;

  if (button) {
    button.disabled = true;
    button.textContent = "Calculating...";
  }

  try {
    const graph = buildRoadGraph();
    const resourceKeys = getResourceKeys();
    const locations = getSortedLocations();
    const hubs = getHubs();

    /*
      Create fresh inventory and capacity ledgers for every run.
      Do not mutate scenarioData or its nested objects.
    */
    const hubStocks = new Map();
    const hubCapacities = new Map();

    hubs.forEach(function (hub) {
      const inventory = getHubInventory(hub);
      const stock = {};

      resourceKeys.forEach(function (key) {
        stock[key] = getNonNegativeNumber(inventory[key]);
      });

      hubStocks.set(hub.id, stock);
      hubCapacities.set(hub.id, getNonNegativeNumber(hub.capacity));
    });

    /*
      Prepare locations and shortest accessible routes.
    */
    const plans = locations.map(function (location) {
      const demand = {};

      resourceKeys.forEach(function (key) {
        demand[key] = getNonNegativeNumber(location.requiredResources?.[key]);
      });

      return {
        location,
        population: getNonNegativeNumber(location.affectedPopulation),
        priority: getPriorityScore(location),
        demand,
        reachableHubs: findReachableHubs(location, graph, hubCapacities),
      };
    });

    /*
      Initialize result objects.
    */
    const resultsById = new Map();

    plans.forEach(function (plan) {
      const allocations = {};
      const unmet = {};

      resourceKeys.forEach(function (key) {
        allocations[key] = 0;
        unmet[key] = plan.demand[key];
      });

      resultsById.set(plan.location.id, {
        locationId: plan.location.id,
        locationName: getLocationName(plan.location),
        priorityScore: plan.priority,
        severity: getSeverityLabel(plan.location.severity),
        affectedPopulation: plan.population,
        coveredPopulation: 0,
        remainingPopulation: plan.population,
        hubId: null,
        hubName: null,
        distance: null,
        path: [],
        assignments: [],
        inaccessible: plan.reachableHubs.length === 0,
        allocations,
        unmet,
        allocatedResourceCount: 0,
        unmetResourceCount: 0,
      });
    });

    /*
      STEP A — Allocate resources independently.

      Each location's demand for each resource is processed
      independently. If one hub lacks a resource, the engine
      checks other reachable hubs, nearest first.

      This avoids one resource shortage preventing other
      available resources from being allocated.

      Resource assignments do not consume people-capacity units.
      Capacity is tracked separately in Step B.
    */
    plans.forEach(function (plan) {
      const result = resultsById.get(plan.location.id);

      if (plan.reachableHubs.length === 0) {
        return;
      }

      resourceKeys.forEach(function (key) {
        let remainingDemand = plan.demand[key];

        if (remainingDemand <= 0) {
          result.unmet[key] = 0;
          return;
        }

        for (const candidate of plan.reachableHubs) {
          if (remainingDemand <= 0) break;

          const hubId = candidate.hub.id;
          const stock = hubStocks.get(hubId);

          if (!stock) continue;

          const available = getNonNegativeNumber(stock[key]);

          if (available <= 0) continue;

          const supplied = Math.min(remainingDemand, available);

          stock[key] = Math.max(0, available - supplied);

          result.allocations[key] += supplied;
          remainingDemand -= supplied;

          /*
            Record which hubs supplied resources.

            Multiple resources from the same hub are combined
            into a single assignment entry.
          */
          let assignment = result.assignments.find(function (item) {
            return item.hubId === hubId;
          });

          if (!assignment) {
            assignment = {
              hubId,
              hubName: candidate.hub.name || hubId,
              distance: candidate.distance,
              path: candidate.path,
              coveredPopulation: 0,
              allocations: Object.fromEntries(
                resourceKeys.map(function (resourceKey) {
                  return [resourceKey, 0];
                }),
              ),
            };

            result.assignments.push(assignment);
          }

          assignment.allocations[key] += supplied;
        }

        result.unmet[key] = Math.max(
          0,
          plan.demand[key] - result.allocations[key],
        );
      });
    });

    /*
      STEP B — Estimate population capacity coverage.

      This is a separate simulation metric. Hub capacity does
      not represent a validated people-per-resource conversion.

      Locations receive capacity in priority order, in small
      batches. Capacity can be pooled across reachable hubs.
      Resource inventory is NOT consumed again here.
    */
    const BATCH_SIZE = 10;
    let capacityProgress = true;

    while (capacityProgress) {
      capacityProgress = false;

      for (const plan of plans) {
        if (plan.population <= 0) continue;
        if (plan.reachableHubs.length === 0) continue;

        const result = resultsById.get(plan.location.id);

        if (result.coveredPopulation >= plan.population) {
          continue;
        }

        const batchPeople = Math.min(
          BATCH_SIZE,
          plan.population - result.coveredPopulation,
        );

        const capacityHubs = plan.reachableHubs.filter(function (candidate) {
          return getNonNegativeNumber(hubCapacities.get(candidate.hub.id)) > 0;
        });

        const totalReachableCapacity = capacityHubs.reduce(function (
          sum,
          candidate,
        ) {
          return (
            sum + getNonNegativeNumber(hubCapacities.get(candidate.hub.id))
          );
        }, 0);

        if (totalReachableCapacity < batchPeople) {
          /*
            The reachable hubs collectively cannot support
            this complete batch. Try the next location.
          */
          continue;
        }

        let peopleToAssign = batchPeople;

        /*
          Consume capacity across multiple reachable hubs.
          Nearest hubs are used first.
        */
        for (const candidate of capacityHubs) {
          if (peopleToAssign <= 0) break;

          const hubId = candidate.hub.id;
          const remainingCapacity = getNonNegativeNumber(
            hubCapacities.get(hubId),
          );

          if (remainingCapacity <= 0) continue;

          const suppliedPeople = Math.min(peopleToAssign, remainingCapacity);

          hubCapacities.set(
            hubId,
            Math.max(0, remainingCapacity - suppliedPeople),
          );

          let assignment = result.assignments.find(function (item) {
            return item.hubId === hubId;
          });

          if (!assignment) {
            assignment = {
              hubId,
              hubName: candidate.hub.name || hubId,
              distance: candidate.distance,
              path: candidate.path,
              coveredPopulation: 0,
              allocations: Object.fromEntries(
                resourceKeys.map(function (key) {
                  return [key, 0];
                }),
              ),
            };

            result.assignments.push(assignment);
          }

          assignment.coveredPopulation += suppliedPeople;

          result.coveredPopulation += suppliedPeople;
          peopleToAssign -= suppliedPeople;
        }

        if (peopleToAssign === 0) {
          capacityProgress = true;
        }
      }
    }

    /*
      STEP C — Finalize results.
    */
    const results = plans.map(function (plan) {
      const result = resultsById.get(plan.location.id);

      resourceKeys.forEach(function (key) {
        result.allocations[key] = Math.min(
          plan.demand[key],
          getNonNegativeNumber(result.allocations[key]),
        );

        result.unmet[key] = Math.max(
          0,
          plan.demand[key] - result.allocations[key],
        );
      });

      result.allocatedResourceCount = resourceKeys.filter(function (key) {
        return result.allocations[key] > 0;
      }).length;

      result.unmetResourceCount = resourceKeys.filter(function (key) {
        return result.unmet[key] > 0;
      }).length;

      result.remainingPopulation = Math.max(
        0,
        result.affectedPopulation - result.coveredPopulation,
      );

      /*
        Preserve the existing renderer's expected summary fields.
      */
      if (result.assignments.length > 0) {
        result.hubId = result.assignments
          .map(function (item) {
            return item.hubId;
          })
          .join(", ");

        result.hubName = result.assignments
          .map(function (item) {
            return item.hubName;
          })
          .join(", ");

        result.distance = result.assignments.reduce(function (sum, item) {
          return sum + item.distance;
        }, 0);

        result.path = result.assignments.flatMap(function (item) {
          return item.path;
        });
      }

      return result;
    });

    allocationHasRun = true;

    /*
      A location is unserved or partially served if it has
      unmet population capacity or unmet resource demand.
    */
    const unservedCount = results.filter(function (result) {
      return (
        result.inaccessible ||
        result.coveredPopulation < result.affectedPopulation ||
        result.unmetResourceCount > 0
      );
    }).length;

    if (shouldRender) {
      renderAllocationKPIs(unservedCount);
      renderLocationPriorities(results);
      renderAllocationResults(results);

      showAllocationMessage(
        "Simulation completed. Resource allocation and population " +
          "capacity were calculated separately. Blocked roads were avoided.",
        "success",
      );
    }

    /*
      Console summary.
    */
    console.table(
      results.map(function (result) {
        const fullyCovered =
          !result.inaccessible &&
          result.coveredPopulation >= result.affectedPopulation &&
          result.unmetResourceCount === 0;

        return {
          location: result.locationName,
          priority: result.priorityScore,
          hubs: result.hubName || "None",
          affected: result.affectedPopulation,
          capacityCovered: result.coveredPopulation,
          unmetResources: result.unmetResourceCount,
          status: result.inaccessible
            ? "No Accessible Route"
            : fullyCovered
              ? "Fully Allocated"
              : result.coveredPopulation > 0 ||
                  result.allocatedResourceCount > 0
                ? "Partial Allocation"
                : "Unmet Demand",
        };
      }),
    );

    /*
      Resource totals: initial stock, allocated stock and
      remaining stock. The source JSON is not mutated.
    */
    console.log("========== AVERTIQ ALLOCATION DEBUG ==========");

    console.log("Resource Availability vs Demand:");

    console.table(
      resourceKeys.map(function (key) {
        const available = hubs.reduce(function (sum, hub) {
          return sum + getNonNegativeNumber(getHubInventory(hub)[key]);
        }, 0);

        const demand = plans.reduce(function (sum, plan) {
          return sum + plan.demand[key];
        }, 0);

        const allocated = results.reduce(function (sum, result) {
          return sum + result.allocations[key];
        }, 0);

        return {
          resource: RESOURCE_LABELS[key] || key,
          available,
          demand,
          allocated,
          remainingStock: Math.max(0, available - allocated),
          unmetDemand: Math.max(0, demand - allocated),
        };
      }),
    );

    console.log("Per-Location Allocation Details:");

    console.table(
      results.map(function (result) {
        return {
          location: result.locationName,
          priority: result.priorityScore,
          affectedPopulation: result.affectedPopulation,
          capacityCovered: result.coveredPopulation,
          remainingPopulation: Math.max(
            0,
            result.affectedPopulation - result.coveredPopulation,
          ),
          inaccessible: result.inaccessible,
          allocatedResourceCount: result.allocatedResourceCount,
          unmetResourceCount: result.unmetResourceCount,
          allocations: JSON.stringify(result.allocations),
          unmet: JSON.stringify(result.unmet),
        };
      }),
    );

    console.log("========== END AVERTIQ ALLOCATION DEBUG ==========");
    // ================================================
    // AVERTIQ — HUB UTILIZATION REPORT
    // Demo simulation only
    // ================================================

    console.log("========== HUB UTILIZATION REPORT ==========");

    console.table(
      getHubs().map(function (hub) {
        const originalInventory = getHubInventory(hub);

        const suppliedResources = {};

        getResourceKeys().forEach(function (key) {
          suppliedResources[key] = results.reduce(function (total, result) {
            const suppliedByHub = (result.assignments || [])
              .filter(function (assignment) {
                return assignment.hubId === hub.id;
              })
              .reduce(function (sum, assignment) {
                return sum + Number(assignment.allocations[key] || 0);
              }, 0);

            return total + suppliedByHub;
          }, 0);
        });

        return {
          hub: hub.name || hub.id,
          capacity: getNonNegativeNumber(hub.capacity),
          capacityRemaining: getNonNegativeNumber(hubCapacities.get(hub.id)),
          capacityUsed:
            getNonNegativeNumber(hub.capacity) -
            getNonNegativeNumber(hubCapacities.get(hub.id)),
          initialInventory: JSON.stringify(originalInventory),
          suppliedResources: JSON.stringify(suppliedResources),
        };
      }),
    );

    console.log("========== END HUB UTILIZATION REPORT ==========");
    return results;
  } catch (error) {
    console.error("Allocation calculation error:", error);

    if (shouldRender) {
      showAllocationMessage(
        "Allocation calculation failed. Check the browser console for details.",
        "error",
      );
    }
    return null;
  } finally {
    if (externalScenario) scenarioData = originalScenarioData;
    if (button) {
      button.disabled = false;
      button.textContent = "Calculate Allocation";
    }
  }
}


/* =========================================================
   ALLOCATION RESULTS RENDERER
   Displays population coverage, resource shortages,
   allocation status, and hub routes.
========================================================= */

function renderAllocationResults(results) {
  const container = document.getElementById("allocationResults");

  if (!container) {
    throw new Error('Results container "#allocationResults" was not found.');
  }

  if (!Array.isArray(results)) {
    throw new Error("Allocation results must be an array.");
  }

  if (results.length === 0) {
    container.innerHTML = `
      <div class="allocation-result-card">
        <h3>No allocation results</h3>
        <p>No locations were found in the scenario.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = results
    .map(function (result) {
      const isInaccessible = Boolean(result.inaccessible);

      const population = getNonNegativeNumber(
        result.affectedPopulation,
      );

      const covered = Math.min(
        population,
        getNonNegativeNumber(result.coveredPopulation),
      );

      const remaining = Math.max(0, population - covered);

      const allocatedResourceCount = getNonNegativeNumber(
        result.allocatedResourceCount,
      );

      const unmetResourceCount = getNonNegativeNumber(
        result.unmetResourceCount,
      );

      const hasResourceAllocation = allocatedResourceCount > 0;
      const hasResourceShortage = unmetResourceCount > 0;

      const isPopulationFullyCovered =
        !isInaccessible && remaining === 0;

      const isFullyAllocated =
        isPopulationFullyCovered && !hasResourceShortage;

      const hasPartialService =
        covered > 0 || hasResourceAllocation;

      let status = "Unmet Demand";
      let statusClass = "unserved";

      if (isInaccessible) {
        status = "No Accessible Route";
        statusClass = "unserved";
      } else if (isFullyAllocated) {
        status = "Fully Allocated";
        statusClass = "allocated";
      } else if (hasPartialService) {
        status = "Partial Allocation";
        statusClass = "partial";
      }

      const coveragePercent =
        population > 0
          ? Math.min(100, (covered / population) * 100)
          : 100;

      const resourceRows = Object.keys(result.allocations || {})
        .map(function (key) {
          const allocated = getNonNegativeNumber(
            result.allocations[key],
          );

          const unmet = getNonNegativeNumber(
            result.unmet?.[key],
          );

          return `
            <div class="allocation-resource-row">
              <span>
                ${escapeHTML(RESOURCE_LABELS[key] || key)}
              </span>

              <strong>${formatNumber(allocated)} allocated</strong>

              <small>${formatNumber(unmet)} unmet</small>
            </div>
          `;
        })
        .join("");

      const routeRows = (result.assignments || [])
        .map(function (assignment) {
          const routePath = (assignment.path || [])
            .map(function (nodeId) {
              const hub = getHubs().find(
                (item) => item.id === nodeId,
              );

              const location = getLocations().find(
                (item) => item.id === nodeId,
              );

              return hub?.name || location?.name || nodeId;
            })
            .join(" → ");

          return `
            <div class="allocation-route-info">
              <strong>
                ${escapeHTML(
                  assignment.hubName ||
                    assignment.hubId ||
                    "Unknown Hub",
                )}
              </strong>

              <span>
                Population supported:
                ${formatNumber(assignment.coveredPopulation)}
              </span>

              <span>
                Route distance:
                ${formatNumber(assignment.distance)} km
              </span>

              <div class="allocation-route-path">
                ${escapeHTML(routePath || "Route unavailable")}
              </div>
            </div>
          `;
        })
        .join("");

      return `
        <article class="allocation-result-card">

          <div class="allocation-result-header">
            <div>
              <h3>
                ${escapeHTML(
                  result.locationName || "Unknown Location",
                )}
              </h3>

              <p>
                Priority score:
                <strong>
                  ${formatNumber(result.priorityScore)}/100
                </strong>
              </p>
            </div>

            <span class="status-badge ${statusClass}">
              ${escapeHTML(status)}
            </span>
          </div>

          <div class="allocation-population-summary">
            <div>
              <span>People affected</span>
              <strong>${formatNumber(population)}</strong>
            </div>

            <div>
              <span>People supported</span>
              <strong>${formatNumber(covered)}</strong>
            </div>

            <div>
              <span>People remaining</span>
              <strong>${formatNumber(remaining)}</strong>
            </div>
          </div>

          <div
            class="allocation-coverage-track"
            role="progressbar"
            aria-label="Population coverage"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow="${coveragePercent.toFixed(1)}"
          >
            <div
              class="allocation-coverage-fill"
              style="width: ${coveragePercent.toFixed(1)}%"
            ></div>
          </div>

          <p class="allocation-coverage-label">
            Population coverage:
            ${coveragePercent.toFixed(1)}%
          </p>

          ${
            isInaccessible
              ? `
                <p class="allocation-warning">
                  No accessible hub route exists in the current
                  simulated road network.
                </p>
              `
              : ""
          }

          <h4>Resource Allocation</h4>

          <div class="allocation-resource-list">
            ${
              resourceRows ||
              "<p>No resource allocation data available.</p>"
            }
          </div>

          <h4>Hub Assignments &amp; Routes</h4>

          <div class="allocation-assignment-list">
            ${
              routeRows ||
              "<p>No hubs were assigned to this location.</p>"
            }
          </div>

        </article>
      `;
    })
    .join("");
}


/* =========================================================
   STATUS MESSAGE
========================================================= */

function showAllocationMessage(message, type = "info") {
  const element = document.getElementById("allocationMessage");

  if (!element) {
    console.log(`[AVERTIQ ${type.toUpperCase()}] ${message}`);
    return;
  }

  element.className = `allocation-message ${type}`;
  element.textContent = message;
}

/* =========================================================
   PUBLIC DEBUG HELPERS
========================================================= */

window.AvertIQAllocation = {
  calculate: calculateAllocation,
  calculateForScenario: function (scenario) {
    if (
      !scenario ||
      !Array.isArray(scenario.locations) ||
      !Array.isArray(scenario.hubs) ||
      !Array.isArray(scenario.roads)
    ) {
      console.error("Invalid scenario passed to allocation engine.");
      return null;
    }
    return calculateAllocation({ scenario: scenario, render: false });
  },

  getPriorityScore: function (locationId) {
    if (!scenarioData) return null;

    const location = getLocations().find((item) => item.id === locationId);

    return location ? getPriorityScore(location) : null;
  },

  get hasRun() {
    return allocationHasRun;
  },
};
