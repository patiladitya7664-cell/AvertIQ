"use strict";

/**
 * AVERTIQ - Routing Service
 * Dijkstra's shortest-path algorithm.
 * Blocked roads are excluded from route calculations.
 * Uses supplied simulation data, not live traffic data.
 */

function toDistance(value) {
    const distance = Number(value);

    if (!Number.isFinite(distance) || distance < 0) {
        throw new TypeError(
            "Road distance must be a non-negative number."
        );
    }

    return distance;
}

function normalizeRoad(road) {
    if (!road || typeof road !== "object") {
        throw new TypeError("Each road must be an object.");
    }

    const from = String(road.from ?? road.source ?? "").trim();
    const to = String(road.to ?? road.target ?? "").trim();

    if (!from || !to) {
        throw new Error("Every road must have a from and to location.");
    }

    const rawDistance = road.distanceKm ?? road.distance;

    if (rawDistance === undefined || rawDistance === null) {
        throw new Error(`Distance missing for road ${from} -> ${to}.`);
    }

    return {
        from,
        to,
        distance: toDistance(rawDistance),
        blocked:
            road.blocked === true ||
            road.isBlocked === true ||
            String(road.status || "").toLowerCase() === "blocked",
        roadId: road.roadId ?? road.id ?? null
    };
}

function buildGraph(roads = [], options = {}) {
    if (!Array.isArray(roads)) {
        throw new TypeError("roads must be an array.");
    }

    const graph = new Map();
    const directed = options.directed === true;

    function addEdge(from, to, distance, roadId) {
        if (!graph.has(from)) {
            graph.set(from, []);
        }

        // A directed destination may have no outgoing edges of its own,
        // but it still needs to exist as a graph node to be reachable.
        if (!graph.has(to)) {
            graph.set(to, []);
        }

        graph.get(from).push({ to, distance, roadId });
    }

    for (const item of roads) {
        const road = normalizeRoad(item);

        if (road.blocked) {
            continue;
        }

        addEdge(road.from, road.to, road.distance, road.roadId);

        if (!directed) {
            addEdge(road.to, road.from, road.distance, road.roadId);
        }
    }

    return graph;
}

function findNearestUnvisited(distances, visited) {
    let nearest = null;
    let shortest = Infinity;

    for (const [node, distance] of distances.entries()) {
        if (!visited.has(node) && distance < shortest) {
            nearest = node;
            shortest = distance;
        }
    }

    return nearest;
}

function findShortestPath(roads, start, destination, options = {}) {
    const source = String(start ?? "").trim();
    const target = String(destination ?? "").trim();

    if (!source || !target) {
        throw new Error("Start and destination are required.");
    }

    if (source === target) {
        return {
            found: true,
            distance: 0,
            path: [source],
            roadIds: []
        };
    }

    const graph = buildGraph(roads, options);

    if (!graph.has(source) || !graph.has(target)) {
        return {
            found: false,
            distance: null,
            path: [],
            roadIds: []
        };
    }

    const distances = new Map();
    const previous = new Map();
    const previousRoad = new Map();
    const visited = new Set();

    for (const node of graph.keys()) {
        distances.set(node, Infinity);
    }

    distances.set(source, 0);

    while (true) {
        const current = findNearestUnvisited(distances, visited);

        if (current === null) {
            break;
        }

        if (current === target) {
            break;
        }

        visited.add(current);

        for (const edge of graph.get(current) || []) {
            if (visited.has(edge.to)) {
                continue;
            }

            const candidate = distances.get(current) + edge.distance;
            const existing = distances.get(edge.to) ?? Infinity;

            if (candidate < existing) {
                distances.set(edge.to, candidate);
                previous.set(edge.to, current);
                previousRoad.set(edge.to, edge.roadId);
            }
        }
    }

    const distance = distances.get(target);

    if (!Number.isFinite(distance)) {
        return {
            found: false,
            distance: null,
            path: [],
            roadIds: []
        };
    }

    const path = [];
    const roadIds = [];
    let current = target;

    while (current !== undefined) {
        path.unshift(current);

        if (current === source) {
            break;
        }

        const roadId = previousRoad.get(current);

        if (roadId !== null && roadId !== undefined) {
            roadIds.unshift(roadId);
        }

        current = previous.get(current);
    }

    if (path[0] !== source) {
        return {
            found: false,
            distance: null,
            path: [],
            roadIds: []
        };
    }

    return {
        found: true,
        distance,
        path,
        roadIds
    };
}

function findRoutesFromSource(roads, start, options = {}) {
    const source = String(start ?? "").trim();

    if (!source) {
        throw new Error("Start location is required.");
    }

    const graph = buildGraph(roads, options);
    const distances = new Map();
    const previous = new Map();
    const visited = new Set();

    distances.set(source, 0);

    while (true) {
        const current = findNearestUnvisited(distances, visited);

        if (current === null) {
            break;
        }

        visited.add(current);

        for (const edge of graph.get(current) || []) {
            if (visited.has(edge.to)) {
                continue;
            }

            const candidate = distances.get(current) + edge.distance;
            const existing = distances.get(edge.to) ?? Infinity;

            if (candidate < existing) {
                distances.set(edge.to, candidate);
                previous.set(edge.to, current);
            }
        }
    }

    const routes = [];

    for (const [destination, distance] of distances.entries()) {
        if (destination === source || !Number.isFinite(distance)) {
            continue;
        }

        const path = [];
        let current = destination;

        while (current !== undefined) {
            path.unshift(current);

            if (current === source) {
                break;
            }

            current = previous.get(current);
        }

        if (path[0] === source) {
            routes.push({ destination, distance, path });
        }
    }

    return routes.sort((a, b) => a.distance - b.distance);
}

module.exports = {
    normalizeRoad,
    buildGraph,
    findShortestPath,
    findRoutesFromSource
};
