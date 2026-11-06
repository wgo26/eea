"use client";

import { useEffect } from "react";

export function ContentProtection() {
    useEffect(() => {
        const handleContextMenu = (e: MouseEvent) => {
            e.preventDefault();
            return false;
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
            const modifier = isMac ? e.metaKey : e.ctrlKey;

            if (
                (modifier && (e.key === "c" || e.key === "C")) ||
                (modifier && (e.key === "a" || e.key === "A")) ||
                (modifier && (e.key === "x" || e.key === "X")) ||
                (modifier && (e.key === "s" || e.key === "S")) ||
                (modifier && (e.key === "u" || e.key === "U")) ||
                (modifier && (e.key === "p" || e.key === "P")) ||
                (e.key === "F12") ||
                (modifier && e.shiftKey && (e.key === "i" || e.key === "I")) ||
                (modifier && e.shiftKey && (e.key === "j" || e.key === "J")) ||
                (modifier && e.shiftKey && (e.key === "c" || e.key === "C"))
            ) {
                e.preventDefault();
                return false;
            }
        };

        const handleCopy = (e: ClipboardEvent) => {
            e.preventDefault();
            e.clipboardData?.setData("text/plain", "");
            return false;
        };

        const handleCut = (e: ClipboardEvent) => {
            e.preventDefault();
            return false;
        };

        const handlePaste = (e: ClipboardEvent) => {
            e.preventDefault();
            return false;
        };

        const handleDragStart = (e: DragEvent) => {
            e.preventDefault();
            return false;
        };

        const handleSelectStart = (e: Event) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }
            e.preventDefault();
            return false;
        };

        document.addEventListener("contextmenu", handleContextMenu);
        document.addEventListener("keydown", handleKeyDown);
        document.addEventListener("copy", handleCopy);
        document.addEventListener("cut", handleCut);
        document.addEventListener("paste", handlePaste);
        document.addEventListener("dragstart", handleDragStart);
        document.addEventListener("selectstart", handleSelectStart);

        const style = document.createElement("style");
        style.textContent = `
            * {
                -webkit-user-select: none !important;
                -moz-user-select: none !important;
                -ms-user-select: none !important;
                user-select: none !important;
                -webkit-touch-callout: none !important;
                -webkit-tap-highlight-color: transparent !important;
            }
            input, textarea, [contenteditable="true"] {
                -webkit-user-select: text !important;
                -moz-user-select: text !important;
                -ms-user-select: text !important;
                user-select: text !important;
            }
            ::selection {
                background: transparent !important;
            }
            ::-moz-selection {
                background: transparent !important;
            }
        `;
        document.head.appendChild(style);

        return () => {
            document.removeEventListener("contextmenu", handleContextMenu);
            document.removeEventListener("keydown", handleKeyDown);
            document.removeEventListener("copy", handleCopy);
            document.removeEventListener("cut", handleCut);
            document.removeEventListener("paste", handlePaste);
            document.removeEventListener("dragstart", handleDragStart);
            document.removeEventListener("selectstart", handleSelectStart);
            document.head.removeChild(style);
        };
    }, []);

    return null;
}