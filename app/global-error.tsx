"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary — renders when the root layout itself fails.
 * It owns its <html>/<body> (no dictionaries available here), so it stays
 * deliberately minimal and bilingual.
 */
export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <html lang="en">
            <body
                style={{
                    alignItems: "center",
                    background: "#fff",
                    color: "#111",
                    display: "flex",
                    flexDirection: "column",
                    fontFamily: "system-ui, sans-serif",
                    justifyContent: "center",
                    margin: 0,
                    minHeight: "100vh",
                    padding: "1.5rem",
                    textAlign: "center",
                }}
            >
                <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>
                    Something went wrong · Une erreur est survenue
                </h1>
                <p style={{ color: "#555", maxWidth: "28rem" }}>
                    Please try again. · Veuillez réessayer.
                </p>
                <button
                    type="button"
                    onClick={reset}
                    style={{
                        background: "#111",
                        border: "none",
                        borderRadius: "0.375rem",
                        color: "#fff",
                        cursor: "pointer",
                        minHeight: "44px",
                        marginTop: "1rem",
                        padding: "0.5rem 1rem",
                    }}
                >
                    Try again · Réessayer
                </button>
            </body>
        </html>
    );
}