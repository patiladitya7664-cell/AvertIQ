"use strict";

/* =========================================================
   AVERTIQ — SHARED UTILITIES
   File: frontend/js/utils.js

   Common helpers for formatting, priority scoring,
   resource calculations, validation and UI feedback.
========================================================= */

window.AvertIQUtils = (() => {
  /* -----------------------------------------------------
       1. General helpers
    ----------------------------------------------------- */

  function toNumber(value, fallback = 0) {
    const number = Number(value);

    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, minimum = 0, maximum = 100) {
    const number = toNumber(value, minimum);

    return Math.min(maximum, Math.max(minimum, number));
  }

  function escapeHTML(value) {
    const characters = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return String(value ?? "").replace(
      /[&<>"']/g,
      (character) => characters[character],
    );
  }

  function getElement(id) {
    return document.getElementById(id);
  }

  function setText(id, value) {
    const element = getElement(id);

    if (element) {
      element.textContent = String(value ?? "");
    }
  }

  function setHTML(id, value) {
    const element = getElement(id);

    if (element) {
      element.innerHTML = value;
    }
  }

  /* -----------------------------------------------------
       2. Number and date formatting
    ----------------------------------------------------- */

  function formatNumber(value, maximumFractionDigits = 0) {
    return new Intl.NumberFormat("en-IN", {
      maximumFractionDigits,
    }).format(toNumber(value));
  }

  function formatCompactNumber(value) {
    return new Intl.NumberFormat("en-IN", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(toNumber(value));
  }

  function formatPercentage(value, maximumFractionDigits = 1) {
    return `${toNumber(value).toFixed(maximumFractionDigits)}%`;
  }

  function formatDistance(value) {
    return `${toNumber(value).toFixed(1)} km`;
  }

  function formatDate(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "Not available";
    }

    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
  }

  function formatDateTime(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "Not available";
    }

    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  /* -----------------------------------------------------
       3. Disaster priority score

       Severity and urgency: 1–5
       Population inputs: normalized to 0–100

       Illustrative formula:
       35% severity
       25% urgency
       20% affected population
       20% vulnerable population

       This is a demo scoring model, not a validated
       emergency-response standard.
    ----------------------------------------------------- */

  function calculatePriorityScore(location, populationReference = 1500) {
    if (!location || typeof location !== "object") {
      return 0;
    }

    const severity = clamp((toNumber(location.severity) / 5) * 100);

    const urgency = clamp((toNumber(location.urgency) / 5) * 100);

    const affectedPopulation = clamp(
      (toNumber(location.affectedPopulation) /
        Math.max(1, toNumber(populationReference, 1500))) *
        100,
    );

    const vulnerablePopulation = clamp(
      (toNumber(location.vulnerablePopulation) /
        Math.max(1, toNumber(populationReference, 1500))) *
        100,
    );

    const score =
      severity * 0.35 +
      urgency * 0.25 +
      affectedPopulation * 0.2 +
      vulnerablePopulation * 0.2;

    return Math.round(clamp(score) * 10) / 10;
  }

  function getSeverityLevel(score) {
    const value = toNumber(score);

    if (value >= 80) {
      return "critical";
    }

    if (value >= 60) {
      return "high";
    }

    if (value >= 35) {
      return "moderate";
    }

    return "low";
  }

  function getSeverityLabel(score) {
    const labels = {
      critical: "Critical",
      high: "High",
      moderate: "Moderate",
      low: "Low",
    };

    return labels[getSeverityLevel(score)];
  }

  function sortByPriority(locations) {
    if (!Array.isArray(locations)) {
      return [];
    }

    return [...locations].sort((first, second) => {
      const scoreDifference =
        calculatePriorityScore(second) - calculatePriorityScore(first);

      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      return (
        toNumber(second.affectedPopulation) - toNumber(first.affectedPopulation)
      );
    });
  }

  /* -----------------------------------------------------
       4. Resource calculations
    ----------------------------------------------------- */

  function sumResources(resources) {
    if (!resources || typeof resources !== "object") {
      return 0;
    }

    return Object.values(resources).reduce((total, amount) => {
      return total + Math.max(0, toNumber(amount));
    }, 0);
  }

  function calculateResourceAvailability(hubs, resourceType) {
    if (!Array.isArray(hubs)) {
      return 0;
    }

    return hubs.reduce((total, hub) => {
      return total + Math.max(0, toNumber(hub?.resources?.[resourceType]));
    }, 0);
  }

  function calculateFulfillmentPercentage(required, allocated) {
    const demand = Math.max(0, toNumber(required));
    const supplied = Math.max(0, toNumber(allocated));

    if (demand === 0) {
      return 100;
    }

    return Math.round(clamp((Math.min(supplied, demand) / demand) * 100));
  }

  function calculateUnmetDemand(required, allocated) {
    return Math.max(0, toNumber(required) - toNumber(allocated));
  }

  /* -----------------------------------------------------
       5. Distance helper

       Uses Haversine distance between two coordinates.
       This estimates straight-line distance only.
       Road distance must come from the routing service.
    ----------------------------------------------------- */

  function calculateStraightLineDistance(
    latitude1,
    longitude1,
    latitude2,
    longitude2,
  ) {
    const toRadians = (degrees) => degrees * (Math.PI / 180);

    const lat1 = toRadians(toNumber(latitude1));
    const lat2 = toRadians(toNumber(latitude2));

    const deltaLatitude = toRadians(toNumber(latitude2) - toNumber(latitude1));

    const deltaLongitude = toRadians(
      toNumber(longitude2) - toNumber(longitude1),
    );

    const a =
      Math.sin(deltaLatitude / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLongitude / 2) ** 2;

    const safeA = clamp(a, 0, 1);

    const centralAngle = 2 * Math.atan2(Math.sqrt(safeA), Math.sqrt(1 - safeA));

    return 6371 * centralAngle;
  }

  /* -----------------------------------------------------
       6. Toast notifications
    ----------------------------------------------------- */

  function showToast(message, type = "info", duration = 3500) {
    const container = getElement("toastContainer");

    if (!container) {
      console.info(`[AvertIQ: ${type}] ${message}`);
      return;
    }

    const allowedTypes = ["success", "error", "warning", "info"];

    const safeType = allowedTypes.includes(type) ? type : "info";

    const icons = {
      success: "fa-circle-check",
      error: "fa-circle-exclamation",
      warning: "fa-triangle-exclamation",
      info: "fa-circle-info",
    };

    const toast = document.createElement("div");

    toast.className = `toast toast-${safeType}`;
    toast.setAttribute("role", "status");

    const icon = document.createElement("i");
    icon.className = `fa-solid ${icons[safeType]}`;
    icon.setAttribute("aria-hidden", "true");

    const text = document.createElement("span");
    text.textContent = String(message);

    toast.append(icon, text);
    container.appendChild(toast);

    const safeDuration = Math.max(1000, toNumber(duration, 3500));

    window.setTimeout(() => {
      toast.classList.add("toast-removing");

      window.setTimeout(() => {
        toast.remove();
      }, 250);
    }, safeDuration);
  }

  /* -----------------------------------------------------
       7. Loading and error states
    ----------------------------------------------------- */

  function setLoading(elementOrId, isLoading, message = "Loading...") {
    const element =
      typeof elementOrId === "string" ? getElement(elementOrId) : elementOrId;

    if (!element) {
      return;
    }

    if (isLoading) {
      element.dataset.previousContent = element.innerHTML;
      element.setAttribute("aria-busy", "true");

      const wrapper = document.createElement("div");
      wrapper.className = "loading-state";

      const spinner = document.createElement("i");
      spinner.className = "fa-solid fa-circle-notch fa-spin";
      spinner.setAttribute("aria-hidden", "true");

      const label = document.createElement("span");
      label.textContent = message;

      wrapper.append(spinner, label);
      element.replaceChildren(wrapper);
    } else {
      element.removeAttribute("aria-busy");

      if (
        Object.prototype.hasOwnProperty.call(element.dataset, "previousContent")
      ) {
        element.innerHTML = element.dataset.previousContent;
        delete element.dataset.previousContent;
      }
    }
  }

  function showEmptyState(
    elementOrId,
    message = "No data available yet.",
    iconClass = "fa-box-open",
  ) {
    const element =
      typeof elementOrId === "string" ? getElement(elementOrId) : elementOrId;

    if (!element) {
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "empty-state";

    const icon = document.createElement("i");
    icon.className = `fa-solid ${iconClass}`;
    icon.setAttribute("aria-hidden", "true");

    const text = document.createElement("p");
    text.textContent = message;

    wrapper.append(icon, text);
    element.replaceChildren(wrapper);
  }

  /* -----------------------------------------------------
       8. Safe DOM element creation
    ----------------------------------------------------- */

  function createElement(tagName, options = {}) {
    const element = document.createElement(tagName);

    if (options.className) {
      element.className = options.className;
    }

    if (options.text !== undefined) {
      element.textContent = String(options.text);
    }

    if (options.attributes && typeof options.attributes === "object") {
      Object.entries(options.attributes).forEach(([name, value]) => {
        if (name.startsWith("on") || value === null || value === undefined) {
          return;
        }

        element.setAttribute(name, String(value));
      });
    }

    return element;
  }

  /* -----------------------------------------------------
       9. Public utility API
    ----------------------------------------------------- */

  return Object.freeze({
    toNumber,
    clamp,
    escapeHTML,
    getElement,
    setText,
    setHTML,

    formatNumber,
    formatCompactNumber,
    formatPercentage,
    formatDistance,
    formatDate,
    formatDateTime,

    calculatePriorityScore,
    getSeverityLevel,
    getSeverityLabel,
    sortByPriority,

    sumResources,
    calculateResourceAvailability,
    calculateFulfillmentPercentage,
    calculateUnmetDemand,
    calculateStraightLineDistance,

    showToast,
    setLoading,
    showEmptyState,
    createElement,
  });
})();
