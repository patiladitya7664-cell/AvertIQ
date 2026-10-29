"use strict";

/* =====================================================
   AVERTIQ — SETTINGS MODULE
   File: frontend/js/settings.js

   Features:
   1. Save preferences in localStorage
   2. Restore saved preferences
   3. Reset preferences to defaults
   4. Display success and error messages
===================================================== */

document.addEventListener("DOMContentLoaded", function () {
    const SETTINGS_KEY = "avertiqSettings";

    const form = document.getElementById("settingsForm");
    const resetButton = document.getElementById("resetSettings");
    const feedback = document.getElementById("settingsFeedback");
    const toast = document.getElementById("settingsToast");

    if (!form || !resetButton) {
        console.error("AVERTIQ Settings: Required HTML elements were not found.");
        return;
    }

    const fields = {
        operatorName: document.getElementById("operatorName"),
        displayDensity: document.getElementById("displayDensity"),
        refreshInterval: document.getElementById("refreshInterval"),
        defaultMapView: document.getElementById("defaultMapView"),
        showLocationLabels: document.getElementById("showLocationLabels"),
        showBlockedRoads: document.getElementById("showBlockedRoads"),
        severityDisplay: document.getElementById("severityDisplay"),
        showPriorityScores: document.getElementById("showPriorityScores"),
        inAppNotifications: document.getElementById("inAppNotifications"),
        simulationNotifications: document.getElementById("simulationNotifications")
    };

    const defaults = {
        operatorName: "",
        displayDensity: "comfortable",
        refreshInterval: "manual",
        defaultMapView: "standard",
        showLocationLabels: true,
        showBlockedRoads: true,
        severityDisplay: "all",
        showPriorityScores: true,
        inAppNotifications: true,
        simulationNotifications: true
    };

    let toastTimer = null;

    /* -------------------------------------------------
       READ SETTINGS
    ------------------------------------------------- */

    function readSettings() {
        try {
            const saved = localStorage.getItem(SETTINGS_KEY);

            if (!saved) {
                return { ...defaults };
            }

            const parsed = JSON.parse(saved);

            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                return { ...defaults };
            }

            return {
                ...defaults,
                ...parsed
            };
        } catch (error) {
            console.error("Unable to read AVERTIQ settings:", error);
            return { ...defaults };
        }
    }

    /* -------------------------------------------------
       VALIDATE AND NORMALIZE SETTINGS
    ------------------------------------------------- */

    function normalizeSettings(settings) {
        const validDensity = ["comfortable", "compact"];
        const validRefreshIntervals = ["manual", "30", "60", "300"];
        const validMapViews = ["standard", "satellite"];
        const validSeverityViews = ["all", "critical", "high"];

        return {
            operatorName: String(settings.operatorName || "").trim().slice(0, 60),

            displayDensity: validDensity.includes(settings.displayDensity)
                ? settings.displayDensity
                : defaults.displayDensity,

            refreshInterval: validRefreshIntervals.includes(
                String(settings.refreshInterval)
            )
                ? String(settings.refreshInterval)
                : defaults.refreshInterval,

            defaultMapView: validMapViews.includes(settings.defaultMapView)
                ? settings.defaultMapView
                : defaults.defaultMapView,

            showLocationLabels: settings.showLocationLabels !== false,
            showBlockedRoads: settings.showBlockedRoads !== false,

            severityDisplay: validSeverityViews.includes(settings.severityDisplay)
                ? settings.severityDisplay
                : defaults.severityDisplay,

            showPriorityScores: settings.showPriorityScores !== false,
            inAppNotifications: settings.inAppNotifications !== false,
            simulationNotifications: settings.simulationNotifications !== false
        };
    }

    /* -------------------------------------------------
       DISPLAY SETTINGS IN FORM
    ------------------------------------------------- */

    function applySettings(settings) {
        Object.keys(fields).forEach(function (key) {
            const field = fields[key];

            if (!field) {
                return;
            }

            if (field.type === "checkbox") {
                field.checked = Boolean(settings[key]);
            } else {
                field.value = settings[key] ?? defaults[key];
            }
        });
    }

    /* -------------------------------------------------
       COLLECT CURRENT FORM VALUES
    ------------------------------------------------- */

    function collectSettings() {
        const settings = {};

        Object.keys(fields).forEach(function (key) {
            const field = fields[key];

            if (!field) {
                return;
            }

            settings[key] = field.type === "checkbox"
                ? field.checked
                : field.value;
        });

        return normalizeSettings(settings);
    }

    /* -------------------------------------------------
       SHOW FEEDBACK
    ------------------------------------------------- */

    function showFeedback(message, type) {
        if (feedback) {
            feedback.textContent = message;
            feedback.classList.toggle("error", type === "error");
        }

        if (toast) {
            toast.textContent = message;
            toast.classList.add("show");

            if (toastTimer) {
                clearTimeout(toastTimer);
            }

            toastTimer = setTimeout(function () {
                toast.classList.remove("show");
            }, 3000);
        }
    }

    /* -------------------------------------------------
       SAVE SETTINGS
    ------------------------------------------------- */

    function saveSettings(settings) {
        try {
            const normalized = normalizeSettings(settings);

            localStorage.setItem(
                SETTINGS_KEY,
                JSON.stringify(normalized)
            );

            applySettings(normalized);

            return true;
        } catch (error) {
            console.error("Unable to save AVERTIQ settings:", error);
            return false;
        }
    }

    /* -------------------------------------------------
       FORM SUBMISSION
    ------------------------------------------------- */

    form.addEventListener("submit", function (event) {
        event.preventDefault();

        const settings = collectSettings();
        const saved = saveSettings(settings);

        if (saved) {
            showFeedback(
                "Preferences saved successfully in this browser.",
                "success"
            );

            console.info("AVERTIQ settings saved.");
        } else {
            showFeedback(
                "Settings could not be saved. Check browser storage permissions.",
                "error"
            );
        }
    });

    /* -------------------------------------------------
       RESET SETTINGS
    ------------------------------------------------- */

    resetButton.addEventListener("click", function () {
        const confirmed = window.confirm(
            "Reset all AVERTIQ preferences to their default values?"
        );

        if (!confirmed) {
            return;
        }

        const saved = saveSettings(defaults);

        if (saved) {
            showFeedback(
                "Preferences have been reset to their default values.",
                "success"
            );
        } else {
            showFeedback(
                "Unable to reset preferences. Check browser storage permissions.",
                "error"
            );
        }
    });

    /* -------------------------------------------------
       INITIALIZE
    ------------------------------------------------- */

    const initialSettings = readSettings();

    applySettings(initialSettings);

    console.info("AVERTIQ Settings module initialized.");
});
