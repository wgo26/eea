"use client";
/* eslint-disable react-hooks/set-state-in-effect -- debounced author search mirrors the existing dialogs */

import { useEffect, useRef, useState } from "react";
import { searchAuthors } from "@/lib/admin/actions/content";
import type { FormValues } from "./values";

/**
 * Author search (profile author picker) — debounced, shared by every
 * ContentForm mode. Extracted from content-form.tsx so the Classification
 * section owns its only consumer; behavior verbatim.
 */
export function useAuthorSearch(patch: (p: Partial<FormValues>) => void) {
  const [authorQuery, setAuthorQuery] = useState("");
  const [authorResults, setAuthorResults] = useState<
    { id: string; name: string }[]
  >([]);
  const [authorSearching, setAuthorSearching] = useState(false);
  const [authorOpen, setAuthorOpen] = useState(false);
  const authorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (authorTimer.current) clearTimeout(authorTimer.current);
    if (!authorQuery.trim()) {
      setAuthorResults([]);
      setAuthorSearching(false);
      return;
    }
    setAuthorSearching(true);
    authorTimer.current = setTimeout(async () => {
      const res = await searchAuthors(authorQuery.trim());
      setAuthorResults(res);
      setAuthorSearching(false);
    }, 250);
    return () => {
      if (authorTimer.current) clearTimeout(authorTimer.current);
    };
  }, [authorQuery]);

  function pickAuthor(a: { id: string; name: string } | null) {
    if (a) {
      patch({ authorId: a.id, authorName: a.name });
    } else {
      patch({ authorId: null, authorName: "" });
    }
    setAuthorQuery("");
    setAuthorResults([]);
    setAuthorOpen(false);
  }

  return {
    authorQuery,
    setAuthorQuery,
    authorResults,
    authorSearching,
    authorOpen,
    setAuthorOpen,
    pickAuthor,
  };
}

export type AuthorSearch = ReturnType<typeof useAuthorSearch>;
