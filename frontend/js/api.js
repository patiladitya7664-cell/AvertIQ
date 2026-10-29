"use strict";

/* =========================================================
   AVERTIQ — API SERVICE
   File: frontend/js/api.js

   Connects the Vanilla JavaScript frontend to the
   Node.js + Express backend.
========================================================= */

window.AvertIQAPI = (() => {
    /* -----------------------------------------------------
       1. API configuration
    ----------------------------------------------------- */

    // Resolve the API host from the page host so a phone using the laptop's
    // LAN address connects back to that laptop, rather than to the phone's
    // own localhost. HTTPS deployments should proxy /api on the same origin.
    const DEFAULT_API_BASE_URL = window.location.protocol === "https:"
        ? `${window.location.origin}/api`
        : `${window.location.protocol}//${window.location.hostname || "localhost"}:5000/api`;

    const configuredBaseURL = window.AVERTIQ_API_BASE_URL;

    const API_BASE_URL = (
        typeof configuredBaseURL === "string" &&
        configuredBaseURL.trim()
    )
        ? configuredBaseURL.trim().replace(/\/+$/, "")
        : DEFAULT_API_BASE_URL;

    const DEFAULT_TIMEOUT = 15000;

    /* -----------------------------------------------------
       2. Custom API error
    ----------------------------------------------------- */

    class APIError extends Error {
        constructor(message, status = 0, data = null) {
            super(message);

            this.name = "APIError";
            this.status = status;
            this.data = data;
        }
    }

    /* -----------------------------------------------------
       3. Request helper
    ----------------------------------------------------- */

    async function request(endpoint, options = {}) {
        const {
            method = "GET",
            body,
            headers = {},
            timeout = DEFAULT_TIMEOUT,
            signal,
            authenticated = false
        } = options;

        const cleanEndpoint = String(endpoint || "")
            .replace(/^\/+/, "");

        const url = `${API_BASE_URL}/${cleanEndpoint}`;

        const controller = new AbortController();

        let timedOut = false;

        const timeoutId = window.setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, timeout);

        const abortFromCaller = () => controller.abort();

        if (signal) {
            if (signal.aborted) {
                controller.abort();
            } else {
                signal.addEventListener(
                    "abort",
                    abortFromCaller,
                    { once: true }
                );
            }
        }

        const requestHeaders = {
            Accept: "application/json",
            ...headers
        };

        const requestOptions = {
            method,
            headers: requestHeaders,
            signal: controller.signal
        };

        if (authenticated) {
            const token = getToken();

            if (token) {
                requestHeaders.Authorization = `Bearer ${token}`;
            }
        }

        if (body !== undefined) {
            if (body instanceof FormData) {
                requestOptions.body = body;
            } else {
                requestHeaders["Content-Type"] = "application/json";
                requestOptions.body = JSON.stringify(body);
            }
        }

        try {
            const response = await fetch(url, requestOptions);

            const contentType =
                response.headers.get("content-type") || "";

            let data = null;

            if (contentType.includes("application/json")) {
                data = await response.json();
            } else {
                const text = await response.text();

                data = text ? { message: text } : null;
            }

            if (!response.ok) {
                const message =
                    data?.message ||
                    data?.error ||
                    `Request failed with status ${response.status}`;

                throw new APIError(message, response.status, data);
            }

            return data;
        } catch (error) {
            if (error instanceof APIError) {
                throw error;
            }

            if (timedOut) {
                throw new APIError(
                    "The server took too long to respond. Please try again."
                );
            }

            if (error.name === "AbortError") {
                throw new APIError("The request was cancelled.");
            }

            throw new APIError(
                "Unable to connect to the AvertIQ backend. Check that the server is running."
            );
        } finally {
            window.clearTimeout(timeoutId);

            if (signal) {
                signal.removeEventListener(
                    "abort",
                    abortFromCaller
                );
            }
        }
    }

    /* -----------------------------------------------------
       4. Authentication token helper

       Demo dashboard does not require login yet.
       This helper is available for future authenticated APIs.
    ----------------------------------------------------- */

    function getToken() {
        try {
            return (
                localStorage.getItem("avertiqToken") ||
                localStorage.getItem("token") ||
                ""
            );
        } catch {
            return "";
        }
    }

    /* -----------------------------------------------------
       5. HTTP method helpers
    ----------------------------------------------------- */

    function get(endpoint, options = {}) {
        return request(endpoint, {
            ...options,
            method: "GET"
        });
    }

    function post(endpoint, body, options = {}) {
        return request(endpoint, {
            ...options,
            method: "POST",
            body
        });
    }

    function put(endpoint, body, options = {}) {
        return request(endpoint, {
            ...options,
            method: "PUT",
            body
        });
    }

    function patch(endpoint, body, options = {}) {
        return request(endpoint, {
            ...options,
            method: "PATCH",
            body
        });
    }

    function remove(endpoint, options = {}) {
        return request(endpoint, {
            ...options,
            method: "DELETE"
        });
    }

    /* -----------------------------------------------------
       6. Health check

       Requires the backend to expose GET /api/health.
    ----------------------------------------------------- */

    async function checkHealth() {
        try {
            const data = await get("health");

            return {
                connected: true,
                data,
                message: "Backend connection successful."
            };
        } catch (error) {
            return {
                connected: false,
                data: null,
                message: error.message
            };
        }
    }

    /* -----------------------------------------------------
       7. Public API
    ----------------------------------------------------- */

    return Object.freeze({
        API_BASE_URL,
        APIError,
        request,
        get,
        post,
        put,
        patch,
        delete: remove,
        getToken,
        checkHealth
    });
})();
