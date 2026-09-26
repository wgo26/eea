"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
    id: string;
    name: string;
    autoComplete?: string;
    placeholder?: string;
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    showHideLabel: string;
    hideLabel: string;
    onChange?: React.ChangeEventHandler<HTMLInputElement>;
};

/**
 * Password input with a built-in show/hide toggle. The toggle button is
 * type="button" so it never submits the form, and the field value survives
 * the type switch (React reuses the same DOM node when `type` changes).
 */
export function PasswordInput({
    id,
    name,
    autoComplete,
    placeholder,
    required,
    minLength,
    maxLength,
    showHideLabel,
    hideLabel,
    onChange,
}: Props) {
    const [visible, setVisible] = useState(false);
    return (
        <div className="relative">
            <input
                id={id}
                name={name}
                type={visible ? "text" : "password"}
                required={required}
                minLength={minLength}
                maxLength={maxLength}
                autoComplete={autoComplete}
                placeholder={placeholder}
                onChange={onChange}
                className={cn(
                    "flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 pr-11 text-base md:text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                )}
            />
            <button
                type="button"
                tabIndex={-1}
                aria-label={visible ? hideLabel : showHideLabel}
                aria-pressed={visible}
                onClick={() => setVisible((v) => !v)}
                className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                {visible ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                )}
            </button>
        </div>
    );
}
