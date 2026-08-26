"use client";

import { Search } from "lucide-react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export default function SearchBox({ value, onChange, placeholder }: Props) {
  return (
    <label className="search-box" aria-label="Search songs">
      <Search size={17} strokeWidth={1.5} />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Search the archive…"}
        className="search-input"
        aria-label="Search songs"
        autoComplete="off"
        spellCheck={false}
      />
      {value && (
        <button
          className="search-clear"
          onClick={() => onChange("")}
          aria-label="Clear search"
          type="button"
        >
          ×
        </button>
      )}
    </label>
  );
}
