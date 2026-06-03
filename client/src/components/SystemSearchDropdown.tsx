import { useState, useEffect, useRef } from "react";
import { ChevronDown, Search, X } from "lucide-react";

export interface SearchDropdownItem {
  label: string;
  value?: string;
  description?: string;
  [key: string]: unknown;
}

interface SystemSearchDropdownProps {
  placeholder?: string;
  items: SearchDropdownItem[];
  selectedItem: string | null;
  onSelect: (label: string) => void;
  onSelectItem?: (item: SearchDropdownItem) => void;
  onClear: () => void;
  selectedValue?: string | null;
  searchPlaceholder?: string;
  noResultsMessage?: string;
  emptyMessage?: string;
}

export const SystemSearchDropdown = ({
  placeholder = "Search…",
  items,
  selectedItem,
  onSelect,
  onSelectItem,
  onClear,
  selectedValue,
  searchPlaceholder = "Search…",
  noResultsMessage = "No results",
  emptyMessage = "No items available",
}: SystemSearchDropdownProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter items based on search query
  const filteredItems = searchQuery.trim() === ""
    ? items
    : items.filter((item) =>
        item.label.toLowerCase().includes(searchQuery.toLowerCase())
      );

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [isOpen]);

  const handleSelect = (item: SearchDropdownItem) => {
    onSelect(item.label);
    onSelectItem?.(item);
    setIsOpen(false);
    setSearchQuery("");
  };

  const handleClear = () => {
    onClear();
    setIsOpen(false);
    setSearchQuery("");
  };

  return (
    <div ref={dropdownRef} className="flex flex-col gap-2">
      {/* Trigger row */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm shadow-md hover:bg-gray-50 focus:outline-none"
        >
          <span className="max-w-[200px] truncate text-gray-700">
            {selectedItem ?? placeholder}
          </span>
          <ChevronDown
            className={`h-4 w-4 text-gray-400 transition-transform ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </button>
        {selectedItem && (
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm shadow-md hover:border-red-200 hover:bg-red-50 hover:text-red-700 text-gray-600 focus:outline-none"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="w-72 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          {/* Search input */}
          <div className="border-b border-gray-100 p-2">
            <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              <input
                type="text"
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-400 focus:outline-none"
                autoFocus
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="hover:text-gray-600"
                >
                  <X className="h-3.5 w-3.5 text-gray-400" />
                </button>
              )}
            </div>
          </div>

          {/* Items list */}
          <div className="max-h-60 overflow-y-auto">
            {filteredItems.length === 0 ? (
              <div className="p-3 text-center text-xs text-gray-400">
                {items.length === 0 ? emptyMessage : noResultsMessage}
              </div>
            ) : (
              <ul className="py-1">
                {filteredItems.map((item, idx) => {
                  const itemKey = item.value ?? `${item.label}-${idx}`;
                  const isSelected = selectedValue
                    ? selectedValue === item.value
                    : selectedItem === item.label;

                  return (
                    <li key={itemKey}>
                      <button
                        type="button"
                        onClick={() => handleSelect(item)}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                          isSelected
                            ? "bg-blue-50 text-blue-700 font-medium"
                            : "text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        <span className="block truncate">{item.label}</span>
                        {item.description && (
                          <span className="mt-0.5 block truncate text-xs text-gray-500">
                            {item.description}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
