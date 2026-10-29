"use strict";

/* =========================================================
   AVERTIQ — MAIN APPLICATION SCRIPT
   File: frontend/js/main.js

   Shared navigation, mobile sidebar, notifications,
   backend health status and global UI interactions.
========================================================= */

document.addEventListener("DOMContentLoaded", initAvertIQ);

function initAvertIQ() {
    setupMobileSidebar();
    setupActiveNavigation();
    setupNotificationButton();
    setupRefreshButton();
    setupCurrentDate();
    checkBackendConnection();
}

/* ---------------------------------------------------------
   1. Mobile sidebar
--------------------------------------------------------- */

function setupMobileSidebar() {
    const sidebar = document.querySelector(".sidebar");

    if (!sidebar) {
        return;
    }

    let overlay = document.querySelector(".sidebar-overlay");

    if (!overlay) {
        overlay = document.createElement("div");
        overlay.className = "sidebar-overlay";
        overlay.setAttribute("aria-hidden", "true");
        document.body.appendChild(overlay);
    }

    let menuButton = document.querySelector(".mobile-menu-button");

    if (!menuButton) {
        menuButton = document.createElement("button");
        menuButton.type = "button";
        menuButton.className = "mobile-menu-button";
        menuButton.setAttribute("aria-label", "Open navigation menu");
        menuButton.setAttribute("aria-expanded", "false");
        menuButton.innerHTML = '<i class="fa-solid fa-bars" aria-hidden="true"></i>';

        const topbarLeft = document.querySelector(".topbar-left");

        if (topbarLeft) {
            topbarLeft.prepend(menuButton);
        }
    }

    function openSidebar() {
        sidebar.classList.add("open");
        overlay.classList.add("active");
        overlay.setAttribute("aria-hidden", "false");
        menuButton.setAttribute("aria-expanded", "true");
        menuButton.setAttribute("aria-label", "Close navigation menu");
        document.body.classList.add("sidebar-open");
    }

    function closeSidebar() {
        sidebar.classList.remove("open");
        overlay.classList.remove("active");
        overlay.setAttribute("aria-hidden", "true");
        menuButton.setAttribute("aria-expanded", "false");
        menuButton.setAttribute("aria-label", "Open navigation menu");
        document.body.classList.remove("sidebar-open");
    }

    menuButton.addEventListener("click", () => {
        if (sidebar.classList.contains("open")) {
            closeSidebar();
        } else {
            openSidebar();
        }
    });

    overlay.addEventListener("click", closeSidebar);

    sidebar.querySelectorAll(".nav-link").forEach(link => {
        link.addEventListener("click", closeSidebar);
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            closeSidebar();
        }
    });

    window.addEventListener("resize", () => {
        if (window.innerWidth > 900) {
            closeSidebar();
        }
    });
}

/* ---------------------------------------------------------
   2. Active navigation
--------------------------------------------------------- */

function setupActiveNavigation() {
    const links = document.querySelectorAll(".nav-link");

    if (!links.length) {
        return;
    }

    const currentPath = window.location.pathname
        .replace(/\\/g, "/")
        .replace(/\/+$/, "");

    links.forEach(link => {
        const href = link.getAttribute("href");

        if (!href || href.startsWith("#")) {
            return;
        }

        try {
            const linkURL = new URL(href, window.location.href);

            const linkPath = linkURL.pathname
                .replace(/\\/g, "/")
                .replace(/\/+$/, "");

            const isCurrentPage = linkPath === currentPath;

            link.classList.toggle("active", isCurrentPage);

            if (isCurrentPage) {
                link.setAttribute("aria-current", "page");
            } else {
                link.removeAttribute("aria-current");
            }
        } catch (error) {
            console.warn("Could not resolve navigation link:", href);
        }
    });
}

/* ---------------------------------------------------------
   3. Notification button
--------------------------------------------------------- */

function setupNotificationButton() {
    const notificationButton = document.querySelector(
        ".notification-button"
    );

    if (!notificationButton) {
        return;
    }

    notificationButton.addEventListener("click", () => {
        if (window.AvertIQUtils) {
            window.AvertIQUtils.showToast(
                "Notification center will be connected in a later step.",
                "info"
            );
        }
    });
}

/* ---------------------------------------------------------
   4. Dashboard refresh button
--------------------------------------------------------- */

function setupRefreshButton() {
    const refreshButton = document.getElementById("refreshDashboard");

    if (!refreshButton) {
        return;
    }

    refreshButton.addEventListener("click", async () => {
        const icon = refreshButton.querySelector("i");

        refreshButton.disabled = true;

        if (icon) {
            icon.classList.add("fa-spin");
        }

        try {
            if (typeof window.loadDashboard === "function") {
                await window.loadDashboard({ showToast: true });
            } else {
                window.location.reload();
            }
        } catch (error) {
            console.error("Dashboard refresh failed:", error);

            window.AvertIQUtils?.showToast(
                "Could not refresh the dashboard.",
                "error"
            );
        } finally {
            refreshButton.disabled = false;

            if (icon) {
                icon.classList.remove("fa-spin");
            }
        }
    });
}

/* ---------------------------------------------------------
   5. Current date
--------------------------------------------------------- */

function setupCurrentDate() {
    const dateElement = document.getElementById("currentDate");

    if (!dateElement) {
        return;
    }

    dateElement.textContent = new Intl.DateTimeFormat("en-IN", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric"
    }).format(new Date());
}

/* ---------------------------------------------------------
   6. Backend connection status
--------------------------------------------------------- */

async function checkBackendConnection() {
    if (!window.AvertIQAPI) {
        console.warn("AvertIQ API service has not been loaded.");
        return;
    }

    const statusElement = document.getElementById("backendStatus");

    if (statusElement) {
        statusElement.textContent = "Checking connection...";
        statusElement.setAttribute("aria-live", "polite");
    }

    const result = await window.AvertIQAPI.checkHealth();

    if (statusElement) {
        statusElement.textContent = result.connected
            ? "Backend connected"
            : "Backend offline";

        statusElement.classList.toggle(
            "status-online",
            result.connected
        );

        statusElement.classList.toggle(
            "status-offline",
            !result.connected
        );
    }

    if (!result.connected) {
        console.info(
            "AvertIQ backend is not connected yet:",
            result.message
        );
    }
}
