"use client";

import { Button } from "@/components/ui/button";

type ShareButtonsProps = {
    url: string;
    title: string;
    /** Optional Pidgin/Camfranglais share text variant (tone overlay, not a locale). */
    shareText?: string;
};

export function ShareButtons({ url, title, shareText }: ShareButtonsProps) {
    const text = shareText ?? title;
    const encodedUrl = encodeURIComponent(url);
    const encodedText = encodeURIComponent(text);

    async function shareNative() {
        if (typeof navigator !== "undefined" && navigator.share) {
            try {
                await navigator.share({ title, text, url });
            } catch {
                // user dismissed
            }
        } else {
            window.open(
                `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
                "_blank"
            );
        }
    }

    return (
        <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={shareNative}>
                Share
            </Button>
            <Button
                variant="outline"
                size="sm"
                onClick={() =>
                    window.open(
                        `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
                        "_blank"
                    )
                }
            >
                WhatsApp
            </Button>
        </div>
    );
}