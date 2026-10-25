import { forwardRef, useEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { CitySuggestion, fetchCitySuggestions } from '@/lib/geo';
import { cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';
import { MapPin } from 'lucide-react';

const inputClasses =
  'block w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm text-charcoal outline-none transition placeholder:text-navy-400 focus:border-azure-500 focus:ring-2 focus:ring-azure-100 disabled:bg-parchment disabled:text-muted aria-[invalid=true]:border-red-400 aria-[invalid=true]:ring-red-100';

interface CityInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string;
  onValueChange: (value: string) => void;
  /** Called with the picked suggestion's postal code, when available. */
  onPick?: (suggestion: CitySuggestion) => void;
  state?: string;
  countryName?: string;
  countryCode?: string;
  invalid?: boolean;
}

/**
 * City field with live suggestions from the geocoding service. The dropdown
 * opens while typing, supports full keyboard navigation, and picking a
 * suggestion simply fills the field â€” the parent form keeps full control of
 * the value through `value` / `onValueChange`.
 */
export const CityInput = forwardRef<HTMLInputElement, CityInputProps>(
  ({ value, onValueChange, onPick, state, countryName, countryCode, invalid, className, disabled, ...props }, ref) => {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [suggestions, setSuggestions] = useState<CitySuggestion[]>([]);
    const [highlighted, setHighlighted] = useState(-1);
    const debouncedQuery = useDebounce(value, 350);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const lastFetchedQuery = useRef<string | null>(null);

    // Search only the debounced value, and only while the user is typing.
    useEffect(() => {
      const query = debouncedQuery.trim();
      if (query.length < 2 || query === lastFetchedQuery.current || !open) {
        if (query.length < 2) {
          setSuggestions([]);
          setLoading(false);
        }
        return;
      }
      lastFetchedQuery.current = query;
      let active = true;
      setLoading(true);
      fetchCitySuggestions(query, { state, countryName, countryCode })
        .then((results) => {
          if (!active) return;
          setSuggestions(results);
          setHighlighted(results.length ? 0 : -1);
          setOpen(results.length > 0);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [debouncedQuery, state, countryName, countryCode, open]);

    // Dismiss on outside click.
    useEffect(() => {
      if (!open) return;
      const onPointerDown = (event: PointerEvent) => {
        if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
      };
      window.addEventListener('pointerdown', onPointerDown);
      return () => window.removeEventListener('pointerdown', onPointerDown);
    }, [open]);

    const pick = (suggestion: CitySuggestion) => {
      onValueChange(suggestion.name);
      onPick?.(suggestion);
      setOpen(false);
      setSuggestions([]);
      setHighlighted(-1);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (!open || !suggestions.length) return;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setHighlighted((current) => (current + 1) % suggestions.length);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setHighlighted((current) => (current - 1 + suggestions.length) % suggestions.length);
      } else if (event.key === 'Enter' && highlighted >= 0) {
        event.preventDefault();
        pick(suggestions[highlighted]);
      } else if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    return (
      <div ref={containerRef} className="relative">
        <div className="relative">
          <input
            ref={ref}
            type="text"
            role="combobox"
            aria-expanded={open && suggestions.length > 0}
            aria-controls="city-suggestion-list"
            aria-autocomplete="list"
            aria-invalid={invalid}
            className={cn(inputClasses, 'pr-9', className)}
            value={value}
            disabled={disabled}
            autoComplete="address-level2"
            onChange={(event) => {
              onValueChange(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            {...props}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted">
            {loading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-brand-600 block" />
            ) : (
              <MapPin className="h-4 w-4" />
            )}
          </span>
        </div>

        {open && suggestions.length > 0 && (
          <ul
            id="city-suggestion-list"
            role="listbox"
            aria-label="City suggestions"
            className="absolute z-20 mt-1.5 max-h-60 w-full overflow-auto rounded-lg border border-line bg-white py-1 shadow-lift"
          >
            {suggestions.map((suggestion, index) => (
              <li key={`${suggestion.name}-${suggestion.context}-${index}`} role="option" aria-selected={index === highlighted}>
                <button
                  type="button"
                  onMouseDown={(event) => {
                    // Fire before the input's blur so the click always registers.
                    event.preventDefault();
                    pick(suggestion);
                  }}
                  onMouseEnter={() => setHighlighted(index)}
                  className={cn(
                    'flex w-full items-start gap-2.5 px-3 py-2 text-left transition',
                    index === highlighted ? 'bg-ivory' : 'bg-white',
                  )}
                >
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-charcoal">{suggestion.name}</span>
                    {suggestion.context && (
                      <span className="block truncate text-xs text-muted">{suggestion.context}</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  },
);

CityInput.displayName = 'CityInput';
