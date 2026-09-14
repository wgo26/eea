"use client";

import { useState } from "react";
import { QrCode } from "lucide-react";
import QRCode from "qrcode";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import type { Dictionary } from "@/lib/i18n";

type QrCopy = Dictionary["qr"];

/**
 * QR-code sharing: renders the page URL as a scannable SVG (generated
 * client-side with the `qrcode` package — no network, no tracking),
 * with a PNG download for print/flyers.
 */
export function QrShareButton({ url, copy }: { url: string; copy: QrCopy }) {
    const [open, setOpen] = useState(false);
    const [svg, setSvg] = useState<string | null>(null);

    async function openDialog() {
        setOpen(true);
        if (!svg) {
            try {
                const rendered = await QRCode.toString(url, {
                    type: "svg",
                    margin: 1,
                    width: 256,
                    color: { dark: "#0f172a", light: "#ffffff" },
                });
                setSvg(rendered);
            } catch {
                setSvg(null);
            }
        }
    }

    function downloadPng() {
        QRCode.toDataURL(url, { margin: 1, width: 512 }).then((href) => {
            const link = document.createElement("a");
            link.href = href;
            link.download = "share-qr.png";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }).catch(() => undefined);
    }

    return (
        <>
            <button
                type="button"
                onClick={openDialog}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
                <QrCode className="h-4 w-4" aria-hidden />
                {copy.button}
            </button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-xs">
                    <DialogHeader>
                        <DialogTitle>{copy.title}</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground">{copy.body}</p>
                    {svg ? (
                        <div
                            className="mx-auto overflow-hidden rounded-lg border border-border bg-white p-2 [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
                            dangerouslySetInnerHTML={{ __html: svg }}
                        />
                    ) : (
                        <p className="py-6 text-center text-sm text-muted-foreground">{url}</p>
                    )}
                    <button
                        type="button"
                        onClick={downloadPng}
                        className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                        {copy.download}
                    </button>
                </DialogContent>
            </Dialog>
        </>
    );
}
